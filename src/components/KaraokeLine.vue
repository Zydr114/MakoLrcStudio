<script setup lang="ts">
import { computed } from "vue";
import { syllableRefs, type LyricLine } from "../domain/model";
import { sampleLineTiming, tokenIntervals } from "../domain/timing";
import { rubyParts } from "../domain/ruby";
const props = defineProps<{
  line: LyricLine;
  positionMs: number;
  limitMs: number;
  fill?: boolean;
  provisionalUnitId?: string | null;
}>();
const sample = computed(() =>
  sampleLineTiming(props.line, props.positionMs, props.limitMs),
);
const activeId = computed(
  () => sample.value.unitId ?? props.provisionalUnitId ?? null,
);
/** A ruby unit fills across all of its syllables, the reading one syllable at a time. */
const unitProgress = computed(() => {
  const unitIndex = sample.value.unitIndex;
  if (unitIndex === null) return null;
  const own = tokenIntervals(props.line, props.limitMs).filter(
    (interval) => interval.unitIndex === unitIndex,
  );
  const start = own[0]?.startMs,
    end = own.at(-1)?.endMs;
  if (start === undefined || end == null || end <= start) return null;
  return Math.min(1, Math.max(0, (props.positionMs - start) / (end - start)));
});
const gradient = (progress: number | null) => ({
  backgroundImage: `linear-gradient(to right, var(--accent) ${(progress ?? 0) * 100}%, var(--muted) ${(progress ?? 0) * 100}%)`,
});
const refs = computed(() => syllableRefs(props.line));
const unitRefs = (unitIndex: number) =>
  refs.value.filter((ref) => ref.unitIndex === unitIndex);
</script>
<template>
  <span class="karaoke-line" :data-sample-status="sample.status"
    ><template v-if="!line.units.length">{{ line.text }}</template
    ><template v-for="(unit, unitIndex) in line.units" v-else :key="unit.id"
      ><span
        v-if="unit.ruby"
        class="preview-token ruby-token"
        :class="{
          playing: unit.id === activeId,
          provisional: unit.id === provisionalUnitId,
        }"
        :data-unit-id="unit.id"
        :data-progress="unit.id === sample.unitId ? sample.progress : undefined"
        >{{ rubyParts(unit.text).before
        }}<ruby
          ><span
            :class="{ filling: fill && unit.id === sample.unitId }"
            :style="
              fill && unit.id === sample.unitId
                ? gradient(unitProgress)
                : undefined
            "
            >{{ rubyParts(unit.text).base }}</span
          ><rt
            ><span
              v-for="ref in unitRefs(unitIndex)"
              :key="ref.syllable.id"
              class="ruby-syllable"
              :class="{
                playing: ref.syllable.id === sample.syllableId,
                filling: fill && ref.syllable.id === sample.syllableId,
              }"
              :style="
                fill && ref.syllable.id === sample.syllableId
                  ? gradient(sample.progress)
                  : undefined
              "
              >{{ ref.syllable.text }}</span
            ></rt
          ></ruby
        >{{ rubyParts(unit.text).after }}</span
      ><span
        v-else
        class="preview-token"
        :class="{
          playing: unit.id === activeId,
          provisional: unit.id === provisionalUnitId,
          filling: fill && unit.id === sample.unitId,
        }"
        :data-unit-id="unit.id"
        :style="
          fill && unit.id === sample.unitId
            ? gradient(sample.progress)
            : undefined
        "
        :data-progress="unit.id === sample.unitId ? sample.progress : undefined"
        >{{ unit.text }}</span
      ></template
    ></span
  >
</template>
<style scoped>
.karaoke-line {
  white-space: pre-wrap;
}
.preview-token,
.filling {
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
.filling,
.preview-token.filling {
  color: transparent;
  text-decoration-color: var(--accent);
}
.provisional {
  text-decoration-style: dashed;
}
ruby {
  ruby-position: over;
}
rt {
  font-size: 0.42em;
  font-weight: 400;
  color: var(--muted);
  text-decoration: none;
}
.ruby-syllable.playing {
  text-decoration: none;
  color: var(--accent);
}
.ruby-syllable.filling {
  color: transparent;
}
</style>
