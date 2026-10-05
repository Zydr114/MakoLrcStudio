<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { editor } from "../state/editor";
import { editLine, splitLine } from "../domain/edit";
import { newLine } from "../domain/model";
import { characterGaps, splitTokenAt, unitCuts } from "../domain/segmentation";
import { tokenize } from "../domain/tokenize";
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const input = ref<HTMLTextAreaElement>(),
  text = ref(""),
  caret = ref(0),
  issue = ref("");
const changed = computed(() => text.value !== editor.line?.text);
const wordMode = computed(() => editor.project.stage === 3);
const validGap = computed(() =>
  characterGaps(text.value).includes(caret.value),
);
const hadTiming = computed(
  () =>
    editor.line?.units.some((unit) => unit.startMs !== null) ||
    editor.line?.endMs !== null,
);
const existingCut = computed(
  () => !changed.value && unitCuts(editor.line).includes(caret.value),
);
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    editor.stopRecording();
    editor.cancelAudition();
    editor.clearPreview();
    editor.editingText = true;
    text.value = editor.line?.text ?? "";
    issue.value = "";
    caret.value = wordMode.value
      ? editor.line.units
          .slice(0, editor.selectedUnit)
          .reduce((offset, unit) => offset + unit.text.length, 0)
      : 0;
    await nextTick();
    input.value?.focus();
    input.value?.setSelectionRange(caret.value, caret.value);
  },
);
watch([() => editor.project.activeLineId, () => editor.project.stage], () => {
  if (props.open) close(false);
});
onBeforeUnmount(() => {
  if (props.open) editor.editingText = false;
});
function focus() {
  void nextTick(() =>
    document
      .querySelector<HTMLElement>("[data-workspace]")
      ?.focus({ preventScroll: true }),
  );
}
function close(restoreFocus = true) {
  editor.editingText = false;
  emit("close");
  if (restoreFocus) focus();
}
function capture() {
  caret.value = input.value?.selectionStart ?? 0;
  issue.value = "";
}
function apply(action: "text" | "line" | "token") {
  const id = editor.line?.id;
  if (!id) return;
  if (!text.value.trim()) {
    issue.value = "正文不能为空。";
    return;
  }
  if (action !== "text" && /[\r\n]/.test(text.value)) {
    issue.value = "先应用换行，再拆分当前行。";
    return;
  }
  const hadChanges = changed.value,
    oldTiming = hadTiming.value;
  if (
    !editor.command(
      action === "line"
        ? "在光标处拆句"
        : action === "token"
          ? "在光标处拆字／词"
          : "修改本行正文",
      (p) => {
        const lineIndex = p.lines.findIndex((line) => line.id === id);
        const parts = text.value.replace(/\r\n?/g, "\n").split("\n");
        editLine(p, id, parts[0]);
        p.lines.splice(
          lineIndex + 1,
          0,
          ...parts.slice(1).map((part) => newLine(part)),
        );
        const line = p.lines[lineIndex];
        if (action === "line") splitLine(p, id, caret.value);
        if (p.stage === 3 && !line.units.length)
          line.units = tokenize(line.text);
        if (action === "token") line.units = splitTokenAt(line, caret.value);
      },
    )
  ) {
    issue.value = editor.error;
    return;
  }
  editor.selectedUnit =
    action === "token"
      ? editor.cursor
      : Math.min(
          editor.selectedUnit,
          Math.max(0, editor.line.units.length - 1),
        );
  editor.selectionEnd = editor.selectedUnit;
  if (hadChanges && oldTiming)
    editor.message = "已保留句首；修改行的逐字时间需重打。";
  else if (action === "line")
    editor.message = "已拆句；缺失的句首和收尾需补打。";
  close();
}
function key(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    apply("line");
  }
}
</script>
<template>
  <div
    v-if="open"
    class="line-text-editor"
    aria-label="本行正文与拆分"
    @keydown="key"
  >
    <label class="sr-only" for="current-line-text">当前行歌词</label>
    <textarea
      id="current-line-text"
      ref="input"
      v-model="text"
      rows="2"
      spellcheck="false"
      @input="capture"
      @click="capture"
      @keyup="capture"
      @select="capture"
    />
    <div class="line-text-actions">
      <button
        class="text-link"
        :disabled="!validGap"
        title="Ctrl / Cmd + Enter"
        @click="apply('line')"
      >
        在光标处拆句
      </button>
      <button
        v-if="wordMode"
        class="text-link"
        :disabled="!validGap || existingCut"
        @click="apply('token')"
      >
        在光标处拆字／词
      </button>
      <span class="line-text-spacer" />
      <button class="text-link" @click="close()">取消文字编辑</button>
      <button class="text-apply" :disabled="!changed" @click="apply('text')">
        应用文字
      </button>
    </div>
    <p v-if="issue" class="field-issue" role="alert">{{ issue }}</p>
    <p v-else-if="changed && hadTiming" class="small-note">
      正文变化将清除本行逐字时间，保留句首。
    </p>
  </div>
</template>
<style scoped>
.line-text-editor {
  flex: 0 0 auto;
  padding: 10px 12px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 12px;
}
textarea {
  display: block;
  width: 100%;
  min-height: 60px;
  max-height: 120px;
  resize: vertical;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 22px;
  line-height: 1.5;
}
.line-text-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.line-text-spacer {
  flex: 1;
}
.text-apply {
  border: 0;
  border-radius: 16px;
  padding: 6px 12px;
  background: var(--accent);
  color: var(--on-accent);
}
.field-issue {
  color: var(--danger);
  font-size: 12px;
  margin-top: 6px;
}
</style>
