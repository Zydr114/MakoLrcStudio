<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import Icon from "./Icon.vue";
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
    <button
      class="play-button"
      :disabled="!editor.asset || editor.loading || editor.editingText"
      :aria-label="editor.playing ? '暂停' : '播放'"
      @click="play"
    >
      <Icon :name="editor.playing ? 'pause' : 'play'" :size="20" />
    </button>
    <div class="audio-time">
      <strong>{{ formatTime(editor.positionMs) }}</strong
      ><span>/ {{ formatTime(editor.project.audio?.durationMs ?? null) }}</span>
    </div>
    <label class="sr-only" for="audio-position">音频位置</label
    ><input
      id="audio-position"
      class="audio-position"
      :class="{ 'sr-only': embedded }"
      type="range"
      min="0"
      :max="editor.project.audio?.durationMs ?? 1"
      step="1"
      :value="editor.positionMs"
      :disabled="!editor.asset"
      @input="editor.seek(Number(($event.target as HTMLInputElement).value))"
    /><button
      v-if="embedded"
      class="text-link locate-selected"
      :disabled="selectedStart == null || editor.editingText"
      @click="locate"
    >
      定位选中</button
    ><span v-if="embedded" class="transport-spacer" /><label class="speed-label"
      >速度
      <select
        aria-label="播放速度"
        :value="editor.rate"
        @change="
          editor.setRate(Number(($event.target as HTMLSelectElement).value))
        "
      >
        <option :value="1">1×</option>
        <option :value="0.75">0.75×</option>
        <option :value="0.5">0.5×</option>
      </select></label
    ><label class="volume-label"
      >音量<input
        aria-label="音量"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="editor.volume"
        @input="
          editor.setVolume(Number(($event.target as HTMLInputElement).value))
        " /></label
    ><button
      v-if="!embedded"
      class="audio-name text-link"
      @click="$emit('audio')"
    >
      <Icon name="music" :size="16" />{{
        editor.asset ? editor.project.audio?.name : "选择音频"
      }}
    </button>
  </div>
</template>

<style scoped>
.audio-bar.embedded {
  flex: 0 0 44px;
  height: 44px;
  padding: 6px 0 0;
  gap: 14px;
  border-top: 1px solid var(--line);
}
.embedded .audio-time {
  font-size: 12px;
}
.embedded .speed-label,
.embedded .volume-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.embedded .volume-label input {
  width: 70px;
}
.transport-spacer {
  flex: 1;
}
.embedded .audio-position:focus-visible {
  position: static;
  clip: auto;
  width: 100px;
  height: auto;
  overflow: visible;
}
@media (max-width: 800px) {
  .audio-bar.embedded {
    gap: 8px;
  }
  .embedded .volume-label {
    display: none;
  }
}
</style>
