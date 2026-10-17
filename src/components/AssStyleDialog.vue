<script setup lang="ts">
import { ref, watch } from "vue";
import {
  assStyleRanges,
  defaultAssStyle,
  normalizeAssStyle,
  type AssLayout,
  type AssStyle,
} from "../domain/assStyle";
import Modal from "./Modal.vue";
import UiButton from "./UiButton.vue";
import UiColorField from "./UiColorField.vue";
import UiField from "./UiField.vue";
import UiSelect from "./UiSelect.vue";
import UiToggle from "./UiToggle.vue";
const props = defineProps<{ open: boolean; style: AssStyle }>();
const emit = defineEmits<{ close: []; save: [style: AssStyle] }>();
const draft = ref<AssStyle>({ ...defaultAssStyle });
watch(
  () => props.open,
  (open) => {
    if (open) draft.value = normalizeAssStyle(props.style);
  },
);
const layouts: { value: AssLayout; label: string }[] = [
  { value: "classic", label: "经典双行（按演唱者左右）" },
  { value: "diagonal", label: "对角双行（左上／右下轮换）" },
  { value: "single", label: "单行底部居中" },
];
function reset() {
  draft.value = { ...defaultAssStyle };
}
function toggleRubyFollow(follow: boolean) {
  draft.value.rubyColor = follow ? null : "#ffffff";
}
function setNumber(
  key: "mainSize" | "rubySize" | "romanSize" | "outline",
  value: string,
) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) draft.value[key] = parsed;
}
function save() {
  emit("save", normalizeAssStyle(draft.value));
}
</script>
<template>
  <Modal :open="open" title="字幕样式" @close="emit('close')">
    <div class="ass-style-form">
      <UiSelect v-model="draft.layout" label="版式预设" :options="layouts" />
      <UiField v-model="draft.font" label="字体" />
      <section class="style-layer">
        <header><strong>三层文字</strong></header>
        <div class="layer-row">
          <strong class="layer-name">歌词主行</strong>
          <UiField
            class="size-field"
            type="number"
            label="歌词字号"
            :model-value="String(draft.mainSize)"
            :min="assStyleRanges.mainSize[0]"
            :max="assStyleRanges.mainSize[1]"
            step="1"
            @update:model-value="setNumber('mainSize', $event)"
          />
          <UiToggle v-model="draft.mainBold" switch label="歌词粗体" />
        </div>
        <div class="layer-row">
          <strong class="layer-name">注音</strong>
          <UiField
            class="size-field"
            type="number"
            label="注音字号"
            :model-value="String(draft.rubySize)"
            :min="assStyleRanges.rubySize[0]"
            :max="assStyleRanges.rubySize[1]"
            step="1"
            @update:model-value="setNumber('rubySize', $event)"
          />
          <UiToggle v-model="draft.rubyBold" switch label="注音粗体" />
          <UiToggle
            :model-value="draft.rubyColor === null"
            switch
            label="跟随歌词色"
            @update:model-value="toggleRubyFollow"
          />
          <UiColorField
            v-if="draft.rubyColor !== null"
            class="color-field"
            :model-value="draft.rubyColor"
            label="注音颜色"
            @update:model-value="draft.rubyColor = $event"
          />
        </div>
        <div class="layer-row">
          <strong class="layer-name">罗马音</strong>
          <UiField
            class="size-field"
            type="number"
            label="罗马音字号"
            :model-value="String(draft.romanSize)"
            :min="assStyleRanges.romanSize[0]"
            :max="assStyleRanges.romanSize[1]"
            step="1"
            @update:model-value="setNumber('romanSize', $event)"
          />
          <UiToggle v-model="draft.romanBold" switch label="罗马音粗体" />
          <UiColorField
            class="color-field"
            v-model="draft.romanColor"
            label="罗马音颜色"
          />
        </div>
      </section>
      <section class="style-layer">
        <header><strong>外观与导出</strong></header>
        <div class="layer-row">
          <UiField
            class="size-field"
            type="number"
            label="描边粗细"
            :model-value="String(draft.outline)"
            :min="assStyleRanges.outline[0]"
            :max="assStyleRanges.outline[1]"
            step="1"
            @update:model-value="setNumber('outline', $event)"
          />
          <UiColorField
            class="color-field"
            v-model="draft.outlineColor"
            label="描边颜色"
          />
          <UiColorField
            class="color-field"
            v-model="draft.unsungColor"
            label="未唱颜色"
          />
        </div>
        <div class="layer-row">
          <UiToggle
            :model-value="draft.colorMode === 'solid'"
            switch
            label="统一文字颜色"
            @update:model-value="draft.colorMode = $event ? 'solid' : 'part'"
          />
          <UiColorField
            v-if="draft.colorMode === 'solid'"
            class="color-field"
            v-model="draft.solidColor"
            label="纯色"
          />
          <UiToggle v-model="draft.includeRoman" switch label="包含罗马音行" />
        </div>
      </section>
    </div>
    <footer>
      <UiButton variant="text" @click="reset">恢复默认</UiButton>
      <span class="footer-gap" />
      <UiButton variant="text" @click="emit('close')">取消</UiButton>
      <UiButton variant="filled" @click="save">应用</UiButton>
    </footer>
  </Modal>
</template>
<style scoped>
.ass-style-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.style-layer {
  grid-column: 1 / -1;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--soft);
}
.style-layer > header {
  margin-bottom: 10px;
}
.style-layer strong {
  color: var(--ink);
  font-size: 14px;
}
.layer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}
.layer-row + .layer-row {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid var(--line);
}
.layer-name {
  flex: 0 0 62px;
  color: var(--ink);
  font-size: 13px;
}
.size-field {
  width: 136px;
  flex: 0 0 136px;
}
.color-field {
  width: 180px;
  flex: 0 1 180px;
}
.footer-gap {
  flex: 1;
}
@media (max-width: 560px) {
  .ass-style-form {
    grid-template-columns: 1fr;
  }
}
</style>
