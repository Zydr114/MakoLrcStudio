<script setup lang="ts">
import { computed } from "vue";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import { intervalGeometry, type TimeViewport } from "../domain/viewport";
const props = defineProps<{ view: TimeViewport; width: number }>();
/** Other parts' lines, read only, so duets and harmonies can be aligned by eye. */
const lanes = computed(() => {
  const duration = editor.project.audio?.durationMs ?? Infinity;
  const others = editor.displayProject.parts.filter(
    (part) => part.id !== editor.project.activePartId,
  );
  return others.map((part, lane) => ({
    part,
    lane,
    blocks: part.lines.flatMap((line, index) => {
      if (line.startMs === null) return [];
      const end =
        line.endMs ??
        part.lines[index + 1]?.startMs ??
        Math.min(duration, line.startMs + 4000);
      if (end <= props.view.startMs || line.startMs >= props.view.endMs)
        return [];
      return [
        {
          id: line.id,
          text: line.text,
          title: `${part.name} · ${line.text} · ${formatTime(line.startMs)} → ${formatTime(line.endMs)}`,
          reference: line.endMs === null,
          ...intervalGeometry(line.startMs, end, props.view),
        },
      ];
    }),
  }));
});
const laneHeight = computed(() =>
  Math.max(4, Math.floor(16 / Math.max(1, lanes.value.length))),
);
</script>
<template>
  <div v-if="lanes.length" class="part-reference" aria-hidden="true">
    <template v-for="lane in lanes" :key="lane.part.id">
      <div
        v-for="block in lane.blocks"
        :key="block.id"
        class="part-reference-block"
        :class="{ reference: block.reference }"
        :title="block.title"
        :style="{
          left: block.left + '%',
          width: block.width + '%',
          top: lane.lane * laneHeight + 'px',
          height: laneHeight - 1 + 'px',
          '--part-color': lane.part.color,
        }"
      >
        <span v-if="laneHeight >= 12 && (block.width / 100) * width > 30">{{
          block.text
        }}</span>
      </div>
    </template>
  </div>
</template>
<style scoped>
.part-reference {
  position: absolute;
  top: 19px;
  left: 0;
  right: 0;
  height: 16px;
}
.part-reference-block {
  position: absolute;
  overflow: hidden;
  border-left: 2px solid var(--part-color);
  border-radius: 2px;
  background: color-mix(in srgb, var(--part-color) 22%, transparent);
  font-size: 10px;
  line-height: 12px;
  color: var(--muted);
  white-space: nowrap;
  padding-left: 3px;
}
.part-reference-block.reference {
  background: color-mix(in srgb, var(--part-color) 10%, transparent);
}
</style>
