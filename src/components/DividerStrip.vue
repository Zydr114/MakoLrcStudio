<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { graphemes } from "../domain/tokenize";
import { characterGaps } from "../domain/segmentation";
/**
 * Dividers between full characters: click toggles one, drag or arrow keys move
 * it, Delete removes it, Enter applies and Escape cancels.
 */
const props = withDefaults(
  defineProps<{
    text: string;
    cuts: number[];
    /** Throws with a message when a set of dividers is not allowed. */
    check: (cuts: number[]) => void;
    large?: boolean;
  }>(),
  { large: true },
);
const emit = defineEmits<{
  "update:cuts": [cuts: number[]];
  apply: [];
  cancel: [];
  error: [message: string];
}>();
const local = ref([...props.cuts]),
  activeGap = ref<number | null>(null),
  row = ref<HTMLDivElement>();
watch(
  () => props.cuts,
  (cuts) => (local.value = [...cuts]),
);
const chars = computed(() => graphemes(props.text));
const gaps = computed(() => characterGaps(props.text));
let drag: {
  offset: number;
  left: number;
  right: number;
  origin: number;
  moved: boolean;
  /** Pointer travel beyond a click, even when the divider could not move. */
  dragged: boolean;
  startX: number;
  x: number;
} | null = null;
let scrollFrame = 0,
  ignoreClick: number | null = null;
function stopDrag() {
  drag = null;
  cancelAnimationFrame(scrollFrame);
}
function update(next: number[]) {
  next.sort((a, b) => a - b);
  try {
    props.check(next);
  } catch (error) {
    emit("error", (error as Error).message);
    return false;
  }
  emit("error", "");
  local.value = next;
  emit("update:cuts", next);
  return true;
}
function focusGap(offset: number) {
  void nextTick(() =>
    row.value
      ?.querySelector<HTMLElement>(`[data-gap-offset="${offset}"]`)
      ?.focus(),
  );
}
/** A click toggles: add on an empty gap, remove an existing divider. */
function clickGap(offset: number) {
  if (ignoreClick === offset) {
    ignoreClick = null;
    return;
  }
  if (local.value.includes(offset)) remove(offset);
  else if (update([...local.value, offset])) {
    activeGap.value = offset;
    focusGap(offset);
  }
}
function remove(offset: number) {
  update(local.value.filter((cut) => cut !== offset));
  activeGap.value = null;
}
function groupIndex(charIndex: number) {
  const offset = charIndex === 0 ? 0 : gaps.value[charIndex - 1];
  return local.value.filter((cut) => cut <= offset).length;
}
function start(event: PointerEvent, offset: number) {
  if (event.button !== 0 || !local.value.includes(offset)) return;
  const index = local.value.indexOf(offset);
  activeGap.value = offset;
  drag = {
    offset,
    left: local.value[index - 1] ?? 0,
    right: local.value[index + 1] ?? props.text.length,
    origin: offset,
    moved: false,
    dragged: false,
    startX: event.clientX,
    x: event.clientX,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  (event.currentTarget as HTMLElement).focus();
  event.stopPropagation();
  autoScroll();
}
function moveTo(x: number) {
  if (!drag || !row.value) return;
  const options = Array.from(
    row.value.querySelectorAll<HTMLElement>("[data-gap-offset]"),
  ).filter(
    (gap) =>
      Number(gap.dataset.gapOffset) > drag!.left &&
      Number(gap.dataset.gapOffset) < drag!.right,
  );
  const nearest = options.sort(
    (a, b) =>
      Math.abs(a.getBoundingClientRect().x + a.offsetWidth / 2 - x) -
      Math.abs(b.getBoundingClientRect().x + b.offsetWidth / 2 - x),
  )[0];
  if (!nearest) return;
  const offset = Number(nearest.dataset.gapOffset);
  if (offset === drag.offset) return;
  if (update(local.value.map((cut) => (cut === drag!.offset ? offset : cut)))) {
    drag.offset = offset;
    drag.moved = true;
    activeGap.value = offset;
  }
}
function move(event: PointerEvent) {
  if (!drag) return;
  drag.x = event.clientX;
  if (Math.abs(drag.x - drag.startX) > 4) drag.dragged = true;
  moveTo(event.clientX);
}
function autoScroll() {
  if (!drag || !row.value) return;
  const box = row.value.getBoundingClientRect();
  if (drag.x < box.left + 24) {
    row.value.scrollLeft -= 12;
    moveTo(drag.x);
  } else if (drag.x > box.right - 24) {
    row.value.scrollLeft += 12;
    moveTo(drag.x);
  }
  scrollFrame = requestAnimationFrame(autoScroll);
}
function end() {
  if (drag?.dragged) {
    ignoreClick = drag.origin;
    setTimeout(() => (ignoreClick = null), 350);
  }
  const movedOffset = drag?.moved ? drag.offset : null;
  stopDrag();
  if (movedOffset !== null) focusGap(movedOffset);
}
function key(event: KeyboardEvent, offset: number) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    stopDrag();
    emit("cancel");
    return;
  }
  // Enter on any gap confirms, so it never adds a divider by native click.
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    stopDrag();
    emit("apply");
    return;
  }
  if (!local.value.includes(offset)) return;
  if (["Delete", "Backspace"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    remove(offset);
    return;
  }
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const index = gaps.value.indexOf(offset),
    next = gaps.value[index + (event.key === "ArrowRight" ? 1 : -1)],
    cutIndex = local.value.indexOf(offset);
  if (
    next === undefined ||
    next <= (local.value[cutIndex - 1] ?? 0) ||
    next >= (local.value[cutIndex + 1] ?? props.text.length)
  )
    return;
  if (update(local.value.map((cut) => (cut === offset ? next : cut)))) {
    activeGap.value = next;
    focusGap(next);
  }
}
onBeforeUnmount(stopDrag);
defineExpose({ stopDrag });
</script>
<template>
  <div
    ref="row"
    class="character-strip"
    :class="{ small: !large }"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="stopDrag"
  >
    <template v-for="(char, index) in chars" :key="index"
      ><span
        class="grapheme-cell"
        :class="{ alternate: groupIndex(index) % 2 === 1 }"
        :data-group="groupIndex(index)"
        >{{ char.trim() ? char : "␣" }}</span
      ><button
        v-if="index < chars.length - 1"
        class="text-gap"
        :class="{
          divided: local.includes(gaps[index]),
          active: activeGap === gaps[index],
          alternate: groupIndex(index) % 2 === 1,
        }"
        :data-gap-offset="gaps[index]"
        :role="local.includes(gaps[index]) ? 'slider' : undefined"
        :aria-label="
          local.includes(gaps[index])
            ? `文字分隔线 ${index + 1}`
            : `在第 ${index + 1} 个字符后切分`
        "
        :aria-valuenow="local.includes(gaps[index]) ? index + 1 : undefined"
        :aria-valuemin="local.includes(gaps[index]) ? 1 : undefined"
        :aria-valuemax="
          local.includes(gaps[index]) ? chars.length - 1 : undefined
        "
        :title="
          local.includes(gaps[index])
            ? '点击移除；拖动或左右键移动'
            : '点击添加分隔线'
        "
        @pointerdown="start($event, gaps[index])"
        @click="clickGap(gaps[index])"
        @keydown="key($event, gaps[index])"
      >
        <span v-if="!local.includes(gaps[index])">+</span>
      </button></template
    >
  </div>
</template>
<style scoped>
.character-strip {
  display: flex;
  align-items: center;
  overflow: auto;
  white-space: pre;
  min-height: 52px;
  padding: 5px 2px;
  scroll-behavior: auto;
}
.grapheme-cell {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 4px 8px;
  min-width: 34px;
  border-radius: 0;
  font-size: 25px;
  background: rgba(var(--mdui-color-primary), 0.13);
}
.small .grapheme-cell {
  font-size: 20px;
  min-width: 30px;
}
.grapheme-cell.alternate {
  background: rgba(var(--mdui-color-tertiary), 0.13);
}
.text-gap {
  position: relative;
  flex: 0 0 20px;
  width: 20px;
  height: 39px;
  border: 0;
  padding: 0;
  background: rgba(var(--mdui-color-primary), 0.13);
  touch-action: none;
  color: var(--muted);
  cursor: pointer;
}
.text-gap.alternate {
  background: rgba(var(--mdui-color-tertiary), 0.13);
}
.text-gap > span {
  opacity: 0.35;
}
.text-gap:hover > span,
.text-gap:focus-visible > span {
  opacity: 1;
  color: var(--accent);
}
.text-gap.divided {
  height: 42px;
  background: transparent;
  cursor: ew-resize;
}
.text-gap.divided::before {
  content: "";
  position: absolute;
  inset: 2px auto 2px 50%;
  width: 3px;
  transform: translateX(-50%);
  border-radius: 2px;
  background: var(--accent);
}
.text-gap.divided:hover::before {
  width: 5px;
}
.text-gap.active {
  background: var(--accent-soft);
  border-radius: 4px;
  outline: 1px solid var(--accent);
}
</style>
