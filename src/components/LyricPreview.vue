<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { LyricLine } from "../domain/model";
import { sampleLineTiming } from "../domain/timing";
const props = defineProps<{
  line: LyricLine;
  positionMs: number;
  limitMs: number;
  fill?: boolean;
  lineMode?: boolean;
  provisionalUnitId?: string | null;
}>();
const preview = ref<HTMLElement>();
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
  const root = preview.value;
  const token = root?.querySelector<HTMLElement>(
    `[data-unit-id="${CSS.escape(id)}"]`,
  );
  if (!root || !token) return;
  const box = root.getBoundingClientRect(),
    item = token.getBoundingClientRect();
  if (item.top < box.top + 4 || item.bottom > box.bottom - 4)
    root.scrollTop += item.top - box.top - 8;
});
</script>
<template>
  <div
    ref="preview"
    class="lyric-preview"
    aria-label="实时歌词预览"
    :data-playing-unit="sample.unitId"
    :data-sample-status="sample.status"
  >
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
        :data-progress="unit.id === sample.unitId ? sample.progress : undefined"
        >{{ unit.text }}</span
      >
    </template>
  </div>
</template>
<style scoped>
.lyric-preview {
  flex: 0 1 auto;
  min-height: 68px;
  max-height: 104px;
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
