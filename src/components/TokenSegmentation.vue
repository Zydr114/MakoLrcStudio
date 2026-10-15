<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { editor } from "../state/editor";
import {
  activeLines,
  formatTime,
  syllableRefs,
  syllablesOf,
  unitStart,
  type LyricLine,
} from "../domain/model";
import UiButton from "./UiButton.vue";
import UiField from "./UiField.vue";
import DividerStrip from "./DividerStrip.vue";
import {
  unitCuts,
  partitionText,
  resegmentLine,
  segmentationSummary,
} from "../domain/segmentation";
import {
  moraCuts,
  readingCuts,
  readingOf,
  setRuby,
  splitAt,
} from "../domain/ruby";
/** Which editor is open: unit dividers or the reading of one unit. */
const panel = ref<"units" | "ruby" | null>(null);
const cuts = ref<number[]>([]),
  original = ref<number[]>([]),
  cutError = ref(""),
  importNotice = ref("");
const rubyUnit = ref(0),
  reading = ref(""),
  readingSplit = ref<number[]>([]),
  rubyError = ref("");
const open = computed(() => (editor.editingText ? panel.value : null));
const refs = computed(() => (editor.line ? syllableRefs(editor.line) : []));
const summary = computed(() =>
  open.value === "units" && editor.line
    ? segmentationSummary(editor.line, cuts.value)
    : null,
);
const changed = computed(
  () => cuts.value.join(",") !== original.value.join(","),
);
const editedUnit = computed(() => editor.line?.units[rubyUnit.value]);
function focusWorkspace() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
/** The first syllable of a unit, where the selection lands when a unit is clicked. */
function firstSyllable(line: LyricLine, unitIndex: number) {
  return Math.max(
    0,
    syllableRefs(line).findIndex((ref) => ref.unitIndex === unitIndex),
  );
}
const cursorUnit = computed(() => refs.value[editor.cursor]?.unitIndex);
const unitRefs = (unitIndex: number) =>
  refs.value.filter((ref) => ref.unitIndex === unitIndex);
function select(index: number) {
  if (editor.recordingArmed) editor.pause();
  editor.selectedIndex = firstSyllable(editor.line, index);
  focusWorkspace();
}
function selectSyllable(index: number) {
  if (editor.recordingArmed) editor.pause();
  editor.selectedIndex = index;
  focusWorkspace();
}
function openPanel(kind: "units" | "ruby") {
  editor.stopRecording();
  editor.cancelAudition();
  editor.clearPreview();
  panel.value = kind;
  editor.editingText = true;
}
function begin() {
  if (!editor.line) return;
  original.value = unitCuts(editor.line);
  cuts.value = [...original.value];
  cutError.value = "";
  openPanel("units");
  importNotice.value =
    original.value.length !== editor.line.units.length - 1
      ? "导入的字符内分隔线已移除，应用前请检查。"
      : "";
}
function beginRuby() {
  const unitIndex = editor.selectedSyllable?.unitIndex;
  if (!editor.line || unitIndex === undefined) return;
  const unit = editor.line.units[unitIndex];
  rubyUnit.value = unitIndex;
  reading.value = readingOf(unit);
  readingSplit.value = unit.ruby ? readingCuts(unit) : [];
  rubyError.value = "";
  openPanel("ruby");
}
function typeReading(value: string) {
  reading.value = value;
  readingSplit.value = moraCuts(value);
  rubyError.value = "";
}
function cancel() {
  panel.value = null;
  editor.editingText = false;
  cutError.value = "";
  rubyError.value = "";
  focusWorkspace();
}
function checkUnits(next: number[]) {
  partitionText(editor.line.text, next);
}
function checkReading(next: number[]) {
  splitAt(reading.value, next);
}
function apply() {
  if (!editor.line) return;
  if (!changed.value) return cancel();
  const selectedOffset = editor.line.units
    .slice(0, editor.selectedSyllable?.unitIndex ?? 0)
    .reduce((offset, unit) => offset + unit.text.length, 0);
  if (
    !editor.command("调整文字切分", (p) => {
      const line = activeLines(p)[editor.lineIndex];
      line.units = resegmentLine(line, cuts.value);
    })
  )
    return;
  panel.value = null;
  editor.editingText = false;
  const syllables = syllablesOf(editor.line),
    missing = syllables.findIndex((syllable) => syllable.startMs === null),
    groups = partitionText(editor.line.text, cuts.value);
  editor.selectedIndex =
    missing >= 0
      ? missing
      : firstSyllable(
          editor.line,
          Math.max(
            0,
            groups.findIndex(
              (group) =>
                selectedOffset >= group.start && selectedOffset < group.end,
            ),
          ),
        );
  if (missing >= 0) seekBefore(missing);
  focusWorkspace();
}
function seekBefore(index: number) {
  const prior =
    syllablesOf(editor.line)
      .slice(0, index)
      .reverse()
      .find((syllable) => syllable.startMs !== null)?.startMs ??
    editor.line.startMs ??
    0;
  editor.seek(Math.max(0, prior - 800));
}
function applyRuby(remove = false) {
  if (!editor.line) return;
  let pieces: string[] | null = null;
  if (!remove) {
    if (!reading.value.trim()) {
      rubyError.value = "读音不能为空；不需要注音时请点「移除注音」。";
      return;
    }
    try {
      pieces = splitAt(reading.value, readingSplit.value);
    } catch (error) {
      rubyError.value = (error as Error).message;
      return;
    }
  }
  const unitIndex = rubyUnit.value;
  if (
    !editor.command(remove ? "移除注音" : "编辑读音", (p) =>
      setRuby(activeLines(p)[editor.lineIndex], unitIndex, pieces),
    )
  ) {
    rubyError.value = editor.error;
    editor.error = "";
    return;
  }
  panel.value = null;
  editor.editingText = false;
  const missing = editor.cursor;
  const first = firstSyllable(editor.line, unitIndex);
  editor.selectedIndex = missing < first ? missing : first;
  if (syllablesOf(editor.line)[editor.selectedIndex]?.startMs === null)
    seekBefore(editor.selectedIndex);
  focusWorkspace();
}
function editorKey(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }
}
watch([() => editor.project.activeLineId, () => editor.line?.text], () => {
  if (panel.value) cancel();
});
watch(
  () => editor.editingText,
  (editing) => {
    if (!editing) panel.value = null;
  },
);
onBeforeUnmount(() => {
  if (panel.value) editor.editingText = false;
});
</script>
<template>
  <div v-if="!open" class="segmentation-row">
    <div class="unit-strip" aria-label="本句切分">
      <button
        v-for="(unit, index) in editor.line.units"
        :key="unit.id"
        :class="{
          recorded: unitStart(unit) !== null,
          pending: index === cursorUnit && !editor.isComplete,
          selected: index === editor.selectedSyllable?.unitIndex,
          ruby: unit.ruby,
          'auto-ruby': unit.autoRuby,
        }"
        :aria-label="`选择单位 ${index + 1}：${unit.text.trim()}${unit.ruby ? `（${readingOf(unit)}）` : ''}`"
        :title="
          unitStart(unit) === null ? '待打轴' : formatTime(unitStart(unit))
        "
        @click="select(index)"
      >
        <span v-if="unit.ruby" class="strip-reading"
          ><span
            v-for="ref in unitRefs(index)"
            :key="ref.syllable.id"
            class="strip-syllable"
            :class="{
              recorded: ref.syllable.startMs !== null,
              pending: ref.index === editor.cursor && !editor.isComplete,
              selected: ref.index === editor.selectedIndex,
              paused: ref.syllable.endMs !== null,
            }"
            :title="`${ref.syllable.text} · ${ref.syllable.startMs === null ? '待打轴' : formatTime(ref.syllable.startMs)}`"
            @click.stop="selectSyllable(ref.index)"
            >{{ ref.syllable.text }}</span
          ></span
        >
        <span>{{ unit.text.trim() }}</span>
      </button>
    </div>
    <div class="unit-tools">
      <div>
        <UiButton variant="outlined" @click="begin">调整切分</UiButton
        ><UiButton
          variant="text"
          class="text-link"
          :disabled="!editor.selectedSyllable"
          title="为选中单位填写读音，每个音节单独打轴"
          @click="beginRuby"
          >注音</UiButton
        >
      </div>
      <UiButton
        variant="text"
        class="text-link"
        @click="
          editor.retime(editor.selectedIndex);
          focusWorkspace();
        "
        >从选中单位重打</UiButton
      >
    </div>
  </div>
  <div
    v-else-if="open === 'units'"
    class="segmentation-editor"
    data-editing-text
    aria-label="文字切分调整"
    @keydown="editorKey"
  >
    <div class="segmentation-heading">
      <strong>文字切分</strong
      ><span v-if="summary" class="small-note"
        >{{ original.length + 1 }} → {{ summary.count }} · 保留
        {{ summary.retained }} 点<span v-if="summary.addedMissing">
          · 新增 {{ summary.addedMissing }} 处待打</span
        ></span
      >
      <div>
        <UiButton variant="text" @click="cancel">取消切分</UiButton
        ><UiButton variant="filled" :disabled="!changed" @click="apply"
          >应用切分</UiButton
        >
      </div>
    </div>
    <DividerStrip
      v-model:cuts="cuts"
      :text="editor.line.text"
      :check="checkUnits"
      @apply="apply"
      @cancel="cancel"
      @error="cutError = $event"
    />
    <p v-if="cutError" class="field-error" role="alert">{{ cutError }}</p>
    <p v-else-if="importNotice" class="field-error" role="alert">
      {{ importNotice }}
    </p>
  </div>
  <div
    v-else
    class="segmentation-editor ruby-editor"
    data-editing-text
    aria-label="读音编辑"
    @keydown="editorKey"
  >
    <div class="segmentation-heading">
      <strong>注音「{{ editedUnit?.text.trim() }}」</strong
      ><span class="small-note"
        >读音按音拍自动切分，点击字间增删分隔线；每个音节按一次 Enter。</span
      >
      <div>
        <UiButton
          v-if="editedUnit?.ruby"
          variant="text"
          @click="applyRuby(true)"
          >移除注音</UiButton
        ><UiButton variant="text" @click="cancel">取消</UiButton
        ><UiButton variant="filled" @click="applyRuby()">应用读音</UiButton>
      </div>
    </div>
    <div class="ruby-fields">
      <UiField
        :model-value="reading"
        label="读音"
        placeholder="假名或拼音"
        @update:model-value="typeReading"
      />
      <DividerStrip
        v-if="reading.trim()"
        v-model:cuts="readingSplit"
        :text="reading"
        :check="checkReading"
        :large="false"
        @apply="applyRuby()"
        @cancel="cancel"
        @error="rubyError = $event"
      />
    </div>
    <p v-if="rubyError" class="field-error" role="alert">{{ rubyError }}</p>
  </div>
</template>
<style scoped>
.segmentation-editor {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--soft);
  position: relative;
}
.segmentation-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  font-size: 12px;
}
.segmentation-heading strong {
  font-weight: 600;
  white-space: nowrap;
}
.segmentation-heading > div {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.segmentation-heading .small-note {
  font-size: 11px;
}
.ruby-fields {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0 2px;
}
.ruby-fields mdui-text-field {
  flex: 0 0 220px;
}
.field-error {
  position: static;
  font-size: 12px;
  margin-top: 4px;
  background: transparent;
}
.unit-strip button.ruby {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}
.strip-reading {
  display: flex;
  gap: 1px;
  line-height: 1.1;
}
.strip-reading .strip-syllable {
  font-size: 11px;
  padding: 0 2px;
  border-radius: 4px;
  border-bottom: 2px solid transparent;
  color: var(--muted);
}
.strip-syllable + .strip-syllable {
  box-shadow: -1px 0 var(--line);
}
.strip-reading .strip-syllable.recorded {
  color: var(--accent);
}
.strip-reading .strip-syllable.selected {
  background: var(--accent);
  color: var(--on-accent);
}
.strip-reading .strip-syllable.pending {
  border-bottom: 2px dashed var(--accent);
}
.strip-reading .strip-syllable.paused {
  box-shadow: inset -2px 0 var(--accent);
}
.unit-strip button.auto-ruby .strip-reading {
  text-decoration: underline dotted;
}
</style>
