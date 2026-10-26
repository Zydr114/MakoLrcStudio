<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Menu } from "mdui/components/menu.js";
import { editor } from "../state/editor";
import { partKindLabels } from "../domain/parts";
import {
  assStyleOf,
  assEffectPresets,
  type AssStyle,
} from "../domain/assStyle";
import UiButton from "./UiButton.vue";
import UiToggle from "./UiToggle.vue";
import UiField from "./UiField.vue";
import UiSelect from "./UiSelect.vue";
import Modal from "./Modal.vue";
import AssStyleDialog from "./AssStyleDialog.vue";
const ttmlOpen = ref(false),
  foldRuby = ref(false),
  assOpen = ref(false),
  assStyleOpen = ref(false),
  assBusy = ref(false);
const ass = ref({
  resolution: "1920x1080",
  fill: "kf" as "kf" | "k",
  leadIn: "800",
  introHint: "0",
});
const currentStyle = computed(() => assStyleOf(editor.project));
const effectSummary = computed(() => {
  const effect = currentStyle.value.effects;
  const preset = assEffectPresets.find((p) => p.id === effect.preset)!;
  return (
    preset.title +
    (effect.preset === "none"
      ? ""
      : " · " + { low: "轻", medium: "中", high: "强" }[effect.intensity])
  );
});
const boldLayers = computed(
  () =>
    [
      currentStyle.value.mainBold && "歌词",
      currentStyle.value.rubyBold && "注音",
      currentStyle.value.includeRoman &&
        currentStyle.value.romanBold &&
        "罗马音",
    ]
      .filter(Boolean)
      .join("、") || "无",
);
watch(assOpen, (open) => {
  if (!open) assStyleOpen.value = false;
});
const layoutLabels = {
  classic: "经典双行",
  diagonal: "对角双行",
  single: "单行底部居中",
};
const layoutSummary = computed(() => {
  const style = currentStyle.value;
  return (
    layoutLabels[style.layout] +
    (style.layout === "diagonal" && style.diagonalPreview
      ? " · 双行预告"
      : "") +
    (style.includeRoman ? "" : " · 不含罗马音行")
  );
});
function saveStyle(style: AssStyle) {
  if (editor.setAssStyle(style)) assStyleOpen.value = false;
}
const resolutions = [
  { value: "1920x1080", label: "1920 × 1080" },
  { value: "1280x720", label: "1280 × 720" },
  { value: "3840x2160", label: "3840 × 2160" },
];
const fills = [
  { value: "kf" as const, label: "逐渐填色（\\kf）" },
  { value: "k" as const, label: "整字跳变（\\k）" },
];
async function exportAss() {
  const leadInMs = Number(ass.value.leadIn);
  if (!Number.isSafeInteger(leadInMs) || leadInMs < 0 || leadInMs > 10000) {
    editor.error = "提前显示时间需在 0–10000ms 之间。";
    return;
  }
  const introHintMs = Number(ass.value.introHint);
  if (
    !Number.isSafeInteger(introHintMs) ||
    introHintMs < 0 ||
    introHintMs > 10000
  ) {
    editor.error = "前奏提示时长需在 0–10000ms 之间。";
    return;
  }
  const [width, height] = ass.value.resolution.split("x").map(Number);
  assBusy.value = true;
  await editor.exportAss({
    width,
    height,
    fill: ass.value.fill,
    leadInMs,
    introHintMs,
  });
  assBusy.value = false;
  assOpen.value = false;
}
const parts = computed(() =>
  editor.project.parts.filter((part) => part.lines.length),
);
const hasRuby = computed(() =>
  parts.value.some((part) =>
    part.lines.some((line) => line.units.some((unit) => unit.ruby)),
  ),
);
function choose(event: Event) {
  const menu = event.currentTarget as Menu;
  const value = menu.value as string;
  if (!["ttml", "ass", "lrc"].includes(value)) return;
  editor.pause();
  if (value === "ttml") ttmlOpen.value = true;
  else if (value === "ass") assOpen.value = true;
  else if (value === "lrc") editor.exportLrc();
  // Clear the selection after the dropdown has processed its close. Clearing
  // synchronously can race the next trigger when the same format is exported
  // repeatedly in one session.
  requestAnimationFrame(() => {
    menu.value = "";
  });
}
function exportTtml() {
  // Either way the dialog closes: a failure points at the line to fix.
  editor.exportTtml({ foldRuby: foldRuby.value });
  ttmlOpen.value = false;
}
</script>
<template>
  <mdui-dropdown
    placement="bottom-end"
    :disabled="!editor.lineTotal || editor.editingText"
  >
    <UiButton
      slot="trigger"
      variant="filled"
      icon="download"
      :disabled="!editor.lineTotal || editor.editingText"
      >导出</UiButton
    >
    <mdui-menu selects="single" aria-label="导出格式" @change="choose">
      <mdui-menu-item value="ttml"
        >TTML<small class="export-hint"
          >全部声部、注音、翻译、罗马音</small
        ></mdui-menu-item
      >
      <mdui-menu-item value="ass"
        >ASS<small class="export-hint"
          >成品字幕＋卡拉 OK 源</small
        ></mdui-menu-item
      >
      <mdui-menu-item value="lrc"
        >增强 LRC<small class="export-hint"
          >兼容格式，仅主声部</small
        ></mdui-menu-item
      >
    </mdui-menu>
  </mdui-dropdown>
  <Modal :open="ttmlOpen" title="导出 TTML" @close="ttmlOpen = false">
    <ul class="export-parts">
      <li v-for="part in parts" :key="part.id">
        <i :style="{ background: part.color }" />{{ part.name }}
        <small
          >{{ part.background ? "和声" : partKindLabels[part.kind] }} ·
          {{ part.lines.length }} 行</small
        >
      </li>
    </ul>
    <UiToggle
      v-if="hasRuby"
      v-model="foldRuby"
      label="注音折叠为普通字（给不支持注音的播放器）"
    />
    <footer>
      <UiButton variant="text" @click="ttmlOpen = false">取消</UiButton
      ><UiButton variant="filled" icon="download" @click="exportTtml"
        >导出 TTML</UiButton
      >
    </footer>
  </Modal>
  <Modal :open="assOpen" title="导出 ASS" @close="assOpen = false">
    <div class="ass-style-summary">
      <div>
        <strong>{{ layoutSummary }}</strong>
        <small>{{ currentStyle.font }}</small>
        <small>特效：{{ effectSummary }}</small>
        <small
          >歌词 {{ currentStyle.mainSize }}px · 注音
          {{ currentStyle.rubySize }}px · 罗马音
          {{ currentStyle.romanSize }}px{{
            currentStyle.includeRoman ? "" : "（不导出）"
          }}</small
        >
        <small
          >描边 {{ currentStyle.outline }}px · 粗体：{{ boldLayers }}</small
        >
      </div>
      <UiButton variant="tonal" @click="assStyleOpen = true"
        >编辑样式…</UiButton
      >
    </div>
    <div class="ass-options">
      <UiSelect
        v-model="ass.resolution"
        label="分辨率"
        :options="resolutions"
      />
      <UiSelect v-model="ass.fill" label="填色方式" :options="fills" />
      <UiField v-model="ass.leadIn" label="提前显示（ms）" type="number" />
      <UiField
        v-model="ass.introHint"
        label="前奏提示（ms）"
        type="number"
        placeholder="0 关闭"
      />
    </div>
    <footer>
      <UiButton variant="text" @click="assOpen = false">取消</UiButton
      ><UiButton
        variant="filled"
        icon="download"
        :loading="assBusy"
        :disabled="assBusy"
        @click="exportAss"
        >导出 ASS</UiButton
      >
    </footer>
  </Modal>
  <AssStyleDialog
    :open="assStyleOpen"
    :style="currentStyle"
    :part-color="parts[0]?.color"
    @close="assStyleOpen = false"
    @save="saveStyle"
  />
</template>
<style scoped>
.export-hint {
  display: block;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}
mdui-menu-item::part(container) {
  height: auto;
  min-height: 48px;
  padding-block: 6px;
}
.ass-style-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--soft);
}
.ass-style-summary div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ass-style-summary strong {
  font-size: 14px;
  color: var(--ink);
}
.ass-style-summary small {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.ass-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 12px;
}
.export-parts {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.export-parts li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.export-parts i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.export-parts small {
  color: var(--muted);
}
</style>
