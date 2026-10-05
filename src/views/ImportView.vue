<script setup lang="ts">
import { ref } from "vue";
import { editor } from "../state/editor";
import UiButton from "../components/UiButton.vue";
import Icon from "../components/Icon.vue";
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
  if (!editor.asset) {
    editor.error = "请选择音频再继续。";
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
      <span class="eyebrow">FROM TEXT TO TIMING</span>
      <h1>让歌词，跟上音乐。</h1>
      <p>先把文字整理好，再一行一行听，一字一字记录。</p>
    </div>
    <div class="import-grid">
      <button
        class="audio-drop"
        @click="emit('audio')"
        :disabled="editor.loading"
      >
        <span class="drop-icon"
          ><Icon :name="editor.asset ? 'check' : 'music'" :size="34"
        /></span>
        <h2>{{ editor.asset ? "音频已准备" : "导入一首歌" }}</h2>
        <p>{{ editor.project.audio?.name || "点击选择，或把音频拖到这里" }}</p>
        <span class="file-types">{{
          editor.loading ? "正在解码音频…" : "MP3 · WAV · 浏览器支持的音频"
        }}</span
        ><span class="small-note">音频始终留在你的设备上</span>
      </button>
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
          placeholder="把歌词粘贴在这里，每句一行。&#10;&#10;已有 LRC？直接导入，时间戳会保留。"
        />
        <div class="import-meta">
          <span>{{
            lyricFile?.name ||
            (editor.project.lines.length
              ? `已导入 ${editor.project.lines.length} 行`
              : "TXT / LRC / 增强 LRC")
          }}</span
          ><label
            >编码
            <select v-model="encoding" @change="decode">
              <option value="utf-8">UTF-8</option>
              <option value="gb18030">GB18030</option>
              <option value="shift_jis">Shift-JIS</option>
            </select></label
          >
        </div>
      </div>
    </div>
    <div class="import-footer">
      <button class="text-link" @click="emit('backup')">恢复编辑进度</button
      ><UiButton
        variant="filled"
        icon="arrow"
        :disabled="editor.loading || invalidEncoding"
        @click="next"
        >下一步，整理歌词</UiButton
      >
    </div>
    <div class="workflow-note">
      <span>01　整理文字</span><i>→</i><span>02　给每句定起点</span><i>→</i
      ><span>03　逐字记录与微调</span>
    </div>
  </section>
</template>
