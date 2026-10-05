<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import {
  lineIntervals,
  tokenIntervals,
  sampleLineTiming,
  type TimingInterval,
} from "../domain/timing";
import { intervalGeometry, type TimeViewport } from "../domain/viewport";
const props = defineProps<{ view: TimeViewport; width: number }>();
const emit = defineEmits<{
  select: [lineIndex: number, unitIndex: number | null];
  audition: [unitIndex: number | null];
}>();
const lineMode = computed(() => editor.project.stage === 2);
const limit = computed(() =>
  Math.min(
    editor.project.audio?.durationMs ?? Infinity,
    editor.displayProject.lines[editor.lineIndex + 1]?.startMs ?? Infinity,
  ),
);
const intervals = computed(() =>
  lineMode.value
    ? lineIntervals(editor.displayProject)
    : editor.displayLine
      ? tokenIntervals(editor.displayLine, limit.value)
      : [],
);
const playing = computed(() =>
  editor.displayLine
    ? sampleLineTiming(editor.displayLine, editor.positionMs, limit.value)
        .unitId
    : null,
);
function extent(interval: TimingInterval) {
  if (interval.endMs !== null && interval.endMs > interval.startMs)
    return interval.endMs;
  if (
    interval.kind === "unknown" &&
    editor.recordingArmed &&
    editor.lastRecorded?.lineId ===
      editor.displayProject.lines[
        lineMode.value ? interval.lineIndex : editor.lineIndex
      ]?.id &&
    (lineMode.value || editor.lastRecorded.index === interval.unitIndex)
  )
    return Math.min(limit.value, Math.max(interval.startMs, editor.positionMs));
  return interval.startMs;
}
const visible = computed(() =>
  intervals.value.filter(
    (interval) =>
      extent(interval) > props.view.startMs &&
      interval.startMs < props.view.endMs,
  ),
);
const geometry = (interval: TimingInterval) =>
  intervalGeometry(interval.startMs, extent(interval), props.view);
function selected(interval: TimingInterval) {
  return lineMode.value
    ? interval.lineIndex === editor.lineIndex
    : interval.unitIndex === editor.selectedUnit;
}
function isPlaying(interval: TimingInterval) {
  return lineMode.value
    ? interval.kind !== "conflict" &&
        editor.positionMs >= interval.startMs &&
        editor.positionMs < extent(interval)
    : interval.id === playing.value;
}
function label(interval: TimingInterval) {
  return lineMode.value
    ? `${interval.lineIndex + 1} ${interval.text}`
    : interval.text.trim();
}
function title(interval: TimingInterval) {
  return `${label(interval)} · ${formatTime(interval.startMs)} → ${formatTime(interval.endMs)}${interval.kind === "reference" ? " · 参考范围" : interval.kind === "unknown" ? " · 范围未确认" : interval.kind === "conflict" ? " · 时间冲突" : ""}`;
}
</script>
<template>
  <div class="region-layer">
    <button
      v-for="interval in visible"
      :key="interval.id"
      class="timing-region"
      :class="[
        interval.kind,
        {
          alternate: (interval.unitIndex ?? interval.lineIndex) % 2 === 1,
          selected: selected(interval),
          playing: isPlaying(interval),
        },
      ]"
      :data-unit-id="interval.unitIndex === null ? undefined : interval.id"
      :data-start="interval.startMs"
      :data-end="interval.endMs"
      :data-kind="interval.kind"
      :style="{
        left: geometry(interval).left + '%',
        width: geometry(interval).width + '%',
      }"
      :title="title(interval)"
      :aria-label="`选择${lineMode ? '句子' : '单位'} ${lineMode ? interval.lineIndex + 1 : interval.unitIndex! + 1}：${label(interval)}`"
      @click.stop="
        emit(
          'select',
          lineMode ? interval.lineIndex : editor.lineIndex,
          interval.unitIndex,
        )
      "
      @dblclick.stop="emit('audition', interval.unitIndex)"
    >
      <span
        v-if="(geometry(interval).width / 100) * width > 26"
        class="region-text"
        >{{ label(interval)
        }}<small v-if="interval.kind === 'reference'"> · 参考</small></span
      >
    </button>
  </div>
</template>
<style scoped>
.region-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.timing-region {
  position: absolute;
  top: 47px;
  bottom: 10px;
  padding: 0;
  border: 0;
  border-left: 1px solid rgba(var(--mdui-color-primary), 0.35);
  border-radius: 0;
  background: rgba(var(--mdui-color-primary), 0.13);
  pointer-events: auto;
  overflow: hidden;
  min-width: 0;
}
.timing-region.alternate {
  background: rgba(var(--mdui-color-tertiary), 0.13);
}
.timing-region.reference {
  background: rgba(var(--mdui-color-secondary), 0.09);
  border-right: 1px dashed var(--muted);
}
.timing-region.unknown {
  background: repeating-linear-gradient(
    135deg,
    transparent 0 5px,
    rgba(var(--mdui-color-primary), 0.1) 5px 9px
  );
  border-right: 1px dashed var(--accent);
}
.timing-region.conflict {
  background: rgba(var(--mdui-color-error), 0.12);
  box-shadow: inset 0 0 0 1px var(--danger);
}
.timing-region.selected {
  box-shadow: inset 0 0 0 2px var(--accent);
}
.timing-region.playing .region-text {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
.region-text {
  position: absolute;
  top: 3px;
  left: 4px;
  right: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ink);
}
.region-text small {
  font-size: 10px;
  color: var(--muted);
}
</style>
