<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import { completeLine, formatTime } from "../domain/model";
import UiButton from "./UiButton.vue";
const lineMode = computed(() => editor.project.stage === 2);
const lineReady = computed(
  () =>
    lineMode.value &&
    editor.project.lines.every((line) => line.startMs !== null),
);
const broken = computed(
  () =>
    !lineMode.value &&
    !!editor.line &&
    completeLine(editor.line) &&
    !editor.isComplete,
);
const pending = computed(() => editor.line?.units[editor.cursor]);
const target = computed(() =>
  lineMode.value
    ? editor.line?.text
    : broken.value
      ? "待调整"
      : editor.isComplete
        ? editor.line?.units[editor.selectedUnit]?.text
        : (pending.value?.text ?? "收尾"),
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
const action = computed(() =>
  editor.mode === "recording"
    ? lineMode.value
      ? "记句首"
      : pending.value
        ? "记起点"
        : "记收尾"
    : editor.mode === "starting"
      ? "启动中"
      : editor.mode === "ended"
        ? "定位后补打"
        : lineReady.value && !editor.recordingArmed
          ? "进入逐字"
          : broken.value
            ? "从选中单位重打"
            : editor.isComplete && !lineMode.value
              ? "试听本行"
              : editor.recordingArmed
                ? "继续打轴"
                : lineMode.value && editor.line?.startMs !== null
                  ? "重打本句"
                  : editor.mode === "review"
                    ? "进入打轴"
                    : "开始打轴",
);
const hint = computed(() =>
  editor.mode === "recording" && !pending.value && !lineMode.value
    ? "唱完后收尾"
    : !editor.isComplete &&
        ["idle", "paused", "review"].includes(editor.mode) &&
        !lineReady.value &&
        !broken.value
      ? "本次只播放"
      : "",
);
const showEnter = computed(
  () =>
    !lineReady.value &&
    !broken.value &&
    !(editor.isComplete && !lineMode.value) &&
    !(
      lineMode.value &&
      editor.line?.startMs !== null &&
      !editor.recordingArmed
    ) &&
    !["starting", "ended"].includes(editor.mode),
);
function focus() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function act(time = performance.now()) {
  if (!editor.asset || editor.mode === "starting" || editor.mode === "ended")
    return;
  focus();
  if (lineReady.value && !editor.recordingArmed) editor.confirmLines();
  else if (broken.value) editor.retime(editor.selectedUnit);
  else if (editor.isComplete && !lineMode.value) void editor.review();
  else {
    if (
      lineMode.value &&
      editor.line?.startMs !== null &&
      !editor.recordingArmed
    )
      editor.retimeLine();
    void editor.enter(time);
  }
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
      <span class="target-caption">{{
        lineMode ? "句首" : editor.isComplete ? "选中" : "待录"
      }}</span>
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
          ['starting', 'ended'].includes(editor.mode)
        "
        @pointerdown="pointer"
        @click="click"
        >{{ action }}<kbd v-if="showEnter">Enter</kbd></UiButton
      >
      <small v-if="hint" class="cue-hint">{{ hint }}</small>
    </div>
    <span v-if="editor.lastRecorded" class="last-recorded"
      >刚记：{{ editor.lastRecorded.text }}
      <time>{{ formatTime(editor.lastRecorded.timeMs) }}</time></span
    >
  </div>
</template>
