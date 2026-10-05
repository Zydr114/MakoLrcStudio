<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { useWaveformViewport } from "./useWaveformViewport";
import { editor } from "../state/editor";
import { formatTime, completeLine } from "../domain/model";
import {
  unitBounds,
  lineStartBounds,
  setUnitStart,
  setLineStart,
  setLineEnd,
} from "../domain/edit";
import Icon from "./Icon.vue";
import AudioBar from "./AudioBar.vue";
import WaveformRegions from "./WaveformRegions.vue";
import { intervalGeometry, timeToRatio, ratioToTime } from "../domain/viewport";

const emit = defineEmits<{ audio: [] }>();
const host = ref<HTMLDivElement>();
const drag = ref<{
  key: string;
  ms: number;
  point: Point;
  originX: number;
} | null>(null);
const {
  view,
  zoom,
  width,
  following,
  span,
  fit,
  setZoom,
  scrollTo,
  wheel,
  overview,
} = useWaveformViewport(host, () => !!drag.value);
const viewport = computed(() => ({
  startMs: view.value.startTime * 1000,
  endMs: view.value.endTime * 1000,
}));
interface Point {
  key: string;
  lineIndex: number;
  unitIndex: number;
  time: number;
  label: string;
  end: boolean;
  wholeLine?: boolean;
}
const points = computed<Point[]>(() => {
  if (editor.project.stage === 2)
    return editor.displayProject.lines.flatMap((l, i) =>
      l.startMs === null
        ? []
        : [
            {
              key: l.id,
              lineIndex: i,
              unitIndex: 0,
              time: l.startMs,
              label: `${i + 1}`,
              end: false,
            },
          ],
    );
  const line = editor.displayLine;
  if (!line) return [];
  const result: Point[] = line.units.flatMap((u, i) =>
    u.startMs === null
      ? []
      : [
          {
            key: u.id,
            lineIndex: editor.lineIndex,
            unitIndex: i,
            time: u.startMs,
            label: u.text.trim(),
            end: false,
          },
        ],
  );
  if (line.endMs !== null)
    result.push({
      key: `${line.id}-end`,
      lineIndex: editor.lineIndex,
      unitIndex: line.units.length,
      time: line.endMs,
      label: "收尾",
      end: true,
    });
  return result;
});
const left = (ms: number) => timeToRatio(ms, viewport.value) * 100;
const visiblePoints = computed(() =>
  points.value.filter((p) => left(p.time) >= -1 && left(p.time) <= 101),
);
const ticks = computed(() => {
  const interval =
    span.value > 40
      ? 10
      : span.value > 18
        ? 5
        : span.value > 7
          ? 2
          : span.value > 3
            ? 1
            : 0.5;
  const values: number[] = [];
  for (
    let t = Math.ceil(view.value.startTime / interval) * interval;
    t <= view.value.endTime;
    t += interval
  )
    values.push(Math.round(t * 1000));
  return values;
});
function bounds(point: Point): [number, number] {
  const lines = editor.project.lines,
    line = lines[point.lineIndex];
  if (editor.project.stage === 2 || point.wholeLine)
    return lineStartBounds(editor.project, point.lineIndex);
  if (point.end)
    return [
      Math.max(line.startMs ?? 0, ...line.units.map((u) => u.startMs ?? -1)) +
        1,
      Math.min(
        editor.project.audio?.durationMs ?? Infinity,
        lines[point.lineIndex + 1]?.startMs ?? Infinity,
      ),
    ];
  return unitBounds(editor.project, point.lineIndex, point.unitIndex);
}
function applyPoint(p: typeof editor.project, point: Point, ms: number) {
  if (p.stage === 2 || point.wholeLine) setLineStart(p, point.lineIndex, ms);
  else if (point.end) setLineEnd(p, point.lineIndex, ms);
  else setUnitStart(p, point.lineIndex, point.unitIndex, ms);
}
function pointConflict(point: Point) {
  const [min, max] = bounds(point);
  return point.time < min || point.time > max;
}
function setPoint(point: Point, ms: number) {
  return editor.command("调整时间边界", (p) => applyPoint(p, point, ms));
}
function selectPoint(point: Point) {
  if (editor.editingText) return;
  if (editor.recordingArmed) editor.pause();
  if (editor.project.stage === 2)
    editor.view({ activeLineId: editor.project.lines[point.lineIndex].id });
  else if (!point.wholeLine) {
    editor.selectedUnit = Math.min(
      point.unitIndex,
      (editor.line?.units.length ?? 1) - 1,
    );
    editor.selectionEnd = editor.selectedUnit;
  }
}
function startDrag(event: PointerEvent, point: Point) {
  if (event.button !== 0 || editor.editingText) return;
  if (editor.recordingArmed) editor.pause();
  following.value = false;
  drag.value = {
    key: point.key,
    ms: point.time,
    point,
    originX: event.clientX,
  };
  selectPoint(point);
  const button = event.currentTarget as HTMLButtonElement;
  button.focus();
  button.setPointerCapture(event.pointerId);
  event.stopPropagation();
}
function moveDrag(event: PointerEvent) {
  if (!drag.value) return;
  const [min, max] = bounds(drag.value.point);
  if (min > max) return;
  const delta =
    ((event.clientX - drag.value.originX) / host.value!.clientWidth) *
    span.value *
    1000;
  drag.value.ms = Math.max(
    min,
    Math.min(Math.round(drag.value.point.time + delta), max),
  );
  editor.previewCommand("waveform", (p) =>
    applyPoint(p, drag.value!.point, drag.value!.ms),
  );
}
function endDrag() {
  if (!drag.value) return;
  drag.value = null;
  editor.commitPreview("调整时间边界");
}
function markerKey(event: KeyboardEvent, point: Point) {
  if (
    (event.ctrlKey || event.metaKey) &&
    ["z", "y"].includes(event.key.toLowerCase())
  ) {
    drag.value = null;
    editor.clearPreview();
    return;
  }
  if (event.key === "Escape") {
    drag.value = null;
    editor.clearPreview();
    event.stopPropagation();
    return;
  }
  if (editor.editingText || !["ArrowLeft", "ArrowRight"].includes(event.key))
    return;
  event.preventDefault();
  event.stopPropagation();
  selectPoint(point);
  const [min, max] = bounds(point);
  setPoint(
    point,
    Math.max(
      min,
      Math.min(
        point.time +
          (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 10),
        max,
      ),
    ),
  );
}
function seek(event: MouseEvent) {
  if (!host.value) return;
  const rect = host.value.getBoundingClientRect();
  editor.clearPreview();
  editor.seek(
    ratioToTime((event.clientX - rect.left) / rect.width, viewport.value),
  );
}
const canMoveSentence = computed(
  () =>
    !!editor.line &&
    completeLine(editor.line) &&
    !editor.conflicts.some((issue) => issue.lineId === editor.line.id),
);
function auditionRegion(unitIndex: number | null) {
  void editor.review(unitIndex === null ? "line" : "token");
}
const contextGeometry = computed(() =>
  intervalGeometry(
    editor.displayLine?.startMs ?? 0,
    editor.displayLine?.endMs ??
      editor.displayProject.lines[editor.lineIndex + 1]?.startMs ??
      editor.project.audio?.durationMs ??
      0,
    viewport.value,
  ),
);
function moveSentence(event: PointerEvent) {
  if (!editor.line || !completeLine(editor.line)) return;
  startDrag(event, {
    key: editor.line.id + "-move",
    lineIndex: editor.lineIndex,
    unitIndex: 0,
    time: editor.line.startMs!,
    label: "整句",
    end: false,
    wholeLine: true,
  });
}
let heightDrag: { y: number; height: number } | null = null;
const waveHeight = ref(0);
function heightStart(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  heightDrag = {
    y: event.clientY,
    height: host.value?.parentElement?.clientHeight ?? 180,
  };
  target.setPointerCapture(event.pointerId);
}
function heightMove(event: PointerEvent) {
  if (heightDrag)
    waveHeight.value = Math.max(
      120,
      Math.min(400, heightDrag.height + event.clientY - heightDrag.y),
    );
}
onBeforeUnmount(() => {
  if (editor.previewOwner === "waveform") editor.clearPreview();
});
</script>
<template>
  <section class="wave-panel audio-workspace" aria-label="音频波形与播放">
    <div class="wave-toolbar">
      <button
        class="text-link waveform-audio-name"
        aria-label="选择工作区音频"
        @click="emit('audio')"
      >
        <Icon name="music" :size="16" />{{
          editor.project.audio?.name || "选择音频"
        }}
      </button>
      <div>
        <label
          ><Icon name="zoom" :size="16" /><input
            aria-label="波形缩放"
            type="range"
            min="10"
            max="1000"
            :value="zoom"
            @input="
              setZoom(Number(($event.target as HTMLInputElement).value))
            " /></label
        ><button
          v-if="!following"
          class="text-link"
          @click="
            following = true;
            scrollTo(Math.max(0, editor.positionMs / 1000 - span * 0.3));
          "
        >
          回到播放头</button
        ><button class="text-link" @click="fit">适合当前句</button>
      </div>
    </div>
    <div
      class="wave-stage"
      :style="
        waveHeight ? { height: waveHeight + 'px', flex: '0 0 auto' } : undefined
      "
      @click="seek"
      @wheel="wheel"
    >
      <div ref="host" class="wave-canvas" />
      <div class="wave-ticks">
        <span
          v-for="tick in ticks"
          :key="tick"
          :style="{ left: `${left(tick)}%` }"
          >{{ formatTime(tick).slice(0, 8) }}</span
        >
      </div>
      <div
        class="wave-cursor"
        v-if="
          editor.asset &&
          left(editor.positionMs) >= 0 &&
          left(editor.positionMs) <= 100
        "
        :style="{ left: `${left(editor.positionMs)}%` }"
      >
        <span />
      </div>
      <div
        v-if="
          editor.project.stage === 3 && editor.displayLine?.startMs !== null
        "
        class="wave-line-context"
        :style="{
          left: contextGeometry.left + '%',
          width: contextGeometry.width + '%',
        }"
      >
        <button
          v-if="canMoveSentence"
          class="line-move-grip"
          aria-label="平移整句"
          title="平移整句"
          @pointerdown.stop="moveSentence"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="
            drag = null;
            editor.clearPreview();
          "
          @click.stop
          @keydown.escape.stop="
            drag = null;
            editor.clearPreview();
          "
        >
          ↔
        </button>
        <span
          >第 {{ editor.lineIndex + 1 }} 行
          <small v-if="editor.displayLine?.endMs === null">· 参考</small></span
        >
      </div>
      <WaveformRegions
        :view="viewport"
        :width="width"
        @select="
          (li, ui) =>
            selectPoint({
              key: '',
              lineIndex: li,
              unitIndex: ui ?? 0,
              time: 0,
              label: '',
              end: false,
            })
        "
        @audition="auditionRegion"
      />
      <div class="point-layer">
        <button
          v-for="point in visiblePoints"
          :key="point.key"
          class="time-marker"
          :class="{
            active:
              point.lineIndex === editor.lineIndex &&
              (editor.project.stage === 2 ||
                point.unitIndex === editor.selectedUnit),
            ending: point.end,
            conflict: pointConflict(point),
          }"
          :disabled="editor.editingText"
          role="slider"
          :aria-label="`${point.label}时间边界`"
          :aria-valuemin="bounds(point)[0]"
          :aria-valuemax="bounds(point)[1]"
          :aria-valuenow="point.time"
          :aria-valuetext="formatTime(point.time)"
          :style="{
            left: `${left(drag?.key === point.key ? drag.ms : point.time)}%`,
          }"
          @pointerdown="startDrag($event, point)"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="
            drag = null;
            editor.clearPreview();
          "
          @keydown="markerKey($event, point)"
          @click.stop="selectPoint(point)"
        >
          <i /><small v-if="drag?.key === point.key">{{
            formatTime(drag.ms)
          }}</small>
        </button>
      </div>
    </div>
    <div v-if="editor.asset" class="wave-overview">
      <span>0:00</span>
      <div
        class="overview-track"
        aria-label="全曲波形概览"
        @pointerdown="overview"
        @pointermove="
          (event) => {
            if (event.buttons === 1) overview(event);
          }
        "
      >
        <i
          :style="{
            left: (view.startTime / editor.asset.buffer.duration) * 100 + '%',
            width:
              Math.min(100, (span / editor.asset.buffer.duration) * 100) + '%',
          }"
        />
      </div>
      <time>{{ formatTime(editor.asset.info.durationMs).slice(0, 5) }}</time>
      <input
        class="sr-only"
        type="range"
        aria-label="波形视窗起点"
        :value="view.startTime * 1000"
        min="0"
        :max="Math.max(0, editor.asset.info.durationMs - span * 1000)"
        @input="
          following = false;
          scrollTo(Number(($event.target as HTMLInputElement).value) / 1000);
        "
      />
    </div>
    <button
      class="wave-height-handle"
      aria-label="调整波形高度"
      title="拖动调整波形高度"
      @pointerdown="heightStart"
      @pointermove="heightMove"
      @pointerup="heightDrag = null"
      @pointercancel="heightDrag = null"
      @keydown.up.prevent="waveHeight = Math.max(120, (waveHeight || 180) - 10)"
      @keydown.down.prevent="
        waveHeight = Math.min(400, (waveHeight || 180) + 10)
      "
    >
      <i />
    </button>
    <AudioBar embedded @audio="emit('audio')" />
    <span v-if="drag" class="wave-drag-readout"
      >{{ drag.point.label }} {{ formatTime(drag.ms) }} ·
      {{ drag.ms - drag.point.time >= 0 ? "+" : ""
      }}{{ drag.ms - drag.point.time }}ms</span
    >
  </section>
</template>
