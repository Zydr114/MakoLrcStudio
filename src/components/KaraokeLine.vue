<script setup lang="ts">
import { computed } from "vue";
import type { LyricLine } from "../domain/model";
import { sampleLineTiming } from "../domain/timing";
const props = defineProps<{
  line: LyricLine;
  positionMs: number;
  limitMs: number;
  fill?: boolean;
}>();
const sample = computed(() =>
  sampleLineTiming(props.line, props.positionMs, props.limitMs),
);
const fillStyle = computed(() => ({
  backgroundImage: `linear-gradient(to right, var(--accent) ${(sample.value.progress ?? 0) * 100}%, var(--muted) ${(sample.value.progress ?? 0) * 100}%)`,
}));
</script>
<template>
  <span class="karaoke-line" :data-sample-status="sample.status"
    ><template v-if="!line.units.length">{{ line.text }}</template
    ><span
      v-for="unit in line.units"
      v-else
      :key="unit.id"
      class="preview-token"
      :class="{
        playing: unit.id === sample.unitId,
        filling: fill && unit.id === sample.unitId,
      }"
      :style="fill && unit.id === sample.unitId ? fillStyle : undefined"
      >{{ unit.text }}</span
    ></span
  >
</template>
<style scoped>
.karaoke-line {
  white-space: pre-wrap;
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
</style>
