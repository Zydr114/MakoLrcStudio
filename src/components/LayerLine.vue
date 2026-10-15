<script setup lang="ts">
import { nextTick } from "vue";
import { editor } from "../state/editor";
import { activeLines, type LyricLine } from "../domain/model";
import UiButton from "./UiButton.vue";
/** One line's translation or line romanization, under its original text. */
const props = defineProps<{
  line: LyricLine;
  index: number;
  field: "translation" | "roman";
}>();
const name = props.field === "translation" ? "翻译" : "罗马音";
function commit(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value.replace(
    /\s*[\r\n]+\s*/g,
    " ",
  );
  const id = props.line.id,
    field = props.field;
  editor.command(`修改${name}`, (draft) => {
    const line = activeLines(draft).find((item) => item.id === id)!;
    line[field] = value;
    // Typing over generated romanization is the confirmation.
    if (field === "roman") delete line.romanAuto;
  });
}
function confirm() {
  const id = props.line.id;
  editor.command("确认罗马音", (draft) => {
    delete activeLines(draft).find((item) => item.id === id)!.romanAuto;
  });
}
/** Enter moves on to the next line, which is how a translation is typed in. */
function key(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.key !== "Enter")
    return;
  event.preventDefault();
  const target = event.target as HTMLTextAreaElement;
  target.blur();
  void nextTick(() =>
    document
      .querySelector<HTMLTextAreaElement>(
        `[data-layer-index="${props.index + (event.shiftKey ? -1 : 1)}"]`,
      )
      ?.focus(),
  );
}
</script>
<template>
  <div class="layer-line">
    <span class="layer-original">{{ line.text }}</span>
    <div class="layer-input">
      <textarea
        :aria-label="`第 ${index + 1} 行${name}`"
        :data-layer-index="index"
        :value="line[field]"
        :class="{ pending: field === 'roman' && line.romanAuto }"
        rows="1"
        spellcheck="false"
        :placeholder="`${name}（可留空）`"
        @focus="editor.view({ activeLineId: line.id })"
        @change="commit"
        @keydown="key"
      /><UiButton
        v-if="field === 'roman' && line.romanAuto"
        variant="text"
        title="生成的罗马音，核对后确认"
        @click="confirm"
        >确认</UiButton
      >
    </div>
  </div>
</template>
<style scoped>
.layer-line {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.layer-original {
  color: var(--muted);
  font-size: 13px;
  white-space: pre-wrap;
}
.layer-input {
  display: flex;
  align-items: center;
  gap: 8px;
}
textarea {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--ink);
  border: 0;
  border-bottom: 1px dashed var(--line);
  resize: vertical;
  font-size: 15px;
  padding: 4px;
  line-height: 1.6;
}
textarea:focus {
  outline: none;
  border-bottom: 1px solid var(--accent);
}
textarea.pending {
  text-decoration: underline dotted var(--accent);
  text-underline-offset: 5px;
}
</style>
