<script setup lang="ts">
import { computed, ref } from "vue";
import { editor } from "../state/editor";
import { copyProject, formatTime, newLine } from "../domain/model";
import {
  editLine,
  splitLine,
  mergeLines,
  cleanProject,
  type CleanOptions,
} from "../domain/edit";
import UiButton from "../components/UiButton.vue";
import UiField from "../components/UiField.vue";
import Icon from "../components/Icon.vue";
import Modal from "../components/Modal.vue";
const emit = defineEmits<{ audio: [] }>();
const selected = ref<string[]>([]),
  previewOpen = ref(false);
const options = ref<CleanOptions>({
  trim: true,
  blanks: true,
  brackets: false,
  find: "",
  replacement: "",
});
const preview = computed(() => {
  const p = copyProject(editor.project);
  cleanProject(p, options.value);
  return p;
});
const changed = computed(() =>
  editor.project.lines.filter(
    (l) => preview.value.lines.find((n) => n.id === l.id)?.text !== l.text,
  ),
);
const carets = new Map<string, number>();
function textEdit(id: string, event: Event) {
  const target = event.target as HTMLTextAreaElement;
  editor.command("修改歌词", (p) => {
    const parts = target.value.replace(/\r\n?/g, "\n").split("\n");
    const index = p.lines.findIndex((line) => line.id === id);
    editLine(p, id, parts[0]);
    p.lines.splice(
      index + 1,
      0,
      ...parts.slice(1).map((text) => newLine(text)),
    );
    p.unlockedStage = 1;
  });
}
function split(id: string) {
  editor.command("拆分句子", (p) => {
    splitLine(p, id, carets.get(id) ?? 0);
    p.unlockedStage = 1;
  });
}
function merge(id: string) {
  editor.command("合并句子", (p) => {
    mergeLines(p, id);
    p.unlockedStage = 1;
  });
}
function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((i) => i !== id)
    : [...selected.value, id];
}
function remove() {
  editor.command("删除选中行", (p) => {
    p.lines = p.lines.filter((l) => !selected.value.includes(l.id));
    p.activeLineId = p.lines[0]?.id ?? null;
    p.unlockedStage = 1;
  });
  selected.value = [];
}
function apply() {
  editor.command("批量整理歌词", (p) => {
    cleanProject(p, options.value);
    p.activeLineId = p.lines[0]?.id ?? null;
    p.unlockedStage = 1;
  });
  previewOpen.value = false;
}
</script>
<template>
  <section class="prepare-view">
    <div class="page-heading compact">
      <h1>整理歌词</h1>
    </div>
    <div class="prepare-grid">
      <div class="surface lyric-sheet">
        <div class="sheet-toolbar">
          <label class="check-label"
            ><input
              type="checkbox"
              :checked="
                selected.length === editor.project.lines.length &&
                !!selected.length
              "
              @change="
                selected = selected.length
                  ? []
                  : editor.project.lines.map((l) => l.id)
              "
            />{{ editor.project.lines.length }} 行歌词</label
          ><UiButton
            variant="text"
            icon="trash"
            :disabled="!selected.length"
            @click="remove"
            >删除 {{ selected.length || "" }}</UiButton
          >
        </div>
        <div v-if="!editor.project.lines.length" class="empty-note">
          没有歌词行。添加一行，或返回导入歌词。
        </div>
        <div
          v-for="(line, index) in editor.project.lines"
          :key="line.id"
          class="text-row"
          :class="{ selected: selected.includes(line.id) }"
        >
          <input
            type="checkbox"
            :aria-label="`选择第 ${index + 1} 行`"
            :checked="selected.includes(line.id)"
            @change="toggle(line.id)"
          /><span class="row-number">{{
            String(index + 1).padStart(2, "0")
          }}</span
          ><textarea
            :aria-label="`第 ${index + 1} 行歌词`"
            :value="line.text"
            rows="1"
            spellcheck="false"
            @change="textEdit(line.id, $event)"
            @click="
              carets.set(
                line.id,
                ($event.target as HTMLTextAreaElement).selectionStart,
              )
            "
            @keyup="
              carets.set(
                line.id,
                ($event.target as HTMLTextAreaElement).selectionStart,
              )
            "
            @blur="
              carets.set(
                line.id,
                ($event.target as HTMLTextAreaElement).selectionStart,
              )
            "
          /><span class="time-badge">{{ formatTime(line.startMs) }}</span
          ><button
            class="icon-button"
            aria-label="在光标处拆句"
            title="在光标处拆句"
            @click="split(line.id)"
          >
            <Icon name="split" /></button
          ><button
            class="icon-button"
            aria-label="合并下一句"
            title="合并下一句"
            :disabled="index === editor.project.lines.length - 1"
            @click="merge(line.id)"
          >
            <Icon name="merge" />
          </button>
        </div>
        <button
          class="add-line"
          @click="
            editor.command('添加歌词行', (p) => {
              p.lines.push(newLine(''));
              p.unlockedStage = 1;
            })
          "
        >
          ＋ 添加一行
        </button>
      </div>
      <aside class="surface cleanup-panel">
        <h2>文本清理</h2>
        <label class="check-label"
          ><input
            v-model="options.trim"
            type="checkbox"
          />去掉行首、行尾空白</label
        ><label class="check-label"
          ><input v-model="options.blanks" type="checkbox" />删除空行</label
        ><label class="check-label"
          ><input
            v-model="options.brackets"
            type="checkbox"
          />删除括号里的内容</label
        >

        <div class="divider" />
        <UiField v-model="options.find" label="查找文字" /><UiField
          v-model="options.replacement"
          label="替换成"
        /><UiButton variant="tonal" @click="previewOpen = true"
          >预览整理结果</UiButton
        >
      </aside>
    </div>
    <div class="step-footer">
      <UiButton v-if="!editor.asset" variant="tonal" @click="emit('audio')"
        >选择音频</UiButton
      ><UiButton variant="filled" icon="arrow" @click="editor.confirmText"
        >确认文本，开始逐行打轴</UiButton
      >
    </div>
    <Modal :open="previewOpen" title="检查整理结果" @close="previewOpen = false"
      ><p class="small-note">
        将修改 {{ changed.length }} 行，保留
        {{ preview.lines.length }} 行。未勾选的内容会保留。
      </p>
      <div class="clean-preview">
        <div v-for="line in changed" :key="line.id">
          <del>{{ line.text || "（空行）" }}</del
          ><span>→</span
          ><strong>{{
            preview.lines.find((n) => n.id === line.id)?.text ?? "删除此行"
          }}</strong>
        </div>
        <p v-if="!changed.length">没有需要修改的内容。</p>
      </div>
      <footer>
        <UiButton @click="previewOpen = false">取消</UiButton
        ><UiButton variant="filled" :disabled="!changed.length" @click="apply"
          >应用整理</UiButton
        >
      </footer></Modal
    >
  </section>
</template>
