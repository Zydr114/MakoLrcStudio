<script setup lang="ts">
import { ref, watch } from "vue";
import {
  defaultAssStyle,
  normalizeAssStyle,
  type AssLayout,
  type AssStyle,
} from "../domain/assStyle";
import Modal from "./Modal.vue";
import UiButton from "./UiButton.vue";
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
function save() {
  emit("save", normalizeAssStyle(draft.value));
}
</script>
<template>
  <Modal :open="open" title="字幕样式" @close="emit('close')">
    <p class="small-note">
      所有声部共用一套 ASS 版式与外观。字号和描边以 1080p
      为基准，导出时按分辨率缩放。
    </p>
    <div class="ass-style-form">
      <UiSelect v-model="draft.layout" label="版式预设" :options="layouts" />
      <UiField v-model="draft.font" label="字体" />
      <section class="style-layer">
        <header>
          <strong>三层文字</strong>
          <small>字号、粗体、颜色分别设置</small>
        </header>
        <div class="layer-row">
          <strong class="layer-name">歌词主行</strong>
          <label class="native-field compact"
            >歌词字号
            <input
              v-model.number="draft.mainSize"
              type="number"
              min="40"
              max="120"
              step="1"
          /></label>
          <UiToggle v-model="draft.mainBold" switch label="歌词粗体" />
          <small class="layer-note">颜色由「统一文字颜色」控制</small>
        </div>
        <div class="layer-row">
          <strong class="layer-name">注音</strong>
          <label class="native-field compact"
            >注音字号
            <input
              v-model.number="draft.rubySize"
              type="number"
              min="12"
              max="72"
              step="1"
          /></label>
          <UiToggle v-model="draft.rubyBold" switch label="注音粗体" />
          <UiToggle
            :model-value="draft.rubyColor === null"
            switch
            label="跟随歌词色"
            @update:model-value="toggleRubyFollow"
          />
          <label v-if="draft.rubyColor !== null" class="native-field compact"
            >注音颜色 <input v-model="draft.rubyColor" type="color"
          /></label>
        </div>
        <div class="layer-row">
          <strong class="layer-name">罗马音</strong>
          <label class="native-field compact"
            >罗马音字号
            <input
              v-model.number="draft.romanSize"
              type="number"
              min="12"
              max="72"
              step="1"
          /></label>
          <UiToggle v-model="draft.romanBold" switch label="罗马音粗体" />
          <label class="native-field compact"
            >罗马音颜色 <input v-model="draft.romanColor" type="color"
          /></label>
        </div>
      </section>
      <section class="style-layer">
        <header>
          <strong>外观与导出</strong>
          <small>描边、未唱颜色、罗马音行</small>
        </header>
        <div class="layer-row">
          <label class="native-field compact"
            >描边粗细
            <input
              v-model.number="draft.outline"
              type="number"
              min="0"
              max="12"
              step="1"
          /></label>
          <label class="native-field compact"
            >描边颜色 <input v-model="draft.outlineColor" type="color"
          /></label>
          <label class="native-field compact"
            >未唱颜色 <input v-model="draft.unsungColor" type="color"
          /></label>
        </div>
        <div class="layer-row">
          <UiToggle
            :model-value="draft.colorMode === 'solid'"
            switch
            label="统一文字颜色"
            @update:model-value="draft.colorMode = $event ? 'solid' : 'part'"
          />
          <label v-if="draft.colorMode === 'solid'" class="native-field compact"
            >纯色 <input v-model="draft.solidColor" type="color"
          /></label>
          <UiToggle v-model="draft.includeRoman" switch label="包含罗马音行" />
        </div>
        <p class="small-note compact">
          关闭罗马音行只影响 ASS；工程数据仍在，但导出的文件再导回会缺少这一层。
        </p>
      </section>
    </div>
    <p class="small-note compact">
      和声跟随歌词粗体，翻译保持常规；未唱颜色作用于主行、注音和和声，若与已唱颜色相同，填色变化会不可见。
    </p>
    <footer>
      <UiButton variant="text" @click="reset">恢复默认</UiButton>
      <span class="footer-gap" />
      <UiButton @click="emit('close')">取消</UiButton>
      <UiButton variant="filled" @click="save">应用</UiButton>
    </footer>
  </Modal>
</template>
<style scoped>
.ass-style-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 4px;
}
.style-layer {
  grid-column: 1 / -1;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--soft);
}
.style-layer > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.style-layer strong {
  color: var(--ink);
  font-size: 14px;
}
.style-layer header small {
  color: var(--muted);
  font-size: 11px;
  text-align: right;
}
.layer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
}
.layer-row + .layer-row {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--line);
}
.layer-name {
  flex: 0 0 62px;
  color: var(--ink);
  font-size: 13px;
}
.layer-note {
  color: var(--muted);
  font-size: 11px;
}
.native-field.compact {
  flex: 0 1 112px;
  min-width: 92px;
  gap: 6px;
  font-size: 11px;
}
.native-field.compact input {
  padding: 8px;
}
.native-field.compact input[type="color"] {
  height: 34px;
  padding: 2px;
}
.small-note.compact {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
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
