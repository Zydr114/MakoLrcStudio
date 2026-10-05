<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import WaveSurfer from "wavesurfer.js";
import { editor } from "../state/editor";
import { formatTime } from "../domain/model";
import {
  unitBounds,
  lineStartBounds,
  setUnitStart,
  setLineStart,
  setLineEnd,
} from "../domain/edit";
import Icon from "./Icon.vue";
import WaveformRegions from "./WaveformRegions.vue";
import { timeToRatio, ratioToTime } from "../domain/viewport";

const host = ref<HTMLDivElement>(),
  view = ref({ startTime: 0, endTime: 10 }),
  zoom = ref(100),
  width = ref(0),
  following = ref(true);
const viewport = computed(() => ({
  startMs: view.value.startTime * 1000,
  endMs: view.value.endTime * 1000,
}));
const drag = ref<{ key: string; ms: number; point: Point } | null>(null);
let wave: WaveSurfer | null = null,
  unsubscribe: (() => void) | undefined,
  resize: ResizeObserver | null = null;
interface Point {
  key: string;
  lineIndex: number;
  unitIndex: number;
  time: number;
  label: string;
  end: boolean;
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
const span = computed(() =>
  Math.max(0.001, view.value.endTime - view.value.startTime),
);
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
  if (editor.project.stage === 2)
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
  if (p.stage === 2) setLineStart(p, point.lineIndex, ms);
  else if (point.end) setLineEnd(p, point.lineIndex, ms);
  else setUnitStart(p, point.lineIndex, point.unitIndex, ms);
}
function setPoint(point: Point, ms: number) {
  return editor.command("调整时间边界", (p) => applyPoint(p, point, ms));
}
function selectPoint(point: Point) {
  if (editor.recordingArmed) editor.pause();
  if (editor.project.stage === 2)
    editor.view({ activeLineId: editor.project.lines[point.lineIndex].id });
  else {
    editor.selectedUnit = Math.min(
      point.unitIndex,
      (editor.line?.units.length ?? 1) - 1,
    );
    editor.selectionEnd = editor.selectedUnit;
  }
}
function pointerTime(event: PointerEvent) {
  const rect = host.value!.getBoundingClientRect();
  return ratioToTime((event.clientX - rect.left) / rect.width, viewport.value);
}
function startDrag(event: PointerEvent, point: Point) {
  if (event.button !== 0) return;
  if (editor.recordingArmed) editor.pause();
  following.value = false;
  drag.value = { key: point.key, ms: point.time, point };
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
  drag.value.ms = Math.max(min, Math.min(pointerTime(event), max));
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
  if (event.key === "Escape") {
    drag.value = null;
    editor.clearPreview();
    event.stopPropagation();
    return;
  }
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
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
function fit() {
  if (!wave || !host.value || !editor.asset) return;
  following.value = true;
  const line = editor.line;
  const start = Math.max(0, (line?.startMs ?? editor.positionMs) / 1000 - 1);
  const end = Math.min(
    editor.asset.buffer.duration,
    line?.endMs !== null && line?.endMs !== undefined
      ? line.endMs / 1000 + 0.5
      : Math.min(
          editor.project.lines[editor.lineIndex + 1]?.startMs !== null &&
            editor.project.lines[editor.lineIndex + 1]?.startMs !== undefined
            ? editor.project.lines[editor.lineIndex + 1].startMs! / 1000 + 0.3
            : start + 12,
          start + 18,
        ),
  );
  zoom.value = Math.max(
    10,
    Math.min(1000, host.value.clientWidth / Math.max(1, end - start)),
  );
  wave.zoom(zoom.value);
  wave.setScrollTime(start);
}
function setZoom(value: number) {
  zoom.value = value;
  wave?.zoom(value);
  wave?.setScrollTime(Math.max(0, editor.positionMs / 1000 - span.value * 0.3));
}
async function mountWave() {
  unsubscribe?.();
  wave?.destroy();
  await nextTick();
  if (!host.value || !editor.asset) return;
  const color = getComputedStyle(host.value).color;
  wave = WaveSurfer.create({
    container: host.value,
    peaks: [editor.asset.peaks],
    duration: editor.asset.buffer.duration,
    height: host.value.clientHeight || 96,
    waveColor: color,
    progressColor: color,
    cursorWidth: 0,
    interact: false,
    autoScroll: false,
    autoCenter: false,
    normalize: true,
    hideScrollbar: false,
  });
  const signal = wave.getRenderer().getVisibleRange();
  unsubscribe = signal.subscribe((value) => {
    view.value = value;
  });
  view.value = signal.value;
  wave.on("ready", fit);
}
watch(() => editor.asset, mountWave);
watch(
  () => [editor.project.activeLineId, editor.project.stage],
  () => {
    if (!drag.value && !editor.playing) nextTick(fit);
  },
);
watch(
  () => editor.positionMs,
  (value) => {
    if (!wave || !editor.playing || drag.value || !following.value) return;
    const t = value / 1000;
    if (t > view.value.endTime - span.value * 0.16 || t < view.value.startTime)
      wave.setScrollTime(Math.max(0, t - span.value * 0.3));
  },
);
function wheel(event: WheelEvent) {
  if (!wave) return;
  event.preventDefault();
  following.value = false;
  if (event.altKey)
    setZoom(
      Math.max(
        10,
        Math.min(1000, zoom.value * (event.deltaY < 0 ? 1.15 : 0.85)),
      ),
    );
  else
    wave.setScrollTime(
      Math.max(
        0,
        view.value.startTime + (event.deltaX || event.deltaY) / zoom.value,
      ),
    );
}
function updateTheme() {
  if (host.value)
    wave?.setOptions({
      waveColor: getComputedStyle(host.value).color,
      progressColor: getComputedStyle(host.value).color,
    });
}
onMounted(() => {
  void mountWave();
  document.addEventListener("mako-theme", updateTheme);
  resize = new ResizeObserver(() => {
    if (host.value) {
      width.value = host.value.clientWidth;
      wave?.setOptions({ height: host.value.clientHeight });
    }
    if (!editor.playing && !drag.value) fit();
  });
  if (host.value) resize.observe(host.value);
});
onBeforeUnmount(() => {
  document.removeEventListener("mako-theme", updateTheme);
  unsubscribe?.();
  resize?.disconnect();
  wave?.destroy();
  if (editor.previewOwner === "waveform") editor.clearPreview();
});
</script>
<template>
  <div class="wave-panel">
    <div class="wave-toolbar">
      <span class="small-note">波形</span>
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
            wave?.setScrollTime(
              Math.max(0, editor.positionMs / 1000 - span * 0.3),
            );
          "
        >
          回到播放头</button
        ><button class="text-link" @click="fit">适合当前句</button>
      </div>
    </div>
    <div class="wave-stage" @click="seek" @wheel="wheel">
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
        @audition="editor.review()"
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
          }"
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
          <span>{{ point.label }}</span
          ><i /><small v-if="drag?.key === point.key">{{
            formatTime(drag.ms)
          }}</small>
        </button>
      </div>
    </div>
  </div>
</template>
