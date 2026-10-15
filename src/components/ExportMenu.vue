<script setup lang="ts">
import { computed, ref } from "vue";
import type { Menu } from "mdui/components/menu.js";
import { editor } from "../state/editor";
import { partKindLabels } from "../domain/parts";
import UiButton from "./UiButton.vue";
import UiToggle from "./UiToggle.vue";
import Modal from "./Modal.vue";
const ttmlOpen = ref(false),
  foldRuby = ref(false);
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
  menu.value = "";
  editor.pause();
  if (value === "ttml") ttmlOpen.value = true;
  else if (value === "lrc") editor.exportLrc();
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
      <mdui-menu-item value="lrc"
        >增强 LRC<small class="export-hint"
          >兼容格式，仅主声部</small
        ></mdui-menu-item
      >
    </mdui-menu>
  </mdui-dropdown>
  <Modal :open="ttmlOpen" title="导出 TTML" @close="ttmlOpen = false">
    <p class="small-note">
      AMLL 风格的
      TTML：每个声部是一个演唱者，和声附在重叠最长的主行下。导出前需要所有声部都已打完。
    </p>
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
    <p v-if="hasRuby" class="small-note">
      带时间的注音目前只确认 AMLL 会正确显示；其他播放器可能把字和读音连在一起。
    </p>
    <footer>
      <UiButton @click="ttmlOpen = false">取消</UiButton
      ><UiButton variant="filled" icon="download" @click="exportTtml"
        >导出 TTML</UiButton
      >
    </footer>
  </Modal>
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
