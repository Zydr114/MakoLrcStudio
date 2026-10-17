<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import {
  completeLine,
  formatTime,
  syllableLabel,
  syllableRefs,
} from "../domain/model";
import UiButton from "./UiButton.vue";
const lineMode = computed(() => editor.project.stage === 2);
const lineReady = computed(
  () => lineMode.value && editor.lines.every((line) => line.startMs !== null),
);
const broken = computed(
  () =>
    !lineMode.value &&
    !!editor.line &&
    completeLine(editor.line) &&
    !editor.isComplete,
);
const pending = computed(() =>
  editor.line ? syllableRefs(editor.line)[editor.cursor] : undefined,
);
const target = computed(() => {
  if (lineMode.value) return editor.line?.text;
  if (broken.value) return "待调整";
  if (editor.isComplete) return "整句";
  if (pending.value)
    return syllableLabel(pending.value.unit, pending.value.syllable);
  return "收尾";
});
const targetCaption = computed(() =>
  lineMode.value
    ? "句首"
    : broken.value
      ? "冲突"
      : editor.isComplete
        ? "整句"
        : pending.value
          ? "待录"
          : "收尾",
);
const status = computed(() =>
  editor.mode === "starting"
    ? "启动中"
    : editor.mode === "recording"
      ? "正在记录"
      : editor.mode === "paused"
        ? "已暂停"
        : editor.mode === "review"
          ? "试听"
          : editor.mode === "ended"
            ? "范围结束"
            : broken.value
              ? "待调整"
              : editor.isComplete && !lineMode.value
                ? "本行完成"
                : "准备",
);
const action = computed(() => {
  if (editor.mode === "recording")
    return lineMode.value ? "记句首" : pending.value ? "记起点" : "记收尾";
  if (editor.mode === "starting") return "启动中";
  if (editor.mode === "ended") return "定位后补打";
  if (lineMode.value) {
    if (lineReady.value && !editor.recordingArmed) return "进入逐字";
    if (editor.recordingArmed) return "继续打轴";
    return editor.line?.startMs !== null ? "重打本句" : "开始打轴";
  }
  if (broken.value) return "待调整";
  if (editor.isComplete) return "重打本句";
  return editor.wordTimingAction === "continue" ? "继续打轴" : "开始打轴";
});
const hint = computed(() => {
  if (lineMode.value) return "";
  if (editor.isComplete) return "清空逐字时间，保留句首";
  if (editor.mode === "recording" && !pending.value) return "唱完后收尾";
  if (editor.wordTimingAction === "continue") return "保留已记点，从播放头继续";
  if (editor.wordTimingAction === "start") return "播放本句，Enter 记起点";
  return "";
});
const showEnter = computed(() => {
  if (broken.value || ["starting", "ended"].includes(editor.mode)) return false;
  if (lineMode.value)
    return (
      !lineReady.value &&
      !(editor.line?.startMs !== null && !editor.recordingArmed)
    );
  return !editor.isComplete;
});
function focus() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function act(time = performance.now()) {
  if (!editor.asset || editor.mode === "starting" || editor.mode === "ended")
    return;
  focus();
  if (lineMode.value) {
    if (lineReady.value && !editor.recordingArmed) editor.confirmLines();
    else if (editor.line?.startMs !== null && !editor.recordingArmed)
      editor.retimeLine();
    else void editor.enter(time);
    return;
  }
  if (broken.value) return;
  if (editor.isComplete) void editor.restartWordTiming();
  else void editor.enter(time);
}
function restart() {
  if (!editor.asset || editor.mode === "starting" || editor.mode === "ended")
    return;
  focus();
  void editor.restartWordTiming();
}
function pointer(event: PointerEvent) {
  if (event.button === 0) {
    event.preventDefault();
    act(event.timeStamp);
  }
}
function click(event: MouseEvent) {
  if (event.detail === 0) act(event.timeStamp);
  else focus();
}
</script>
<template>
  <div class="timing-cue">
    <div class="cue-target">
      <span class="state-label"
        ><i
          class="status-dot"
          :class="{ live: editor.mode === 'recording' }"
        />{{ status }}</span
      >
      <span class="target-caption">{{ targetCaption }}</span>
      <strong class="target-text" :class="{ 'sentence-target': lineMode }">{{
        target
      }}</strong>
    </div>
    <div class="cue-action">
      <UiButton
        variant="filled"
        :disabled="
          !editor.asset ||
          editor.editingText ||
          broken ||
          ['starting', 'ended'].includes(editor.mode)
        "
        @pointerdown="pointer"
        @click="click"
        >{{ action }}<kbd v-if="showEnter">Enter</kbd></UiButton
      >
      <UiButton
        v-if="
          !lineMode &&
          !broken &&
          editor.wordTimingAction === 'continue' &&
          editor.mode !== 'recording'
        "
        variant="text"
        title="清空本句逐字时间与收尾，保留句首"
        @click="restart"
        >从头重打</UiButton
      >
      <small v-if="hint" class="cue-hint">{{ hint }}</small>
    </div>
    <span
      v-if="
        editor.lastRecorded &&
        (!editor.line || editor.lastRecorded.lineId === editor.line.id)
      "
      class="last-recorded"
      >刚记：{{ editor.lastRecorded.text }}
      <time>{{ formatTime(editor.lastRecorded.timeMs) }}</time></span
    >
  </div>
</template>
