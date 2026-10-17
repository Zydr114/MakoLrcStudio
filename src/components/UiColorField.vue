<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import type { Button } from "mdui/components/button.js";
import type { Dropdown } from "mdui/components/dropdown.js";
import UiButton from "./UiButton.vue";
import UiField from "./UiField.vue";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    showLabel?: boolean;
    disabled?: boolean;
  }>(),
  { showLabel: true, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const trigger = ref<Button>();
const dropdown = ref<Dropdown>();
const area = ref<HTMLDivElement>();
const hueBar = ref<HTMLDivElement>();
const hue = ref(0);
const saturation = ref(0);
const value = ref(1);
const hexDraft = ref(props.modelValue);
const presets = [
  "#ffffff",
  "#e0e0e0",
  "#9e9e9e",
  "#616161",
  "#202020",
  "#000000",
  "#01cff0",
  "#64b5f6",
  "#81c784",
  "#ffb74d",
  "#ff8a65",
  "#ba68c8",
];
const valid = computed(() => /^#[0-9a-f]{6}$/i.test(props.modelValue));
const pretty = computed(() =>
  valid.value ? props.modelValue.toUpperCase() : "无效颜色",
);
const hueColor = computed(() => `hsl(${hue.value} 100% 50%)`);
const areaStyle = computed(() => ({ backgroundColor: hueColor.value }));
const areaHandle = computed(() => ({
  left: `${saturation.value * 100}%`,
  top: `${(1 - value.value) * 100}%`,
}));
const hueHandle = computed(() => ({
  left: `${(hue.value / 360) * 100}%`,
}));
function normalizeHex(input: string): string | null {
  const raw = input.trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/i.test(withHash) ? withHash.toLowerCase() : null;
}
function hexToHsv(input: string) {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const byte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
function syncFromHex(input: string) {
  const next = hexToHsv(input);
  if (!next) return;
  if (
    hsvToHex(hue.value, saturation.value, value.value) === normalizeHex(input)
  )
    return;
  if (next.s > 0) hue.value = next.h;
  if (next.v > 0) saturation.value = next.s;
  value.value = next.v;
}
function emitColor() {
  const next = hsvToHex(hue.value, saturation.value, value.value);
  hexDraft.value = next;
  if (next !== props.modelValue.toLowerCase()) emit("update:modelValue", next);
}
function applyHex(input: string) {
  const hex = normalizeHex(input);
  const next = hex ? hexToHsv(hex) : null;
  if (!hex || !next) return;
  if (next.s > 0) hue.value = next.h;
  if (next.v > 0) saturation.value = next.s;
  value.value = next.v;
  hexDraft.value = hex;
  if (hex !== props.modelValue.toLowerCase()) emit("update:modelValue", hex);
}
function onHexInput(input: string) {
  hexDraft.value = input;
  const hex = normalizeHex(input);
  if (hex) applyHex(hex);
}
function updateArea(event: PointerEvent) {
  if (!area.value) return;
  const rect = area.value.getBoundingClientRect();
  saturation.value = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  value.value =
    1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  emitColor();
}
function updateHue(event: PointerEvent) {
  if (!hueBar.value) return;
  const rect = hueBar.value.getBoundingClientRect();
  hue.value =
    360 * Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  emitColor();
}
let areaDragging = false;
let hueDragging = false;
function areaDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  areaDragging = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updateArea(event);
}
function areaMove(event: PointerEvent) {
  if (areaDragging) updateArea(event);
}
function areaUp() {
  areaDragging = false;
}
function hueDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  hueDragging = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updateHue(event);
}
function hueMove(event: PointerEvent) {
  if (hueDragging) updateHue(event);
}
function hueUp() {
  hueDragging = false;
}
function nudgeHue(event: KeyboardEvent) {
  const step = event.shiftKey ? 10 : 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    hue.value = Math.max(0, hue.value - step);
  } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    hue.value = Math.min(360, hue.value + step);
  } else {
    return;
  }
  event.preventDefault();
  emitColor();
}
function closePicker() {
  if (dropdown.value) dropdown.value.open = false;
}
function onClosed() {
  hexDraft.value = props.modelValue;
  syncFromHex(props.modelValue);
}
watch(
  () => props.modelValue,
  (next) => {
    hexDraft.value = next;
    syncFromHex(next);
  },
  { immediate: true },
);
watchEffect(() => {
  if (dropdown.value) dropdown.value.stayOpenOnClick = true;
});
watchEffect(async () => {
  const element = trigger.value;
  if (!element) return;
  await element.updateComplete;
  element.shadowRoot
    ?.querySelector("[part=button]")
    ?.setAttribute("aria-label", props.label);
});
</script>
<template>
  <div class="ui-color-field" :class="{ 'has-caption': showLabel }">
    <span v-if="showLabel" class="field-caption">{{ label }}</span>
    <mdui-dropdown
      ref="dropdown"
      trigger="click"
      placement="auto"
      :disabled="disabled"
      @closed="onClosed"
    >
      <mdui-button
        ref="trigger"
        slot="trigger"
        variant="outlined"
        class="color-trigger"
        :disabled="disabled"
      >
        <span class="sr-only">{{ label }}：</span>
        <span
          class="swatch"
          :class="{ invalid: !valid }"
          :style="valid ? { backgroundColor: modelValue } : undefined"
        />
        <span class="hex">{{ pretty }}</span>
      </mdui-button>
      <div class="color-popover" role="dialog" :aria-label="`${label}取色器`">
        <div
          ref="area"
          class="sv-area"
          :style="areaStyle"
          @pointerdown="areaDown"
          @pointermove="areaMove"
          @pointerup="areaUp"
          @pointercancel="areaUp"
        >
          <span class="sv-white" />
          <span class="sv-black" />
          <span class="sv-handle" :style="areaHandle" />
        </div>
        <div
          ref="hueBar"
          class="hue-track"
          role="slider"
          tabindex="0"
          aria-label="色相"
          aria-valuemin="0"
          aria-valuemax="360"
          :aria-valuenow="Math.round(hue)"
          @pointerdown="hueDown"
          @pointermove="hueMove"
          @pointerup="hueUp"
          @pointercancel="hueUp"
          @keydown="nudgeHue"
        >
          <span class="hue-handle" :style="hueHandle" />
        </div>
        <UiField
          class="hex-field"
          label="HEX"
          :aria-label="`${label} 十六进制值`"
          :model-value="hexDraft"
          placeholder="#RRGGBB"
          @update:model-value="onHexInput"
        />
        <div class="presets" role="group" aria-label="预设颜色">
          <button
            v-for="preset in presets"
            :key="preset"
            type="button"
            class="preset"
            :class="{ selected: preset === modelValue.toLowerCase() }"
            :style="{ backgroundColor: preset }"
            :aria-label="`使用颜色 ${preset}`"
            :title="preset"
            @click="applyHex(preset)"
          />
        </div>
        <div class="picker-footer">
          <UiButton variant="text" @click="closePicker">完成</UiButton>
        </div>
      </div>
    </mdui-dropdown>
  </div>
</template>
<style scoped>
.ui-color-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field-caption {
  color: var(--muted);
  font-size: 11px;
}
mdui-dropdown {
  display: block;
  width: 100%;
}
.color-trigger {
  width: 100%;
}
.color-trigger::part(button) {
  justify-content: flex-start;
  gap: 8px;
  min-height: 40px;
  padding: 0 12px;
}
.swatch {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 1px solid var(--line);
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}
.swatch.invalid {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    var(--line) 4px,
    var(--line) 5px
  );
}
.hex {
  min-width: 0;
  color: var(--ink);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.color-popover {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 268px;
  max-width: calc(100vw - 48px);
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--sheet);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
}
.sv-area {
  position: relative;
  height: 142px;
  overflow: hidden;
  border-radius: 12px;
  cursor: crosshair;
  touch-action: none;
}
.sv-white,
.sv-black {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.sv-white {
  background: linear-gradient(to right, #fff, transparent);
}
.sv-black {
  background: linear-gradient(to top, #000, transparent);
}
.sv-handle {
  position: absolute;
  width: 15px;
  height: 15px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.22),
    0 1px 5px rgba(0, 0, 0, 0.45);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hue-track {
  position: relative;
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    #f00,
    #ff0,
    #0f0,
    #0ff,
    #00f,
    #f0f,
    #f00
  );
  cursor: pointer;
  touch-action: none;
}
.hue-handle {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.2),
    0 1px 4px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hue-track:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.hex-field {
  width: 100%;
}
.presets {
  display: grid;
  grid-template-columns: repeat(6, 20px);
  gap: 8px;
}
.preset {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}
.preset.selected {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.picker-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
