<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import type { AssStyle } from "../domain/assStyle";
import { effectStrength } from "../domain/assEffects";
import UiButton from "./UiButton.vue";
const props = defineProps<{ settings: AssStyle; partColor: string }>();
const playing = ref(false),
  time = ref(1700),
  light = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let media: MediaQueryList | undefined;
function stopForPreference(event: MediaQueryListEvent) {
  if (event.matches) playing.value = false;
}
onMounted(() => {
  media = window.matchMedia("(prefers-reduced-motion: reduce)");
  playing.value = !media.matches;
  media.addEventListener("change", stopForPreference);
  timer = setInterval(() => {
    if (playing.value && !document.hidden)
      time.value = (time.value + 50) % 6000;
  }, 50);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  media?.removeEventListener("change", stopForPreference);
});
watch(
  () => props.settings.effects.preset,
  () => {
    time.value = playing.value ? 0 : 1700;
  },
);
function replay() {
  time.value = 0;
  playing.value = true;
}
const strength = computed(() => effectStrength(props.settings.effects));
const mainColor = computed(() =>
  props.settings.colorMode === "solid"
    ? props.settings.solidColor
    : props.partColor,
);
const previewStyle = computed(() => ({
  "--main-color": mainColor.value,
  "--ruby-color": props.settings.rubyColor ?? mainColor.value,
  "--roman-color": props.settings.romanColor,
  "--unsung-color": props.settings.unsungColor,
  "--outline-color": props.settings.outlineColor,
  "--fx-color": props.settings.effects.color ?? props.partColor,
  "--main-size": `${Math.max(20, Math.min(48, props.settings.mainSize * 0.5))}px`,
  "--ruby-size": `${Math.max(10, Math.min(24, props.settings.rubySize * 0.5))}px`,
  "--roman-size": `${Math.max(10, Math.min(22, props.settings.romanSize * 0.5))}px`,
  "--outline-width": `${Math.min(3.6, props.settings.outline * 0.35)}px`,
  "--glow": `${(props.settings.effects.preset === "neon" ? 12 : 6) * strength.value}px`,
  fontFamily: `"${props.settings.font.replace(/"/g, "")}", "Noto Sans CJK JP", serif`,
}));
const lines = [
  {
    words: [
      { text: "四角", ruby: "しかく", start: 1000 },
      { text: "い", ruby: "", start: 1700 },
      { text: "部屋", ruby: "へや", start: 2400 },
    ],
    roman: "shikakui heya",
    enter: 300,
  },
  {
    words: [
      { text: "の", ruby: "", start: 3400 },
      { text: "片隅", ruby: "かたすみ", start: 4100 },
    ],
    roman: "no katasumi",
    enter: 2800,
  },
];
const progress = (start: number) =>
  Math.max(0, Math.min(1, (time.value - start) / 650));
function unitStyle(start: number) {
  const p = progress(start),
    active = time.value >= start && time.value < start + 300;
  const wave = active ? Math.sin(((time.value - start) / 300) * Math.PI) : 0;
  return {
    transform:
      props.settings.effects.preset === "bounce"
        ? `translateY(${-wave * 4 * strength.value}px) scale(${1 + wave * 0.08 * strength.value})`
        : undefined,
    "--clip-left": `${Math.max(0, p * 120 - 20)}%`,
    "--clip-right": `${Math.max(0, 100 - p * 120)}%`,
  };
}
function contentStyle(enter: number) {
  const p = Math.max(0, Math.min(1, (time.value - enter) / 320));
  return props.settings.effects.preset === "float"
    ? { transform: `translateY(${(1 - p) * 8 * strength.value}px)`, opacity: p }
    : {};
}
function particleStyle(start: number, index: number) {
  const p = (time.value - start - index * 30) / 450;
  return {
    left: `${25 + index * 20}%`,
    opacity: p >= 0 && p <= 1 ? Math.sin(Math.PI * p) : 0,
    transform: `translate(${(index - 1) * p * 15 * strength.value}px,${-p * 18 * strength.value}px)`,
  };
}
</script>
<template>
  <div class="effect-preview" :style="previewStyle">
    <div
      class="preview-stage"
      :class="[
        `is-${settings.layout}`,
        `effect-${settings.effects.preset}`,
        { light },
      ]"
      role="img"
      aria-label="字幕特效示意预览"
      :data-playing="playing"
    >
      <div
        v-for="(line, li) in lines"
        :key="li"
        class="preview-block"
        :class="li ? 'block-b' : 'block-a'"
      >
        <div class="preview-content" :style="contentStyle(line.enter)">
          <div class="preview-main" :class="{ bold: settings.mainBold }">
            <span
              v-for="word in line.words"
              :key="word.start"
              class="preview-unit"
              :class="{
                unsung: time < word.start,
                active: time >= word.start && time < word.start + 650,
              }"
              :style="unitStyle(word.start)"
            >
              <ruby v-if="word.ruby"
                ><span class="unit-body" :data-text="word.text">{{
                  word.text
                }}</span
                ><rt :class="{ bold: settings.rubyBold }">{{
                  word.ruby
                }}</rt></ruby
              >
              <span v-else class="unit-body" :data-text="word.text">{{
                word.text
              }}</span>
              <template v-if="settings.effects.preset === 'particles'">
                <i
                  v-for="i in settings.effects.intensity === 'low'
                    ? 1
                    : settings.effects.intensity === 'high'
                      ? 3
                      : 2"
                  :key="i"
                  class="particle"
                  :style="particleStyle(word.start, i - 1)"
                />
              </template>
            </span>
          </div>
          <span
            v-if="settings.includeRoman"
            class="preview-roman"
            :class="{ bold: settings.romanBold }"
            >{{ line.roman }}</span
          >
        </div>
      </div>
    </div>
    <div class="preview-controls">
      <UiButton variant="text" @click="playing = !playing">{{
        playing ? "暂停示意" : "播放示意"
      }}</UiButton>
      <UiButton variant="text" @click="replay">重播</UiButton>
      <button
        type="button"
        class="background-toggle"
        :aria-pressed="light"
        aria-label="浅色预览背景"
        @click="light = !light"
      >
        <span />
      </button>
    </div>
    <p class="preview-note">效果示意 · 最终效果以 ASS 播放为准</p>
  </div>
</template>
<style scoped>
.preview-stage {
  position: relative;
  height: 248px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background:
    radial-gradient(circle at 20% 10%, #183848, transparent 70%), #10151a;
  color: #fff;
}
.preview-stage.light {
  background:
    radial-gradient(circle at 80% 10%, #d3e5e7, transparent 70%), #eeeeea;
}
.preview-stage::before {
  position: absolute;
  inset: 0;
  content: "";
  background-image:
    linear-gradient(#ffffff08 1px, transparent 1px),
    linear-gradient(90deg, #ffffff08 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
}
.preview-block {
  position: absolute;
  white-space: nowrap;
}
.block-a {
  left: 8%;
  bottom: 12%;
}
.block-b {
  right: 8%;
  top: 10%;
}
.is-diagonal .block-a {
  top: 10%;
  bottom: auto;
}
.is-diagonal .block-b {
  bottom: 12%;
  top: auto;
}
.is-single .block-a {
  left: 50%;
  transform: translateX(-50%);
}
.is-single .block-b {
  display: none;
}
.preview-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.block-b .preview-content {
  align-items: flex-end;
}
.is-single .preview-content {
  align-items: center;
}
.preview-main {
  color: var(--main-color);
  font-size: var(--main-size);
  line-height: 1.15;
}
.preview-unit {
  position: relative;
  display: inline-block;
  transform-origin: center bottom;
}
.preview-main,
rt,
.preview-roman {
  -webkit-text-stroke: var(--outline-width) var(--outline-color);
  paint-order: stroke fill;
}
.unsung {
  color: var(--unsung-color);
}
rt {
  color: var(--ruby-color);
  font-size: var(--ruby-size);
  font-weight: 400;
}
.unsung rt {
  color: var(--unsung-color);
}
.preview-roman {
  color: var(--roman-color);
  font-size: var(--roman-size);
  line-height: 1.1;
}
.bold {
  font-weight: 700;
}
.preview-stage:not(.effect-none) .preview-main {
  text-shadow:
    0 0 var(--glow) var(--fx-color),
    0 0 3px var(--fx-color);
}
.effect-outline .preview-main {
  text-shadow:
    2px 2px var(--outline-color),
    -2px -2px var(--fx-color),
    2px -2px var(--fx-color),
    -2px 2px var(--fx-color) !important;
}
.effect-neon .active {
  filter: brightness(1.3);
}
.effect-sweep .active .unit-body::after {
  position: absolute;
  left: 0;
  content: attr(data-text);
  color: var(--fx-color);
  clip-path: inset(0 var(--clip-right) 0 var(--clip-left));
  -webkit-text-stroke: 0;
}
.particle {
  position: absolute;
  top: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--fx-color);
  box-shadow: 0 0 3px var(--fx-color);
  pointer-events: none;
}
.preview-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 8px;
}
.preview-controls :deep(mdui-button) {
  --mdui-typescale-label-large-size: 12px;
  min-width: 0;
}
.background-toggle {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--sheet);
  cursor: pointer;
}
.background-toggle span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(90deg, #eeeeea 50%, #17202b 50%);
  border: 1px solid var(--muted);
}
.preview-note {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
@media (max-width: 780px) {
  .preview-stage {
    height: 230px;
  }
}
</style>
