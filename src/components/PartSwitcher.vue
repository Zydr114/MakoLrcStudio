<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { Menu } from "mdui/components/menu.js";
import { editor } from "../state/editor";
import { partKindLabels } from "../domain/parts";
const open = ref(false);
const current = computed(
  () =>
    editor.partStats.find((part) => part.id === editor.project.activePartId) ??
    editor.partStats[0],
);
const parts = computed(() =>
  editor.partStats.map((stats) => {
    const part = editor.project.parts.find((item) => item.id === stats.id)!;
    return {
      ...stats,
      main: part.id === editor.project.mainPartId,
      detail: part.background ? "和声" : partKindLabels[part.kind],
    };
  }),
);
function change(event: Event) {
  const value = (event.currentTarget as Menu).value as string;
  open.value = false;
  if (!value || value === editor.project.activePartId) return;
  editor.switchPart(value);
  if (editor.project.stage >= 2)
    void nextTick(() =>
      document
        .querySelector<HTMLElement>("[data-workspace]")
        ?.focus({ preventScroll: true }),
    );
}
</script>
<template>
  <mdui-dropdown
    class="part-switcher"
    placement="bottom-end"
    :open="open"
    @open="open = true"
    @close="open = false"
  >
    <button
      slot="trigger"
      class="part-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`当前声部：${current.name}，${current.done} / ${current.total} 行，切换声部`"
      :title="`切换声部（${editor.project.parts.length} 个）`"
    >
      <i class="part-dot" :style="{ background: current.color }" />
      <span class="part-trigger-name">{{ current.name }}</span>
      <small>{{ current.done }}/{{ current.total }}</small>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="m7 10 5 5 5-5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        />
      </svg>
    </button>
    <mdui-menu
      selects="single"
      :value="editor.project.activePartId"
      aria-label="声部"
      @change="change"
    >
      <mdui-menu-item v-for="part in parts" :key="part.id" :value="part.id">
        <i slot="icon" class="part-dot" :style="{ background: part.color }" />
        <span class="part-menu-label"
          >{{ part.name
          }}<small
            >{{ part.main ? "主声部 · " : "" }}{{ part.detail }} ·
            {{ part.done }}/{{ part.total }}</small
          ></span
        >
      </mdui-menu-item>
    </mdui-menu>
  </mdui-dropdown>
</template>
<style scoped>
.part-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  max-width: 260px;
  padding: 0 8px 0 12px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.part-trigger:hover {
  background: var(--soft);
}
.part-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.part-trigger-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.part-menu-label {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
mdui-menu {
  min-width: 220px;
}
.part-trigger small,
.part-menu-label small {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.part-dot {
  flex: 0 0 auto;
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
mdui-menu-item .part-dot {
  margin: 0 7px;
}
</style>
