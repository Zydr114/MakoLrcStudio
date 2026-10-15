<script setup lang="ts">
import { computed, watch } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import { songLines, type SongLine } from "../domain/song";
import KaraokeLine from "./KaraokeLine.vue";
import Modal from "./Modal.vue";
import UiSlider from "./UiSlider.vue";
import UiSelect from "./UiSelect.vue";
import UiIconButton from "./UiIconButton.vue";
import { playbackRates } from "./controlOptions";
const props = defineProps<{ open: boolean; fill: boolean }>();
const emit = defineEmits<{ close: [] }>();
/** Every part at once, laid out like a player shows a duet. */
const song = computed(() => songLines(editor.displayProject));
const multiPart = computed(() => editor.project.parts.length > 1);
const sounding = (entry: SongLine) =>
  editor.positionMs >= entry.line.startMs! && editor.positionMs < entry.endMs;
const index = computed(() => {
  const active = song.value.findIndex(sounding);
  if (active >= 0) return active;
  return Math.max(
    0,
    song.value.findLastIndex(
      (entry) => entry.line.startMs! <= editor.positionMs,
    ),
  );
});
const visible = computed(() =>
  song.value
    .map((entry, i) => ({ entry, i }))
    .slice(Math.max(0, index.value - 1), index.value + 3),
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
  const ms = song.value[value]?.line.startMs;
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
      <div class="song-lines" :class="{ 'multi-part': multiPart }">
        <p v-if="!song.length" class="song-neighbor">还没有记录句首的歌词。</p>
        <div
          v-for="{ entry, i } in visible"
          :key="entry.line.id"
          class="song-line"
          :class="[
            entry.side,
            { active: sounding(entry), current: i === index },
          ]"
          :style="{ '--part-color': entry.part.color }"
        >
          <small v-if="multiPart" class="song-part">{{
            entry.part.name
          }}</small>
          <KaraokeLine
            :line="entry.line"
            :position-ms="editor.positionMs"
            :limit-ms="entry.limitMs"
            :fill="fill"
          />
          <small v-if="entry.line.roman" class="song-extra">{{
            entry.line.roman
          }}</small>
          <small v-if="entry.line.translation" class="song-extra">{{
            entry.line.translation
          }}</small>
          <KaraokeLine
            v-for="voice in entry.backgrounds"
            :key="voice.line.id"
            class="song-background"
            :line="voice.line"
            :position-ms="editor.positionMs"
            :limit-ms="voice.limitMs"
            :fill="fill"
          />
        </div>
      </div>
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
          song.map((entry, i) => ({
            value: i,
            label: `${i + 1} · ${multiPart ? `${entry.part.name}：` : ''}${entry.line.text}`,
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
.song-lines {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 240px;
  padding: 12px 4px 20px;
}
.song-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
  opacity: 0.55;
  transition: opacity 200ms ease;
}
.song-line.current,
.song-line.active {
  opacity: 1;
}
.song-line.active {
  color: var(--ink);
  font-size: 26px;
  font-weight: 600;
}
.multi-part .song-line.left {
  align-items: flex-start;
  text-align: left;
}
.multi-part .song-line.right {
  align-items: flex-end;
  text-align: right;
}
.song-part {
  font-size: 11px;
  font-weight: 400;
  color: var(--part-color);
}
.song-extra {
  font-size: 0.55em;
  font-weight: 400;
  color: var(--muted);
}
.song-background {
  font-size: 0.62em;
  font-weight: 400;
  color: var(--muted);
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
