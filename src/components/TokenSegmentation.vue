<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import UiButton from "./UiButton.vue";
import { graphemes } from "../domain/tokenize";
import {
  characterGaps,
  unitCuts,
  partitionText,
  resegmentLine,
  segmentationSummary,
} from "../domain/segmentation";
const cuts = ref<number[]>([]),
  original = ref<number[]>([]),
  activeGap = ref<number | null>(null),
  cutError = ref(""),
  importNotice = ref("");
const row = ref<HTMLDivElement>();
const editing = computed(() => editor.editingText);
const chars = computed(() => graphemes(editor.line?.text ?? ""));
const gaps = computed(() => characterGaps(editor.line?.text ?? ""));
const summary = computed(() =>
  editing.value && editor.line
    ? segmentationSummary(editor.line, cuts.value)
    : null,
);
const changed = computed(
  () => cuts.value.join(",") !== original.value.join(","),
);
let drag: {
  offset: number;
  left: number;
  right: number;
  origin: number;
  moved: boolean;
  /** Pointer travel beyond a click, even when the divider could not move. */
  dragged: boolean;
  startX: number;
  x: number;
} | null = null;
let scrollFrame = 0,
  ignoreClick: number | null = null;
function focusWorkspace() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function select(index: number) {
  if (editor.recordingArmed) editor.pause();
  editor.selectedUnit = index;
  editor.selectionEnd = index;
  focusWorkspace();
}
function begin() {
  if (!editor.line) return;
  editor.stopRecording();
  editor.cancelAudition();
  editor.clearPreview();
  original.value = unitCuts(editor.line);
  cuts.value = [...original.value];
  activeGap.value = null;
  cutError.value = "";
  editor.editingText = true;
  importNotice.value =
    original.value.length !== editor.line.units.length - 1
      ? "导入的字符内分隔线已移除，应用前请检查。"
      : "";
}
function stopDrag() {
  drag = null;
  cancelAnimationFrame(scrollFrame);
}
function cancel() {
  stopDrag();
  editor.editingText = false;
  cutError.value = "";
  focusWorkspace();
}
function valid(next: number[]) {
  try {
    partitionText(editor.line.text, next);
    cutError.value = "";
    return true;
  } catch (error) {
    cutError.value = (error as Error).message;
    return false;
  }
}
function update(next: number[]) {
  next.sort((a, b) => a - b);
  if (!valid(next)) return false;
  cuts.value = next;
  return true;
}
function focusGap(offset: number) {
  void nextTick(() =>
    row.value
      ?.querySelector<HTMLElement>(`[data-gap-offset="${offset}"]`)
      ?.focus(),
  );
}
/** A click toggles: add on an empty gap, remove an existing divider. */
function clickGap(offset: number) {
  if (ignoreClick === offset) {
    ignoreClick = null;
    return;
  }
  if (cuts.value.includes(offset)) remove(offset);
  else if (update([...cuts.value, offset])) {
    activeGap.value = offset;
    focusGap(offset);
  }
}
function remove(offset: number) {
  update(cuts.value.filter((cut) => cut !== offset));
  activeGap.value = null;
}
function groupIndex(charIndex: number) {
  const offset = charIndex === 0 ? 0 : gaps.value[charIndex - 1];
  return cuts.value.filter((cut) => cut <= offset).length;
}
function start(event: PointerEvent, offset: number) {
  if (event.button !== 0 || !cuts.value.includes(offset)) return;
  const index = cuts.value.indexOf(offset);
  activeGap.value = offset;
  drag = {
    offset,
    left: cuts.value[index - 1] ?? 0,
    right: cuts.value[index + 1] ?? editor.line.text.length,
    origin: offset,
    moved: false,
    dragged: false,
    startX: event.clientX,
    x: event.clientX,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  (event.currentTarget as HTMLElement).focus();
  event.stopPropagation();
  autoScroll();
}
function moveTo(x: number) {
  if (!drag || !row.value) return;
  const options = Array.from(
    row.value.querySelectorAll<HTMLElement>("[data-gap-offset]"),
  ).filter(
    (gap) =>
      Number(gap.dataset.gapOffset) > drag!.left &&
      Number(gap.dataset.gapOffset) < drag!.right,
  );
  const nearest = options.sort(
    (a, b) =>
      Math.abs(a.getBoundingClientRect().x + a.offsetWidth / 2 - x) -
      Math.abs(b.getBoundingClientRect().x + b.offsetWidth / 2 - x),
  )[0];
  if (!nearest) return;
  const offset = Number(nearest.dataset.gapOffset);
  if (offset === drag.offset) return;
  if (update(cuts.value.map((cut) => (cut === drag!.offset ? offset : cut)))) {
    drag.offset = offset;
    drag.moved = true;
    activeGap.value = offset;
  }
}
function move(event: PointerEvent) {
  if (!drag) return;
  drag.x = event.clientX;
  if (Math.abs(drag.x - drag.startX) > 4) drag.dragged = true;
  moveTo(event.clientX);
}
function autoScroll() {
  if (!drag || !row.value) return;
  const box = row.value.getBoundingClientRect();
  if (drag.x < box.left + 24) {
    row.value.scrollLeft -= 12;
    moveTo(drag.x);
  } else if (drag.x > box.right - 24) {
    row.value.scrollLeft += 12;
    moveTo(drag.x);
  }
  scrollFrame = requestAnimationFrame(autoScroll);
}
function end() {
  if (drag?.dragged) {
    ignoreClick = drag.origin;
    setTimeout(() => (ignoreClick = null), 350);
  }
  const movedOffset = drag?.moved ? drag.offset : null;
  stopDrag();
  if (movedOffset !== null) focusGap(movedOffset);
}
function key(event: KeyboardEvent, offset?: number) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
    return;
  }
  // Enter on any gap confirms, so it never adds a divider by native click.
  if (
    event.key === "Enter" &&
    (event.target as HTMLElement).closest(".text-gap")
  ) {
    event.preventDefault();
    event.stopPropagation();
    apply();
    return;
  }
  if (offset === undefined || !cuts.value.includes(offset)) return;
  if (["Delete", "Backspace"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    remove(offset);
    return;
  }
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const index = gaps.value.indexOf(offset),
    next = gaps.value[index + (event.key === "ArrowRight" ? 1 : -1)],
    cutIndex = cuts.value.indexOf(offset);
  if (
    next === undefined ||
    next <= (cuts.value[cutIndex - 1] ?? 0) ||
    next >= (cuts.value[cutIndex + 1] ?? editor.line.text.length)
  )
    return;
  if (update(cuts.value.map((cut) => (cut === offset ? next : cut)))) {
    activeGap.value = next;
    focusGap(next);
  }
}
function apply() {
  if (!editor.line) return;
  if (!changed.value) return cancel();
  const selectedOffset = editor.line.units
    .slice(0, editor.selectedUnit)
    .reduce((offset, unit) => offset + unit.text.length, 0);
  if (
    !editor.command("调整文字切分", (p) => {
      const line = p.lines[editor.lineIndex];
      line.units = resegmentLine(line, cuts.value);
    })
  )
    return;
  editor.editingText = false;
  stopDrag();
  const missing = editor.line.units.findIndex((unit) => unit.startMs === null),
    groups = partitionText(editor.line.text, cuts.value);
  editor.selectedUnit =
    missing >= 0
      ? missing
      : Math.max(
          0,
          groups.findIndex(
            (group) =>
              selectedOffset >= group.start && selectedOffset < group.end,
          ),
        );
  editor.selectionEnd = editor.selectedUnit;
  if (missing >= 0) {
    const prior =
      editor.line.units
        .slice(0, missing)
        .reverse()
        .find((unit) => unit.startMs !== null)?.startMs ??
      editor.line.startMs ??
      0;
    editor.seek(Math.max(0, prior - 800));
  }
  focusWorkspace();
}
watch([() => editor.project.activeLineId, () => editor.line?.text], () => {
  stopDrag();
  editor.editingText = false;
});
onBeforeUnmount(() => {
  stopDrag();
  editor.editingText = false;
});
</script>
<template>
  <div v-if="!editing" class="segmentation-row">
    <div class="unit-strip" aria-label="本句切分">
      <button
        v-for="(unit, index) in editor.line.units"
        :key="unit.id"
        :class="{
          recorded: unit.startMs !== null,
          pending: index === editor.cursor && !editor.isComplete,
          selected: index === editor.selectedUnit,
        }"
        :aria-label="`选择单位 ${index + 1}：${unit.text.trim()}`"
        :title="unit.startMs === null ? '待打轴' : formatTime(unit.startMs)"
        @click="select(index)"
      >
        <span>{{ unit.text.trim() }}</span>
      </button>
    </div>
    <div class="unit-tools">
      <UiButton variant="outlined" @click="begin">调整切分</UiButton
      ><UiButton
        variant="text"
        class="text-link"
        @click="
          editor.retime(editor.selectedUnit);
          focusWorkspace();
        "
        >从选中单位重打</UiButton
      >
    </div>
  </div>
  <div
    v-else
    class="segmentation-editor"
    data-editing-text
    aria-label="文字切分调整"
    @keydown="key($event)"
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
    <div
      ref="row"
      class="character-strip"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="stopDrag"
    >
      <template v-for="(char, index) in chars" :key="index"
        ><span
          class="grapheme-cell"
          :class="{ alternate: groupIndex(index) % 2 === 1 }"
          :data-group="groupIndex(index)"
          >{{ char.trim() ? char : "␣" }}</span
        ><button
          v-if="index < chars.length - 1"
          class="text-gap"
          :class="{
            divided: cuts.includes(gaps[index]),
            active: activeGap === gaps[index],
            alternate: groupIndex(index) % 2 === 1,
          }"
          :data-gap-offset="gaps[index]"
          :role="cuts.includes(gaps[index]) ? 'slider' : undefined"
          :aria-label="
            cuts.includes(gaps[index])
              ? `文字分隔线 ${index + 1}`
              : `在第 ${index + 1} 个字符后切分`
          "
          :aria-valuenow="cuts.includes(gaps[index]) ? index + 1 : undefined"
          :aria-valuemin="cuts.includes(gaps[index]) ? 1 : undefined"
          :aria-valuemax="
            cuts.includes(gaps[index]) ? chars.length - 1 : undefined
          "
          :title="
            cuts.includes(gaps[index])
              ? '点击移除；拖动或左右键移动'
              : '点击添加分隔线'
          "
          @pointerdown="start($event, gaps[index])"
          @click="clickGap(gaps[index])"
          @keydown="key($event, gaps[index])"
        >
          <span v-if="!cuts.includes(gaps[index])">+</span>
        </button></template
      >
    </div>
    <p v-if="cutError" class="field-error" role="alert">{{ cutError }}</p>
    <p v-else-if="importNotice" class="field-error" role="alert">
      {{ importNotice }}
    </p>
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
  height: 32px;
  font-size: 12px;
}
.segmentation-heading strong {
  font-weight: 600;
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
.character-strip {
  display: flex;
  align-items: center;
  overflow: auto;
  white-space: pre;
  min-height: 52px;
  padding: 5px 2px;
  scroll-behavior: auto;
}
.grapheme-cell {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 4px 8px;
  min-width: 34px;
  border-radius: 0;
  font-size: 25px;
  background: rgba(var(--mdui-color-primary), 0.13);
}
.grapheme-cell.alternate {
  background: rgba(var(--mdui-color-tertiary), 0.13);
}
.text-gap {
  position: relative;
  flex: 0 0 20px;
  width: 20px;
  height: 39px;
  border: 0;
  padding: 0;
  background: rgba(var(--mdui-color-primary), 0.13);
  touch-action: none;
  color: var(--muted);
  cursor: pointer;
}
.text-gap.alternate {
  background: rgba(var(--mdui-color-tertiary), 0.13);
}
.text-gap > span {
  opacity: 0.35;
}
.text-gap:hover > span,
.text-gap:focus-visible > span {
  opacity: 1;
  color: var(--accent);
}
.text-gap.divided {
  height: 42px;
  background: transparent;
  cursor: ew-resize;
}
.text-gap.divided::before {
  content: "";
  position: absolute;
  inset: 2px auto 2px 50%;
  width: 3px;
  transform: translateX(-50%);
  border-radius: 2px;
  background: var(--accent);
}
.text-gap.divided:hover::before {
  width: 5px;
}
.text-gap.active {
  background: var(--accent-soft);
  border-radius: 4px;
  outline: 1px solid var(--accent);
}
.field-error {
  position: static;
  font-size: 12px;
  margin-top: 4px;
  background: transparent;
}
</style>
