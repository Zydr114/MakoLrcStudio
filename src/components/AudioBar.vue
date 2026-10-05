<script setup lang="ts">
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import Icon from "./Icon.vue";
defineEmits<{ audio: [] }>();
</script>
<template>
  <div class="audio-bar">
    <button
      class="play-button"
      :disabled="!editor.asset || editor.loading || editor.editingText"
      :aria-label="editor.playing ? '暂停' : '播放'"
      @click="editor.togglePlayback"
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
      type="range"
      min="0"
      :max="editor.project.audio?.durationMs ?? 1"
      step="1"
      :value="editor.positionMs"
      :disabled="!editor.asset"
      @input="editor.seek(Number(($event.target as HTMLInputElement).value))"
    /><label class="speed-label"
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
    ><button class="audio-name text-link" @click="$emit('audio')">
      <Icon name="music" :size="16" />{{
        editor.asset ? editor.project.audio?.name : "选择音频"
      }}
    </button>
  </div>
</template>
