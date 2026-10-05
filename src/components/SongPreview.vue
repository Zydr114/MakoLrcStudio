<script setup lang="ts">
import { computed, watch } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import { playingLineIndex } from "../domain/timing";
import LyricPreview from "./LyricPreview.vue";
import Modal from "./Modal.vue";
import UiSlider from "./UiSlider.vue";
import UiSelect from "./UiSelect.vue";
import UiIconButton from "./UiIconButton.vue";
import { playbackRates } from "./controlOptions";
const props = defineProps<{ open: boolean; fill: boolean }>();
const emit = defineEmits<{ close: [] }>();
const index = computed(() => {
  const active = playingLineIndex(editor.displayProject, editor.positionMs);
  if (active >= 0) return active;
  return Math.max(
    0,
    editor.displayProject.lines.findLastIndex(
      (line) => line.startMs !== null && line.startMs <= editor.positionMs,
    ),
  );
});
const line = computed(() => editor.displayProject.lines[index.value]);
const limit = computed(() =>
  Math.min(
    editor.project.audio?.durationMs ?? Infinity,
    editor.displayProject.lines[index.value + 1]?.startMs ?? Infinity,
  ),
);
let previousLoop = false;
watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousLoop = editor.loopAudition;
      editor.loopAudition = false;
      editor.clearPreview();
      await editor.review("song");
    } else {
      editor.pause();
      editor.cancelAudition();
      editor.loopAudition = previousLoop;
    }
  },
);
function focusWorkspace() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function locate(value: number) {
  const ms = editor.project.lines[value]?.startMs;
  if (ms !== null && ms !== undefined) editor.seek(ms);
}
function keydown(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.repeat ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          [
            "MDUI-SELECT",
            "MDUI-SLIDER",
            "MDUI-MENU-ITEM",
            "MDUI-BUTTON-ICON",
            "BUTTON",
          ].includes(node.tagName),
      )
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    void editor.togglePlayback();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    editor.seek(editor.positionMs + (event.key === "ArrowLeft" ? -1000 : 1000));
  }
}
</script>
<template>
  <Modal
    :open="open"
    title="整曲试听"
    @close="emit('close')"
    @closed="focusWorkspace"
  >
    <div v-if="open" class="song-review" tabindex="0" @keydown="keydown">
      <p class="song-neighbor">
        {{ editor.displayProject.lines[index - 1]?.text || "\u00a0" }}
      </p>
      <LyricPreview
        v-if="line"
        :line="line"
        :position-ms="editor.positionMs"
        :limit-ms="limit"
        :fill="fill"
      />
      <p class="song-neighbor">
        {{ editor.displayProject.lines[index + 1]?.text || "\u00a0" }}
      </p>
      <div class="song-controls">
        <UiIconButton
          variant="filled"
          :icon="editor.playing ? 'pause' : 'play'"
          :label="editor.playing ? '暂停整曲' : '播放整曲'"
          @click="editor.togglePlayback"
        />
        <time>{{ formatTime(editor.positionMs) }}</time>
        <UiSlider
          class="song-position"
          label="整曲试听位置"
          :model-value="editor.positionMs"
          :max="editor.project.audio?.durationMs ?? 1"
          :formatter="formatTime"
          @update:model-value="editor.seek"
        />
        <UiSelect
          compact
          label="整曲试听速度"
          :model-value="editor.rate"
          :options="playbackRates"
          @update:model-value="editor.setRate"
        />
      </div>
      <UiSelect
        class="song-locate"
        label="整曲定位歌词"
        :model-value="index"
        :options="
          editor.project.lines.map((item, i) => ({
            value: i,
            label: `${i + 1} · ${item.text}`,
            disabled: item.startMs === null,
          }))
        "
        @update:model-value="locate"
      />
    </div>
  </Modal>
</template>
<style scoped>
.song-review {
  outline: none;
}
.song-review:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
.song-neighbor {
  color: var(--muted);
  text-align: center;
  padding: 16px;
  line-height: 1.6;
}
.song-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding-top: 20px;
}
.song-controls time {
  font:
    12px ui-monospace,
    monospace;
}
.song-position {
  flex: 1;
  min-width: 40px;
}
.song-controls label,
.song-locate {
  color: var(--muted);
  font-size: 12px;
}
.song-locate {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.song-locate {
  flex: 1;
  min-width: 0;
  max-width: 90%;
}
</style>
