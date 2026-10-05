import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  type Ref,
} from "vue";
import WaveSurfer from "wavesurfer.js";
import { editor } from "../state/editor";

/** WaveSurfer renders peaks only. Visible range is the single overlay coordinate source. */
export function useWaveformViewport(
  host: Ref<HTMLDivElement | undefined>,
  isDragging: () => boolean,
) {
  const view = ref({ startTime: 0, endTime: 10 }),
    zoom = ref(100),
    width = ref(0),
    following = ref(true);
  const span = computed(() =>
    Math.max(0.001, view.value.endTime - view.value.startTime),
  );
  let wave: WaveSurfer | null = null,
    unsubscribe: (() => void) | undefined,
    resize: ResizeObserver | null = null;
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
    wave?.setScrollTime(
      Math.max(0, editor.positionMs / 1000 - span.value * 0.3),
    );
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
  watch([() => editor.project.activeLineId, () => editor.project.stage], () => {
    if (!isDragging() && !editor.playing) nextTick(fit);
  });
  watch(
    () => editor.positionMs,
    (value) => {
      if (!wave || !editor.playing || isDragging() || !following.value) return;
      const t = value / 1000;
      if (
        t > view.value.endTime - span.value * 0.16 ||
        t < view.value.startTime
      )
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
  function overview(event: PointerEvent) {
    if (!wave || !editor.asset) return;
    following.value = false;
    const target = event.currentTarget as HTMLElement;
    if (event.type === "pointerdown") target.setPointerCapture(event.pointerId);
    const box = target.getBoundingClientRect();
    wave.setScrollTime(
      Math.max(
        0,
        ((event.clientX - box.left) / box.width) *
          editor.asset.buffer.duration -
          span.value / 2,
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
      // Height changes and window resizes retain the user's zoom and scroll.
      // WaveSurfer publishes the new visible range through the same viewport.
    });
    if (host.value) resize.observe(host.value);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("mako-theme", updateTheme);
    unsubscribe?.();
    resize?.disconnect();
    wave?.destroy();
  });
  function scrollTo(seconds: number) {
    wave?.setScrollTime(seconds);
  }
  return {
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
  };
}
