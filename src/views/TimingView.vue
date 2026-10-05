<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { editor } from "../state/editor";
import { completeLine, formatTime } from "../domain/model";
import {
  setLineStart,
  setUnitStart,
  setLineEnd,
  shiftAll,
} from "../domain/edit";
import { playingLineIndex, tokenIntervals } from "../domain/timing";
import UiButton from "../components/UiButton.vue";
import UiSelect from "../components/UiSelect.vue";
import UiToggle from "../components/UiToggle.vue";
import { previewModes } from "../components/controlOptions";
import Icon from "../components/Icon.vue";
import TimeInput from "../components/TimeInput.vue";
import Waveform from "../components/Waveform.vue";
import Modal from "../components/Modal.vue";
import TimingCue from "../components/TimingCue.vue";
import TokenSegmentation from "../components/TokenSegmentation.vue";
import LyricPreview from "../components/LyricPreview.vue";
import SongPreview from "../components/SongPreview.vue";
import LineTextEditor from "../components/LineTextEditor.vue";
const emit = defineEmits<{ audio: [] }>();
const listOpen = ref(false),
  shiftOpen = ref(false),
  songOpen = ref(false),
  textOpen = ref(false),
  shiftMs = ref("0"),
  fillPreview = ref(false);
const playingLine = computed(() =>
  playingLineIndex(editor.displayProject, editor.positionMs),
);
const lineMode = computed(() => editor.project.stage === 2);
const selected = computed(() => editor.line?.units[editor.selectedUnit]);
const displaySelected = computed(
  () => editor.displayLine?.units[editor.selectedUnit],
);
const selectedEnd = computed(() =>
  editor.selectedUnit === (editor.line?.units.length ?? 0) - 1
    ? editor.line?.endMs
    : editor.line?.units[editor.selectedUnit + 1]?.startMs,
);
const conflict = computed(() =>
  editor.conflicts.find((issue) => issue.lineId === editor.line?.id),
);
const previewLine = computed(() => {
  if (editor.auditionScope === "song" || lineMode.value) {
    const index = playingLineIndex(editor.displayProject, editor.positionMs);
    if (index >= 0) return editor.displayProject.lines[index];
    if (editor.recordingArmed && editor.lastRecorded && lineMode.value)
      return (
        editor.displayProject.lines.find(
          (line) => line.id === editor.lastRecorded!.lineId,
        ) ?? editor.displayLine
      );
    if (editor.auditionScope === "song")
      return (
        editor.displayProject.lines
          .filter(
            (line) =>
              line.startMs !== null && line.startMs <= editor.positionMs,
          )
          .at(-1) ?? editor.displayLine
      );
  }
  return editor.displayLine;
});
const previewLimit = computed(() => {
  const index = editor.displayProject.lines.findIndex(
    (line) => line.id === previewLine.value?.id,
  );
  return Math.min(
    editor.project.audio?.durationMs ?? Infinity,
    editor.displayProject.lines[index + 1]?.startMs ?? Infinity,
  );
});
const provisional = computed(() =>
  editor.recordingArmed &&
  editor.lastRecorded?.lineId === editor.line?.id &&
  editor.lastRecorded.index === editor.cursor - 1 &&
  editor.positionMs >= editor.lastRecorded.timeMs
    ? editor.line?.units[editor.lastRecorded.index]?.id
    : null,
);
const selectedInterval = computed(() =>
  editor.displayLine
    ? tokenIntervals(
        editor.displayLine,
        Math.min(
          editor.project.audio?.durationMs ?? Infinity,
          editor.displayProject.lines[editor.lineIndex + 1]?.startMs ??
            Infinity,
        ),
      ).find((interval) => interval.id === selected.value?.id)
    : undefined,
);
function focus() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function choose(id: string) {
  editor.selectLine(id);
  listOpen.value = false;
  focus();
}
function applyStart(p: typeof editor.project, ms: number) {
  if (lineMode.value) setLineStart(p, editor.lineIndex, ms);
  else setUnitStart(p, editor.lineIndex, editor.selectedUnit, ms);
}
function applyEnd(p: typeof editor.project, ms: number) {
  if (editor.selectedUnit === p.lines[editor.lineIndex].units.length - 1)
    setLineEnd(p, editor.lineIndex, ms);
  else setUnitStart(p, editor.lineIndex, editor.selectedUnit + 1, ms);
}
function fieldStart(ms: number) {
  if (editor.recordingArmed) editor.pause();
  editor.clearPreview();
  return editor.command("调整起点", (p) => applyStart(p, ms));
}
function fieldEnd(ms: number) {
  if (editor.recordingArmed) editor.pause();
  editor.clearPreview();
  return editor.command("调整终点", (p) => applyEnd(p, ms));
}
function previewStart(ms: number) {
  return editor.previewCommand("start-field", (p) => applyStart(p, ms));
}
function previewEnd(ms: number) {
  return editor.previewCommand("end-field", (p) => applyEnd(p, ms));
}
function cancelField(owner: string) {
  if (editor.previewOwner === owner) editor.clearPreview();
}
function audition(scope: "line" | "token" | "boundary" | "song") {
  focus();
  void editor.review(scope);
}
function auditionVariant(scope: "line" | "token" | "boundary") {
  return editor.auditionScope === scope ? "filled" : "outlined";
}
function applyShift() {
  const value = Number(shiftMs.value);
  if (!Number.isSafeInteger(value)) {
    editor.error = "请输入整数毫秒。";
    return;
  }
  if (editor.command("整体平移", (p) => shiftAll(p, value)))
    shiftOpen.value = false;
}
watch(
  () => editor.cursor,
  () =>
    nextTick(() =>
      document
        .querySelector(".unit-strip .pending")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    ),
);
</script>
<template>
  <section class="timing-layout">
    <aside class="lyric-nav surface" :class="{ open: listOpen }">
      <div class="nav-heading">
        <h2>歌词</h2>
        <span
          >{{
            lineMode
              ? editor.project.lines.filter((line) => line.startMs !== null)
                  .length
              : editor.finishedCount
          }}
          / {{ editor.project.lines.length }}</span
        >
      </div>
      <div class="lyric-nav-list">
        <button
          v-for="(line, index) in editor.project.lines"
          :key="line.id"
          :class="{
            active: line.id === editor.line?.id,
            playing: editor.playing && index === playingLine,
          }"
          :aria-current="line.id === editor.line?.id ? 'true' : undefined"
          :title="
            editor.conflicts.find((issue) => issue.lineId === line.id)?.message
          "
          @click="choose(line.id)"
        >
          <span class="nav-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <div>
            <strong>{{ line.text }}</strong
            ><small>{{ formatTime(line.startMs) }}</small>
          </div>
          <Icon
            v-if="editor.playing && index === playingLine"
            class="nav-playing-icon"
            name="play"
            :size="16"
            aria-label="当前播放行"
          />
          <Icon
            v-if="
              (lineMode ? line.startMs !== null : completeLine(line)) &&
              !editor.conflicts.some((issue) => issue.lineId === line.id)
            "
            name="check"
            :size="16"
          /><span
            v-else
            class="progress-dot"
            :class="{
              partial: line.units.some((unit) => unit.startMs !== null),
              invalid: editor.conflicts.some(
                (issue) => issue.lineId === line.id,
              ),
            }"
          />
        </button>
      </div>
      <button
        v-if="!lineMode"
        class="text-link song-button"
        :disabled="!editor.asset || editor.editingText"
        @click="songOpen = true"
      >
        试听整曲
      </button>
      <button
        class="text-link shift-button"
        @click="
          editor.pause();
          shiftOpen = true;
        "
      >
        整曲时间偏移
      </button>
    </aside>
    <div
      class="timing-workspace surface"
      data-workspace
      tabindex="0"
      aria-label="打轴工作区"
    >
      <div class="workspace-heading">
        <div>
          <button
            class="icon-button drawer-toggle"
            aria-label="显示歌词列表"
            @click="listOpen = !listOpen"
          >
            <Icon name="list" />
          </button>
          <h1>{{ lineMode ? "逐行打轴" : "逐字打轴" }}</h1>
          <button
            class="text-link"
            :disabled="editor.editingText"
            @click="textOpen = true"
          >
            编辑／拆分
          </button>
        </div>
        <span class="workspace-counter"
          >第 {{ editor.lineIndex + 1 }} / {{ editor.project.lines.length }} 行
          <template v-if="!lineMode"
            >·
            {{
              editor.line?.units.filter((unit) => unit.startMs !== null).length
            }}
            / {{ editor.line?.units.length }}</template
          ></span
        >
      </div>
      <div v-if="!editor.asset" class="missing-audio">
        <span>{{
          editor.project.audio ? "重新选择原音频" : "选择音频以开始打轴"
        }}</span
        ><UiButton variant="tonal" @click="emit('audio')">选择音频</UiButton>
      </div>
      <template v-if="editor.line">
        <p v-if="conflict" class="conflict-note" role="alert">
          {{ conflict.message }}
        </p>
        <TimingCue v-if="!editor.editingText" />
        <LyricPreview
          v-if="previewLine"
          :line="previewLine"
          :position-ms="editor.positionMs"
          :limit-ms="previewLimit"
          :fill="fillPreview"
          :line-mode="lineMode"
          :provisional-unit-id="provisional"
        />
        <LineTextEditor :open="textOpen" @close="textOpen = false" />
        <TokenSegmentation v-if="!lineMode" v-show="!textOpen" />
        <Waveform @audio="emit('audio')" />
        <div v-if="!editor.editingText" class="precision-row">
          <TimeInput
            :value="
              lineMode ? editor.line.startMs : (selected?.startMs ?? null)
            "
            :label="
              lineMode ? '本句起点' : `「${selected?.text.trim() ?? ''}」起点`
            "
            :commit="fieldStart"
            :preview="previewStart"
            :cancel="() => cancelField('start-field')"
          />
          <TimeInput
            v-if="!lineMode"
            :value="selectedEnd ?? null"
            :label="
              editor.selectedUnit === editor.line.units.length - 1
                ? '本句收尾'
                : `「${selected?.text.trim() ?? ''}」终点`
            "
            :commit="fieldEnd"
            :preview="previewEnd"
            :cancel="() => cancelField('end-field')"
            :title="
              editor.selectedUnit === editor.line.units.length - 1
                ? '真实收尾'
                : '与下一项起点共用边界'
            "
          />
          <span
            v-if="!lineMode && selectedInterval?.kind === 'confirmed'"
            class="duration-label"
            >{{
              (
                (selectedInterval.endMs! - displaySelected!.startMs!) /
                1000
              ).toFixed(3)
            }}s</span
          >
        </div>
        <div v-if="!editor.editingText" class="workspace-actions">
          <div class="audition-actions">
            <UiButton
              class="audition-action"
              :variant="auditionVariant('line')"
              :aria-pressed="editor.auditionScope === 'line'"
              :disabled="!editor.asset"
              @click="audition('line')"
              >试听本行</UiButton
            ><UiButton
              v-if="!lineMode"
              class="audition-action"
              :variant="auditionVariant('token')"
              :aria-pressed="editor.auditionScope === 'token'"
              :disabled="
                !editor.asset || selectedInterval?.kind !== 'confirmed'
              "
              title="需已确认区间"
              @click="audition('token')"
              >试听选中</UiButton
            ><UiButton
              v-if="!lineMode"
              class="audition-action"
              :variant="auditionVariant('boundary')"
              :aria-pressed="editor.auditionScope === 'boundary'"
              :disabled="!editor.asset || selected?.startMs === null"
              @click="audition('boundary')"
              >试听边界</UiButton
            ><UiToggle switch v-model="editor.loopAudition" label="循环试听" />
            <UiSelect
              v-if="!lineMode"
              v-model="fillPreview"
              label="预览方式"
              compact
              :options="previewModes"
            /><span
              v-if="
                editor.auditionScope === 'line' && editor.line.endMs === null
              "
              class="small-note"
              >参考范围</span
            >
          </div>
          <UiButton
            v-if="
              lineMode &&
              !editor.project.lines.every((line) => line.startMs !== null)
            "
            variant="tonal"
            :disabled="editor.lineIssues.length > 0"
            @click="editor.confirmLines"
            >逐行完成，进入逐字</UiButton
          ><UiButton
            v-else-if="
              !lineMode && editor.lineIndex < editor.project.lines.length - 1
            "
            variant="tonal"
            icon="arrow"
            :disabled="
              !editor.isComplete ||
              editor.lineIndex === editor.project.lines.length - 1
            "
            @click="editor.nextLine"
            >下一句</UiButton
          >
        </div>
      </template>
    </div>
    <SongPreview
      :open="songOpen"
      :fill="fillPreview"
      @close="songOpen = false"
    />
    <Modal
      :open="shiftOpen"
      title="整体平移歌词"
      @close="shiftOpen = false"
      @closed="focus"
      ><label class="native-field"
        >偏移毫秒（正数延后）<input v-model="shiftMs" type="number" step="1"
      /></label>
      <footer>
        <UiButton @click="shiftOpen = false">取消</UiButton
        ><UiButton variant="filled" @click="applyShift">应用偏移</UiButton>
      </footer></Modal
    >
  </section>
</template>
