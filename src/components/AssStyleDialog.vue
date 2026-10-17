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
      <label class="native-field"
        >主行字号（1080p）
        <input
          v-model.number="draft.mainSize"
          type="number"
          min="40"
          max="120"
          step="1"
      /></label>
      <label class="native-field"
        >注音字号（1080p）
        <input
          v-model.number="draft.rubySize"
          type="number"
          min="12"
          max="72"
          step="1"
      /></label>
      <label class="native-field"
        >描边粗细（1080p）
        <input
          v-model.number="draft.outline"
          type="number"
          min="0"
          max="12"
          step="1"
      /></label>
      <label class="native-field"
        >描边颜色 <input v-model="draft.outlineColor" type="color"
      /></label>
      <div class="style-colors">
        <UiToggle
          :model-value="draft.colorMode === 'solid'"
          switch
          label="统一文字颜色"
          @update:model-value="draft.colorMode = $event ? 'solid' : 'part'"
        />
        <label v-if="draft.colorMode === 'solid'" class="native-field"
          >纯色 <input v-model="draft.solidColor" type="color"
        /></label>
      </div>
    </div>
    <p class="small-note">
      纯色只作用于歌词主行、注音和和声，未唱字仍为白色；若纯色也选白色，填色变化会不可见。翻译和罗马音保持现有颜色，和声、罗马音、翻译的字号按主行比例跟随。
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
  gap: 14px;
  margin-bottom: 4px;
}
.ass-style-form > :nth-child(1),
.ass-style-form > :nth-child(2) {
  grid-column: 1 / -1;
}
.style-colors {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.style-colors .native-field {
  flex: 1;
  min-width: 140px;
}
.footer-gap {
  flex: 1;
}
</style>
