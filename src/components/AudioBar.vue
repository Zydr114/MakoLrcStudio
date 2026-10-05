<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import UiSlider from "./UiSlider.vue";
import UiSelect from "./UiSelect.vue";
import UiButton from "./UiButton.vue";
import UiIconButton from "./UiIconButton.vue";
import { playbackRates } from "./controlOptions";
const props = defineProps<{ embedded?: boolean }>();
defineEmits<{ audio: [] }>();
const selectedStart = computed(() =>
  editor.project.stage === 3
    ? editor.line?.units[editor.selectedUnit]?.startMs
    : editor.line?.startMs,
);
function focusWorkspace() {
  if (props.embedded)
    document
      .querySelector<HTMLElement>("[data-workspace]")
      ?.focus({ preventScroll: true });
}
function play() {
  void editor.togglePlayback();
  focusWorkspace();
}
function locate() {
  if (selectedStart.value != null) editor.seek(selectedStart.value);
  focusWorkspace();
}
</script>
<template>
  <div
    class="audio-bar"
    :class="{ embedded }"
    role="group"
    aria-label="音频播放控制"
  >
    <UiIconButton
      class="transport-play"
      variant="filled"
      :icon="editor.playing ? 'pause' : 'play'"
      :label="editor.playing ? '暂停' : '播放'"
      :disabled="!editor.asset || editor.loading || editor.editingText"
      @click="play"
    />
    <div class="audio-time">
      <strong>{{ formatTime(editor.positionMs) }}</strong
      ><span>/ {{ formatTime(editor.project.audio?.durationMs ?? null) }}</span>
    </div>
    <UiSlider
      class="audio-position"
      label="音频位置"
      :model-value="editor.positionMs"
      :max="editor.project.audio?.durationMs ?? 1"
      :formatter="formatTime"
      :disabled="!editor.asset"
      @update:model-value="editor.seek"
    />
    <UiButton
      v-if="embedded"
      class="locate-selected"
      variant="text"
      :disabled="selectedStart == null || editor.editingText"
      @click="locate"
      >定位选中</UiButton
    >
    <UiSelect
      class="speed-control"
      compact
      label="播放速度"
      :model-value="editor.rate"
      :options="playbackRates"
      @update:model-value="editor.setRate"
    />
    <div class="volume-control">
      <span>音量</span
      ><UiSlider
        label="音量"
        :model-value="editor.volume"
        :max="1"
        :step="0.01"
        :formatter="(value) => Math.round(value * 100) + '%'"
        @update:model-value="editor.setVolume"
      />
    </div>
    <UiButton
      v-if="!embedded"
      class="audio-name"
      variant="text"
      icon="music"
      @click="$emit('audio')"
    >
      {{ editor.asset ? editor.project.audio?.name : "选择音频" }}
    </UiButton>
  </div>
</template>
<style scoped>
.audio-bar.embedded {
  flex: 0 0 52px;
  min-height: 52px;
  padding: 6px 0 0;
  gap: 12px;
  border-top: 1px solid var(--line);
}
.audio-time {
  white-space: nowrap;
  font-size: 12px;
}
.speed-control {
  width: 100px;
  flex-shrink: 0;
}
.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.volume-control .ui-slider {
  width: 76px;
}
.audio-position {
  flex: 1;
  min-width: 120px;
  height: 40px;
}
.audio-position::part(track-active) {
  height: 6px;
  border-radius: 999px;
}
.audio-position::part(track-inactive) {
  height: 6px;
  border-radius: 999px;
}
.audio-position::part(handle) {
  width: 16px;
  height: 16px;
}
@media (max-width: 800px) {
  .audio-bar.embedded {
    gap: 8px;
  }
  .volume-control {
    display: none;
  }
}
</style>
