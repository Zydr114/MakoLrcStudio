<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { editor } from "../state/editor";
import { activeLines } from "../domain/model";
import { generateRoman, romanLoading } from "../state/romanize";
import UiButton from "./UiButton.vue";
import UiField from "./UiField.vue";
import UiSelect from "./UiSelect.vue";
import Modal from "./Modal.vue";
const props = defineProps<{
  field: "translation" | "roman";
  selected: string[];
}>();
const name = computed(() =>
  props.field === "translation" ? "翻译" : "罗马音",
);
const key = computed(() =>
  props.field === "translation" ? "translationLang" : "romanLang",
);
const language = ref("");
watch(
  () => editor.project[key.value],
  (value) => (language.value = value),
  { immediate: true },
);
function saveLanguage() {
  const value = language.value.trim(),
    field = key.value;
  if (value && !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(value)) {
    editor.error = "语言代码需为 BCP 47 格式，例如 zh-CN、en、ja-Latn。";
    language.value = editor.project[field];
    return;
  }
  editor.command(`修改${name.value}语言`, (draft) => {
    draft[field] = value;
  });
}
const scope = ref<"part" | "selected">("part");
watch(
  () => props.selected.length,
  (count) => (scope.value = count ? "selected" : "part"),
);
const scopes = computed(() => [
  {
    value: "part" as const,
    label: `当前声部全部（${editor.lines.length} 行）`,
  },
  {
    value: "selected" as const,
    label: `选中的 ${props.selected.length} 行`,
    disabled: !props.selected.length,
  },
]);
function generate() {
  void generateRoman(
    scope.value === "selected" && props.selected.length
      ? props.selected
      : editor.lines.map((line) => line.id),
  );
}
const pasteOpen = ref(false),
  pasted = ref("");
function paste() {
  const rows = pasted.value
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
  const field = props.field;
  const count = Math.min(rows.length, editor.lines.length);
  if (
    editor.command(`按行粘贴${name.value}`, (draft) => {
      activeLines(draft)
        .slice(0, count)
        .forEach((line, index) => {
          line[field] = rows[index].trim();
          if (field === "roman") delete line.romanAuto;
        });
    })
  ) {
    pasteOpen.value = false;
    editor.message = `已填入 ${count} 行${name.value}${rows.length > editor.lines.length ? `，多出的 ${rows.length - editor.lines.length} 行未使用` : ""}。`;
  }
}
</script>
<template>
  <aside class="surface cleanup-panel layer-panel">
    <h2>{{ name }}</h2>
    <UiField
      v-model="language"
      :label="`${name}语言代码`"
      :placeholder="field === 'translation' ? 'zh-CN' : 'ja-Latn'"
      @change="saveLanguage"
    />
    <p class="small-note">
      BCP 47 格式，写入 TTML 的 xml:lang。每个工程一种{{ name }}；LRC 不导出{{
        name
      }}。
    </p>
    <UiButton variant="tonal" @click="pasteOpen = true"
      >按行粘贴{{ name }}…</UiButton
    >
    <template v-if="field === 'roman'">
      <div class="divider" />
      <UiSelect v-model="scope" label="生成范围" :options="scopes" />
      <UiButton
        variant="filled"
        :loading="romanLoading"
        :disabled="romanLoading || !editor.lines.length"
        @click="generate"
        >从注音生成</UiButton
      >
      <p class="ruby-warning" role="note">
        按注音生成：日语转写为罗马字（长音写作 ou、aa
        等），中文直接使用拼音。助词、外来语和连读常需手改，结果标为待确认。日语用词典分词，首次使用需下载词典。
      </p>
      <p class="small-note">逐字罗马音在逐字打轴页签里，选中单位后修正。</p>
    </template>
    <Modal
      :open="pasteOpen"
      :title="`按行粘贴${name}`"
      @close="pasteOpen = false"
    >
      <UiField
        v-model="pasted"
        :label="`粘贴${name}`"
        :aria-label="`粘贴${name}`"
        multiline
        :rows="10"
        placeholder="每行对应一句歌词"
      />
      <footer>
        <UiButton variant="text" @click="pasteOpen = false">取消</UiButton
        ><UiButton variant="filled" :disabled="!pasted.trim()" @click="paste"
          >填入</UiButton
        >
      </footer>
    </Modal>
  </aside>
</template>
<style scoped>
.ruby-warning {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(var(--mdui-color-tertiary-container), 0.7);
  color: rgb(var(--mdui-color-on-tertiary-container));
  font-size: 12px;
  line-height: 1.7;
}
</style>
