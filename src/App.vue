<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { setTheme } from "mdui/functions/setTheme.js";
import { setColorScheme } from "mdui/functions/setColorScheme.js";
import { editor } from "./state/editor";
import ImportView from "./views/ImportView.vue";
import PrepareView from "./views/PrepareView.vue";
import TimingView from "./views/TimingView.vue";
import AudioBar from "./components/AudioBar.vue";
import UiButton from "./components/UiButton.vue";
import UiField from "./components/UiField.vue";
import Icon from "./components/Icon.vue";
import Modal from "./components/Modal.vue";
const audioInput = ref<HTMLInputElement>(),
  backupInput = ref<HTMLInputElement>();
const helpOpen = ref(false),
  settingsOpen = ref(false),
  newOpen = ref(false);
const theme = ref<"auto" | "light" | "dark">("auto"),
  seed = ref("#536b56");
const steps = ["导入", "整理", "逐行打轴", "逐字打轴"];
let frame = 0;
const held = new Set<string>();
async function loadAudio(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0];
  if (file) await editor.loadAudio(file);
  target.value = "";
}
async function loadBackup(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0];
  if (file) {
    if (file.size > 10 * 1024 * 1024)
      editor.error = "备份文件过大，请选择本工具导出的编辑进度文件。";
    else editor.restoreBackup(await file.text());
  }
  target.value = "";
}
function applyTheme() {
  setTheme(theme.value);
  setColorScheme(seed.value);
  document.dispatchEvent(new Event("mako-theme"));
  try {
    localStorage.setItem(
      "mako-theme",
      JSON.stringify({ theme: theme.value, seed: seed.value }),
    );
  } catch {}
}
function setTitle(value: string) {
  editor.command("修改标题", (draft) => {
    draft.name = value;
    draft.metadata.ti = value;
  });
}
function focusWorkspace() {
  void nextTick(() => {
    if (!document.querySelector("dialog[open]"))
      document
        .querySelector<HTMLElement>("[data-workspace]")
        ?.focus({ preventScroll: true });
  });
}
watch(
  () => editor.project.stage,
  () => {
    if (editor.project.stage >= 2) focusWorkspace();
  },
);
function editable(event: KeyboardEvent) {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        (node.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "MDUI-TEXT-FIELD"].includes(
            node.tagName,
          )),
    );
}
function keydown(event: KeyboardEvent) {
  if (
    editor.editingText ||
    event.isComposing ||
    event.keyCode === 229 ||
    editable(event) ||
    document.querySelector("dialog[open]")
  )
    return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? editor.redo() : editor.undo();
    return;
  }
  if (modifier && event.key.toLowerCase() === "y") {
    event.preventDefault();
    editor.redo();
    return;
  }
  if (
    editor.project.stage < 2 ||
    !document.activeElement?.closest("[data-workspace]")
  )
    return;
  if (
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          ["BUTTON", "MDUI-BUTTON"].includes(node.tagName) &&
          node.getAttribute("role") !== "slider",
      )
  )
    return;
  if (event.repeat || held.has(event.code)) return;
  if (event.key === "Enter") {
    event.preventDefault();
    held.add(event.code);
    modifier ? editor.nextLine() : void editor.enter(event.timeStamp);
  } else if (event.code === "Space") {
    event.preventDefault();
    held.add(event.code);
    void editor.togglePlayback();
  } else if (event.key === "Backspace") {
    event.preventDefault();
    held.add(event.code);
    editor.backspace();
  } else if (event.key.toLowerCase() === "r" && !modifier) {
    event.preventDefault();
    held.add(event.code);
    void editor.review();
  } else if (event.key === "Escape") {
    event.preventDefault();
    editor.stopRecording();
  } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    editor.seek(
      editor.positionMs + (event.key === "ArrowRight" ? 1000 : -1000),
    );
  }
}
function blur() {
  held.clear();
  if (editor.mode === "recording" || editor.mode === "starting") editor.pause();
}
function visibility() {
  if (document.hidden) {
    editor.pause();
    void editor.flushSave();
  }
}
function leaving() {
  editor.pause();
  void editor.flushSave();
}
function editingFocus(event: FocusEvent) {
  if (
    event
      .composedPath()
      .some(
        (node) =>
          node instanceof HTMLElement &&
          (["TEXTAREA", "SELECT", "MDUI-TEXT-FIELD"].includes(node.tagName) ||
            (node instanceof HTMLInputElement && node.type !== "range")),
      )
  )
    if (editor.recordingArmed) editor.pause();
}
const keyup = (event: KeyboardEvent) => held.delete(event.code);
onMounted(async () => {
  if (!window.isSecureContext)
    editor.error =
      "请通过 HTTPS 访问编辑器，或在 localhost 上运行。浏览器需要安全环境处理本地音频。";
  try {
    const saved = JSON.parse(localStorage.getItem("mako-theme") || "null");
    if (saved && ["auto", "light", "dark"].includes(saved.theme)) {
      theme.value = saved.theme;
      if (/^#[a-f\d]{6}$/i.test(saved.seed)) seed.value = saved.seed;
    }
  } catch {}
  applyTheme();
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  window.addEventListener("pagehide", leaving);
  document.addEventListener("visibilitychange", visibility);
  const tick = () => {
    editor.sync();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  await editor.initialize();
  if (editor.project.stage >= 2) focusWorkspace();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  editor.pause();
  void editor.flushSave();
  window.removeEventListener("keydown", keydown);
  window.removeEventListener("keyup", keyup);
  window.removeEventListener("blur", blur);
  window.removeEventListener("pagehide", leaving);
  document.removeEventListener("visibilitychange", visibility);
});
</script>
<template>
  <div
    class="app-shell"
    :class="{ 'is-timing': editor.project.stage >= 2 }"
    @focusin="editingFocus"
  >
    <header class="app-header">
      <a class="brand" href="./" @click.prevent="editor.goStage(0)"
        ><span class="brand-symbol"><i /><i /><i /><i /></span
        ><span>mako<small>LRC STUDIO</small></span></a
      >
      <div class="project-info">
        <span>{{
          editor.project.lines.length ? editor.project.name : "增强 LRC 编辑器"
        }}</span
        ><small class="save-status">{{ editor.saveState }}</small>
      </div>
      <div class="header-actions">
        <button
          class="icon-button"
          aria-label="撤销"
          title="撤销 Ctrl / Cmd + Z"
          :disabled="!editor.canUndo || editor.editingText"
          @click="editor.undo"
        >
          <Icon name="undo" /></button
        ><button
          class="icon-button"
          aria-label="重做"
          :disabled="!editor.canRedo || editor.editingText"
          @click="editor.redo"
        >
          <Icon name="redo" /></button
        ><span class="header-divider" /><button
          class="icon-button"
          aria-label="快捷键帮助"
          @click="
            editor.pause();
            helpOpen = true;
          "
        >
          <Icon name="help" /></button
        ><button
          class="icon-button"
          aria-label="设置"
          @click="
            editor.pause();
            settingsOpen = true;
          "
        >
          <Icon name="settings" /></button
        ><UiButton
          class="backup-header"
          variant="text"
          @click="editor.backup"
          :disabled="!editor.project.lines.length"
          >备份</UiButton
        ><UiButton
          variant="filled"
          icon="download"
          :disabled="editor.project.stage < 3 || editor.editingText"
          @click="editor.exportLrc"
          >导出 LRC</UiButton
        >
      </div>
    </header>
    <nav class="stepper" aria-label="编辑步骤">
      <button
        v-for="(step, index) in steps"
        :key="step"
        :aria-label="step"
        :class="{
          active: editor.project.stage === index,
          passed: editor.project.stage > index,
        }"
        :disabled="editor.project.unlockedStage < index"
        :aria-current="editor.project.stage === index ? 'step' : undefined"
        @click="editor.goStage(index)"
      >
        <span class="step-number"
          ><Icon
            v-if="editor.project.stage > index"
            name="check"
            :size="16"
          /><template v-else>{{
            String(index + 1).padStart(2, "0")
          }}</template></span
        ><span>{{ step }}</span
        ><span class="step-line" />
      </button>
    </nav>
    <div v-if="editor.error" class="notice error-notice" role="alert">
      <span>{{ editor.error }}</span
      ><button
        class="icon-button"
        aria-label="关闭错误提示"
        @click="editor.error = ''"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>
    <div v-else-if="editor.message" class="notice" role="status">
      <span>{{ editor.message }}</span
      ><button
        class="icon-button"
        aria-label="关闭提示"
        @click="editor.message = ''"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>
    <main class="app-main">
      <div v-if="editor.restoring" class="loading-screen">
        正在恢复本机草稿…
      </div>
      <ImportView
        v-else-if="editor.project.stage === 0"
        @audio="audioInput?.click()"
        @backup="backupInput?.click()"
      /><PrepareView
        v-else-if="editor.project.stage === 1"
        @audio="audioInput?.click()"
      /><TimingView v-else @audio="audioInput?.click()" />
    </main>
    <AudioBar @audio="audioInput?.click()" />
    <input
      ref="audioInput"
      hidden
      type="file"
      accept="audio/*,.flac,.ogg,.opus,.m4a,.wav,.mp3"
      @change="loadAudio"
    /><input
      ref="backupInput"
      hidden
      type="file"
      accept=".json,application/json"
      @change="loadBackup"
    />
    <Modal :open="helpOpen" title="快捷键" @close="helpOpen = false"
      ><p>点击打轴工作区后使用快捷键。输入框和输入法确认遵循正常编辑行为。</p>
      <dl class="help-list">
        <dt><kbd>Enter</kbd></dt>
        <dd>首次 / 暂停后：开始播放。录制中：记起点。最后一次：记收尾。</dd>
        <dt><kbd>Space</kbd></dt>
        <dd>播放 / 暂停</dd>
        <dt><kbd>Backspace</kbd></dt>
        <dd>退回刚才记录，提前一秒并暂停</dd>
        <dt><kbd>R</kbd></dt>
        <dd>试听当前句</dd>
        <dt><kbd>Ctrl / Cmd + Enter</kbd></dt>
        <dd>本句完成后，进入下一句</dd>
        <dt><kbd>← →</kbd></dt>
        <dd>工作区定位 1 秒；聚焦时标微调 10ms，Shift 微调 1ms</dd>
        <dt><kbd>Ctrl / Cmd + Z</kbd></dt>
        <dd>撤销；加 Shift 重做</dd>
        <dt><kbd>← → / Delete</kbd></dt>
        <dd>调整切分时，移动／移除聚焦的文字分隔线</dd>
        <dt><kbd>Esc</kbd></dt>
        <dd>暂停录点；拖动、精确输入或切分过程中取消草稿</dd>
      </dl>
    </Modal>
    <Modal :open="settingsOpen" title="设置" @close="settingsOpen = false"
      ><div class="settings-grid">
        <label class="native-field"
          >主题<select aria-label="主题" v-model="theme" @change="applyTheme">
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select></label
        ><label class="native-field"
          >主题色<input
            v-model="seed"
            type="color"
            @input="applyTheme" /></label
        ><label class="native-field"
          >录点提前补偿（ms）<input
            v-model.number="editor.compensation"
            type="number"
            min="-1000"
            max="1000"
            step="10"
        /></label>
        <p class="small-note">
          默认 0。正值让新记录时间提前；已有时标使用整体平移。
        </p>
        <UiField
          :model-value="editor.project.name"
          label="歌词标题"
          @update:model-value="setTitle"
        /><UiButton
          @click="
            settingsOpen = false;
            backupInput?.click();
          "
          >恢复编辑进度</UiButton
        ><UiButton
          @click="editor.backup"
          :disabled="!editor.project.lines.length"
          >下载编辑进度备份</UiButton
        ><UiButton
          variant="text"
          @click="
            settingsOpen = false;
            newOpen = true;
          "
          >新建空白项目</UiButton
        >
      </div>
      <p class="small-note">
        刷新后需要重新选择原音频。慢速播放会降低音高。
      </p></Modal
    >
    <Modal :open="newOpen" title="新建项目" @close="newOpen = false"
      ><p>新项目会替换本机当前草稿。需要保留当前进度时，请先下载备份。</p>
      <footer>
        <UiButton
          @click="editor.backup"
          :disabled="!editor.project.lines.length"
          >下载当前备份</UiButton
        ><UiButton
          variant="filled"
          @click="
            editor.resetProject();
            newOpen = false;
          "
          >新建空白项目</UiButton
        >
      </footer></Modal
    >
  </div>
</template>
