<script setup lang="ts">
import { computed, ref, watch } from "vue";
import UiButton from "./UiButton.vue";
import UiField from "./UiField.vue";
import DividerStrip from "./DividerStrip.vue";
import { moraCuts, splitAt } from "../domain/ruby";
import { hasRomaji, romajiToKana } from "../domain/romaji";
/** Reading of one unit: kana or pinyin, divided into the syllables that get timed. */
const props = defineProps<{
  base: string;
  reading: string;
  cuts: number[];
  removable: boolean;
  /** A failure reported by whoever applies the reading. */
  error?: string;
}>();
const emit = defineEmits<{
  apply: [pieces: string[]];
  remove: [];
  cancel: [];
}>();
const reading = ref(props.reading),
  split = ref([...props.cuts]),
  issue = ref(""),
  converting = ref(false);
const canConvert = computed(() => hasRomaji(reading.value));
watch(
  () => [props.reading, props.cuts] as const,
  ([value, cuts]) => {
    reading.value = value;
    split.value = [...cuts];
    issue.value = "";
  },
);
watch(
  () => props.error,
  (value) => (issue.value = value ?? ""),
);
function type(value: string) {
  reading.value = value;
  split.value = moraCuts(value);
  issue.value = "";
}
async function convert() {
  if (!canConvert.value || converting.value) return;
  converting.value = true;
  issue.value = "";
  try {
    const converted = await romajiToKana(reading.value);
    if (converted === reading.value) {
      issue.value = "没有可转换的罗马音，请检查拼写。";
      return;
    }
    type(converted);
    if (hasRomaji(converted))
      issue.value = "已转换，但仍有无法识别的罗马音，请检查读音。";
  } catch (error) {
    issue.value = `罗马音转换失败：${(error as Error).message}`;
  } finally {
    converting.value = false;
  }
}
const check = (next: number[]) => void splitAt(reading.value, next);
function apply() {
  if (!reading.value.trim()) {
    issue.value = "读音不能为空；不需要注音时请点「移除注音」。";
    return;
  }
  try {
    emit("apply", splitAt(reading.value, split.value));
  } catch (error) {
    issue.value = (error as Error).message;
  }
}
function key(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    emit("cancel");
  }
}
</script>
<template>
  <div
    class="segmentation-editor ruby-editor"
    data-editing-text
    aria-label="读音编辑"
    @keydown="key"
  >
    <div class="segmentation-heading">
      <strong>注音「{{ base }}」</strong>
      <div>
        <UiButton v-if="removable" variant="text" @click="emit('remove')"
          >移除注音</UiButton
        ><UiButton variant="text" @click="emit('cancel')">取消</UiButton
        ><UiButton variant="filled" @click="apply">应用读音</UiButton>
      </div>
    </div>
    <div class="ruby-fields">
      <UiField
        :model-value="reading"
        label="读音"
        placeholder="假名、拼音或罗马音"
        @update:model-value="type"
      />
      <UiButton
        v-if="canConvert"
        variant="tonal"
        :loading="converting"
        title="把输入的罗马音转成平假名"
        @click="convert"
        >罗马音 → 假名</UiButton
      >
      <DividerStrip
        v-if="reading.trim()"
        v-model:cuts="split"
        :text="reading"
        :check="check"
        :large="false"
        @apply="apply"
        @cancel="emit('cancel')"
        @error="issue = $event"
      />
    </div>
    <p v-if="issue" class="field-error" role="alert">{{ issue }}</p>
  </div>
</template>
<style scoped>
.segmentation-editor {
  flex: 0 0 auto;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--soft);
}
.segmentation-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 32px;
  font-size: 12px;
}
.segmentation-heading strong {
  font-weight: 600;
  white-space: nowrap;
}
.segmentation-heading > div {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.segmentation-heading .small-note {
  font-size: 11px;
}
.ruby-fields {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 0 2px;
}
.ruby-fields mdui-text-field {
  flex: 0 0 220px;
}
.field-error {
  color: var(--danger);
  font-size: 12px;
  margin-top: 4px;
}
</style>
