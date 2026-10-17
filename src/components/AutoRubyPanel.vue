<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { editor } from "../state/editor";
import {
  rubyLoading,
  rubySkips,
  runAutoRuby,
  type RubyLanguage,
  type RubySkipNote,
} from "../state/autoRuby";
import { guessLanguage } from "../domain/autoRuby";
import UiButton from "./UiButton.vue";
import UiSelect from "./UiSelect.vue";
const props = defineProps<{ selected: string[] }>();
const language = ref<RubyLanguage>(guessLanguage(editor.lines));
// Kanji are shared by both languages: guess per part from kana, then let the user decide.
watch(
  () => editor.project.activePartId,
  () => (language.value = guessLanguage(editor.lines)),
);
const scope = ref<"part" | "selected">("part");
watch(
  () => props.selected.length,
  (count) => (scope.value = count ? "selected" : "part"),
);
const languages = [
  { value: "ja" as const, label: "日语（假名，按音拍）" },
  { value: "zh" as const, label: "中文（带调拼音）" },
];
const reasonText: Record<RubySkipNote["reason"], string> = {
  timed: "所在单位已有打点，合并会丢失时间",
  mismatch: "与现有切分不符",
};
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
function run() {
  const ids =
    scope.value === "selected" && props.selected.length
      ? props.selected
      : editor.lines.map((line) => line.id);
  void runAutoRuby(language.value, ids);
}
</script>
<template>
  <aside class="surface cleanup-panel auto-ruby-panel">
    <h2>自动注音</h2>
    <UiSelect v-model="language" label="语言" :options="languages" />
    <UiSelect v-model="scope" label="范围" :options="scopes" />
    <UiButton
      variant="filled"
      :loading="!!rubyLoading"
      :disabled="!!rubyLoading || !editor.lines.length"
      @click="run"
      >{{
        rubyLoading === "ja"
          ? "正在加载日语词典…"
          : rubyLoading
            ? "正在加载拼音数据…"
            : "自动注音"
      }}</UiButton
    >
    <p class="ruby-warning" role="note">
      自动注音依据词典推断，多音字、熟字训和歌词里的特殊读法常会出错，请逐行核对。结果带虚线下划线，确认后才算定稿；已确认或手动填写的读音不会被覆盖。
    </p>
    <p class="small-note">
      <template v-if="language === 'ja'"
        >日语按音拍拆成音节，每拍各打一次轴。首次使用会从本站下载约 17 MB
        的词典。</template
      ><template v-else>中文每个字的拼音只作显示，不增加打轴次数。</template>
    </p>
    <div v-if="rubySkips.length" class="skip-report">
      <p class="small-note">上次自动注音有 {{ rubySkips.length }} 处未注音：</p>
      <ul class="skip-list">
        <li v-for="(entry, index) in rubySkips" :key="`${entry.line}-${index}`">
          第 {{ entry.line }} 行「{{ entry.text }}」·
          {{ reasonText[entry.reason] }}
        </li>
      </ul>
    </div>
    <div class="divider" />
    <p class="small-note">
      手动注音：点击字选中，Shift +
      点击可选多个字合为一组（如「今日」读「きょう」），再点「添加读音」。
    </p>
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
.skip-list {
  margin: 0;
  padding-left: 18px;
  max-height: 140px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
}
</style>
