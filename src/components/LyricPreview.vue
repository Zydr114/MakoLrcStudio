<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { LyricLine } from "../domain/model";
import { sampleLineTiming } from "../domain/timing";
const props = defineProps<{
  line: LyricLine;
  lines?: LyricLine[];
  activeLineId?: string | null;
  positionMs: number;
  limitMs: number;
  fill?: boolean;
  lineMode?: boolean;
  provisionalUnitId?: string | null;
  scrolling?: boolean;
}>();
const preview = ref<HTMLElement>();
const scrollViewport = ref<HTMLElement>();
const focusLineId = computed(() => props.activeLineId ?? props.line.id);
const displayLines = computed(() => {
  const lines = props.lines?.length ? props.lines : [props.line];
  return lines.some((line) => line.id === props.line.id)
    ? lines
    : [...lines, props.line];
});
const focusIndex = computed(() => {
  const index = displayLines.value.findIndex(
    (line) => line.id === focusLineId.value,
  );
  return index < 0
    ? displayLines.value.findIndex((line) => line.id === props.line.id)
    : index;
});
const sample = computed(() =>
  sampleLineTiming(props.line, props.positionMs, props.limitMs),
);
const wholeLineActive = computed(
  () =>
    props.lineMode &&
    props.line.startMs !== null &&
    props.positionMs >= props.line.startMs &&
    props.positionMs < (props.line.endMs ?? props.limitMs),
);
const fillStyle = computed(() => ({
  backgroundImage: `linear-gradient(to right, var(--accent) ${(sample.value.progress ?? 0) * 100}%, var(--muted) ${(sample.value.progress ?? 0) * 100}%)`,
}));
const activeId = computed(() => sample.value.unitId ?? props.provisionalUnitId);
watch(activeId, async (id) => {
  if (!id) return;
  await nextTick();
  const root = scrollViewport.value ?? preview.value;
  const token = root?.querySelector<HTMLElement>(
    `[data-unit-id="${CSS.escape(id)}"]`,
  );
  if (!root || !token) return;
  const box = root.getBoundingClientRect(),
    item = token.getBoundingClientRect();
  if (item.top < box.top + 4 || item.bottom > box.bottom - 4)
    root.scrollTop += item.top - box.top - 8;
});
watch(
  focusLineId,
  async (id) => {
    if (!props.scrolling) return;
    await nextTick();
    scrollViewport.value
      ?.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  { immediate: true },
);
</script>
<template>
  <div
    ref="preview"
    class="lyric-preview"
    aria-label="实时歌词预览"
    :data-playing-unit="sample.unitId"
    :data-sample-status="sample.status"
    :class="{ scrolling }"
  >
    <div v-if="scrolling" ref="scrollViewport" class="lyric-scroll-viewport">
      <div class="lyric-scroll-track">
        <div
          v-for="(item, index) in displayLines"
          :key="item.id"
          class="scroll-line"
          :class="{ active: item.id === focusLineId }"
          :data-line-id="item.id"
          :data-distance="Math.abs(index - focusIndex)"
        >
          <template v-if="item.id === line.id && item.id === focusLineId">
            <span
              v-if="lineMode || !line.units.length"
              :class="{ playing: wholeLineActive }"
              >{{ line.text }}</span
            >
            <template v-else>
              <span
                v-for="unit in line.units"
                :key="unit.id"
                class="preview-token"
                :class="{
                  playing: unit.id === activeId,
                  provisional: unit.id === provisionalUnitId,
                  filling: fill && unit.id === sample.unitId,
                }"
                :data-unit-id="unit.id"
                :style="
                  fill && unit.id === sample.unitId ? fillStyle : undefined
                "
                :data-progress="
                  unit.id === sample.unitId ? sample.progress : undefined
                "
                >{{ unit.text }}</span
              >
            </template>
          </template>
          <span v-else>{{ item.text }}</span>
        </div>
      </div>
    </div>
    <template v-else>
      <span
        v-if="lineMode || !line.units.length"
        :class="{ playing: wholeLineActive }"
        >{{ line.text }}</span
      >
      <template v-else>
        <span
          v-for="unit in line.units"
          :key="unit.id"
          class="preview-token"
          :class="{
            playing: unit.id === activeId,
            provisional: unit.id === provisionalUnitId,
            filling: fill && unit.id === sample.unitId,
          }"
          :data-unit-id="unit.id"
          :style="fill && unit.id === sample.unitId ? fillStyle : undefined"
          :data-progress="
            unit.id === sample.unitId ? sample.progress : undefined
          "
          >{{ unit.text }}</span
        >
      </template>
    </template>
  </div>
</template>
<style scoped>
.lyric-preview {
  flex: 0 1 auto;
  min-height: 64px;
  max-height: 96px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  white-space: pre-wrap;
  font-size: clamp(22px, 2.5vw, 32px);
  line-height: 1.55;
  color: var(--muted);
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
}
.lyric-preview.scrolling {
  flex: 1 1 220px;
  min-height: clamp(160px, 24vh, 240px);
  max-height: 360px;
  overflow: hidden;
  align-items: stretch;
  padding: 10px 14px;
  font-size: inherit;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 8%,
    black 92%,
    transparent 100%
  );
}
.lyric-scroll-viewport {
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}
.lyric-scroll-track {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  padding: 56px 0;
}
.scroll-line {
  flex: 0 0 auto;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: clamp(18px, 2vw, 24px);
  line-height: 1.35;
  color: var(--muted);
  opacity: 0.2;
  transform: scale(0.92);
  transition:
    opacity 220ms ease,
    transform 220ms ease,
    color 220ms ease,
    font-size 220ms ease;
}
.scroll-line[data-distance="1"] {
  opacity: 0.5;
  transform: scale(0.96);
}
.scroll-line[data-distance="2"] {
  opacity: 0.25;
}
.scroll-line.active {
  min-height: 64px;
  color: var(--ink);
  opacity: 1;
  transform: scale(1);
  font-size: clamp(30px, 3.1vw, 42px);
  font-weight: 600;
}
@media (max-height: 760px) {
  .lyric-preview.scrolling {
    flex: 0 0 108px;
    min-height: 108px;
    max-height: 108px;
    padding: 4px 14px;
  }
  .lyric-scroll-track {
    padding: 36px 0;
  }
  .scroll-line.active {
    min-height: 52px;
    font-size: clamp(26px, 3vw, 34px);
  }
}
.preview-token {
  color: inherit;
  background-clip: text;
  -webkit-background-clip: text;
}
.playing {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 7px;
}
.preview-token.filling {
  color: transparent;
  text-decoration-color: var(--accent);
}
.provisional {
  text-decoration-style: dashed;
}
</style>
