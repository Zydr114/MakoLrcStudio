<script setup lang="ts">
import { ref } from "vue";
import { editor } from "../state/editor";
import UiButton from "../components/UiButton.vue";
import Icon from "../components/Icon.vue";
import UiSelect from "../components/UiSelect.vue";
import brandWordmark from "../assets/brand/wordmark.webp";
const emit = defineEmits<{ audio: []; backup: [] }>();
const text = ref(""),
  invalidEncoding = ref(false),
  encoding = ref("utf-8"),
  lyricFile = ref<File | null>(null),
  dragging = ref(false);
const input = ref<HTMLInputElement>();
async function decode() {
  if (!lyricFile.value) return;
  try {
    text.value = new TextDecoder(encoding.value, { fatal: true }).decode(
      await lyricFile.value.arrayBuffer(),
    );
    invalidEncoding.value = false;
    editor.error = "";
  } catch {
    invalidEncoding.value = true;
    editor.error =
      "文本编码无法识别，请切换 UTF-8、GB18030 或 Shift-JIS 后检查预览。";
  }
}
async function load(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    lyricFile.value = file;
    await decode();
  }
  (event.target as HTMLInputElement).value = "";
}
async function drop(event: DragEvent) {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  for (const file of files) {
    if (/\.(lrc|elrc|txt)$/i.test(file.name)) {
      lyricFile.value = file;
      await decode();
    } else await editor.loadAudio(file);
  }
}
function next() {
  if (
    text.value.trim() &&
    !editor.importText(text.value, lyricFile.value?.name)
  )
    return;
  if (!editor.project.lines.length) {
    editor.error = "请导入或粘贴歌词。";
    return;
  }
  editor.goStage(1);
}
</script>
<template>
  <section
    class="import-view"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="drop"
    :class="{ dragging }"
  >
    <div class="page-heading">
      <img
        class="page-wordmark"
        :src="brandWordmark"
        alt=""
        width="456"
        height="216"
      />
      <h1>导入歌词</h1>
    </div>
    <div class="import-grid">
      <div class="lyrics-import surface">
        <div class="section-title">
          <h2>歌词文本</h2>
          <UiButton variant="text" icon="upload" @click="input?.click()"
            >导入文件</UiButton
          >
        </div>
        <input
          ref="input"
          hidden
          type="file"
          accept=".lrc,.elrc,.txt,text/plain"
          @change="load"
        />
        <label class="sr-only" for="lyric-paste">粘贴歌词</label
        ><textarea
          id="lyric-paste"
          v-model="text"
          @input="
            invalidEncoding = false;
            editor.error = '';
          "
          spellcheck="false"
          placeholder="粘贴歌词，每句一行"
        />
        <div class="import-meta">
          <span>{{
            lyricFile?.name ||
            (editor.project.lines.length
              ? `已导入 ${editor.project.lines.length} 行`
              : "TXT / LRC / 增强 LRC")
          }}</span
          ><UiSelect
            compact
            label="编码"
            v-model="encoding"
            :options="[
              { value: 'utf-8', label: 'UTF-8' },
              { value: 'gb18030', label: 'GB18030' },
              { value: 'shift_jis', label: 'Shift-JIS' },
            ]"
            @change="decode"
          />
        </div>
      </div>
      <button
        class="audio-drop"
        @click="emit('audio')"
        :disabled="editor.loading"
      >
        <span class="drop-icon"
          ><Icon :name="editor.asset ? 'check' : 'music'" :size="24"
        /></span>
        <h2>{{ editor.asset ? "音频已准备" : "选择音频（可稍后）" }}</h2>
        <p>{{ editor.project.audio?.name || "点击选择或拖入音频" }}</p>
        <span v-if="editor.loading" class="audio-loading"
          ><mdui-linear-progress aria-label="正在解码音频"
        /></span>
      </button>
    </div>
    <div class="import-footer">
      <UiButton variant="text" @click="emit('backup')">恢复编辑进度</UiButton
      ><UiButton
        variant="filled"
        icon="arrow"
        :disabled="editor.loading || invalidEncoding"
        @click="next"
        >下一步，整理歌词</UiButton
      >
    </div>
  </section>
</template>
