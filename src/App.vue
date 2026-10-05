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
import UiSelect from "./components/UiSelect.vue";
import UiIconButton from "./components/UiIconButton.vue";
import { themes } from "./components/controlOptions";
import type { Tabs } from "mdui/components/tabs.js";
import Modal from "./components/Modal.vue";
const audioInput = ref<HTMLInputElement>(),
  backupInput = ref<HTMLInputElement>();
const helpOpen = ref(false),
  settingsOpen = ref(false),
  newOpen = ref(false);
const theme = ref<"auto" | "light" | "dark">("auto"),
  seed = ref("#536b56");
const tabs = ["文本处理", "逐行打轴", "逐字打轴"];
function tabKey(event: KeyboardEvent, index: number) {
  if (event.key === "Enter" || event.code === "Space") {
    event.preventDefault();
    editor.goStage(index + 1);
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 2
        : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
  document.getElementById(`editor-tab-${next + 1}`)?.focus();
  editor.goStage(next + 1);
}
function changeTab(event: Event) {
  const stage = Number((event.currentTarget as Tabs).value);
  if (stage !== editor.project.stage) editor.goStage(stage);
}
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
    if (
      editor.project.stage >= 2 &&
      !document.activeElement?.closest('[role="tablist"]')
    )
      focusWorkspace();
  },
);
function editable(event: KeyboardEvent) {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof HTMLElement &&
        (node.isContentEditable ||
          [
            "INPUT",
            "TEXTAREA",
            "SELECT",
            "MDUI-TEXT-FIELD",
            "MDUI-SELECT",
            "MDUI-SLIDER",
            "MDUI-CHECKBOX",
            "MDUI-SWITCH",
            "MDUI-MENU-ITEM",
          ].includes(node.tagName)),
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
          ["BUTTON", "MDUI-BUTTON", "MDUI-BUTTON-ICON"].includes(
            node.tagName,
          ) &&
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
        <UiButton
          v-if="editor.project.lines.length"
          variant="text"
          @click="editor.goStage(0)"
          >导入</UiButton
        >
        <UiIconButton
          icon="undo"
          label="撤销"
          title="撤销 Ctrl / Cmd + Z"
          :disabled="!editor.canUndo || editor.editingText"
          @click="editor.undo"
        />
        <UiIconButton
          icon="redo"
          label="重做"
          :disabled="!editor.canRedo || editor.editingText"
          @click="editor.redo"
        />
        <span class="header-divider" />
        <UiIconButton
          icon="help"
          label="快捷键帮助"
          @click="
            editor.pause();
            helpOpen = true;
          "
        />
        <UiIconButton
          icon="settings"
          label="设置"
          @click="
            editor.pause();
            settingsOpen = true;
          "
        />
        <UiButton
          class="backup-header"
          variant="text"
          @click="editor.backup"
          :disabled="!editor.project.lines.length"
          >备份</UiButton
        ><UiButton
          variant="filled"
          icon="download"
          :disabled="!editor.project.lines.length || editor.editingText"
          @click="editor.exportLrc"
          >导出 LRC</UiButton
        >
      </div>
    </header>
    <mdui-tabs
      v-if="editor.project.stage > 0"
      class="editor-tabs"
      role="tablist"
      aria-label="歌词编辑视图"
      variant="secondary"
      placement="top"
      :value="String(editor.project.stage)"
      @change="changeTab"
    >
      <mdui-tab
        v-for="(tab, index) in tabs"
        :id="`editor-tab-${index + 1}`"
        :key="tab"
        role="tab"
        :aria-selected="editor.project.stage === index + 1"
        aria-controls="editor-panel"
        :tabindex="editor.project.stage === index + 1 ? 0 : -1"
        :aria-disabled="!editor.project.lines.length"
        :value="String(index + 1)"
        @keydown="tabKey($event, index)"
      >
        {{ tab }}
      </mdui-tab>
    </mdui-tabs>
    <div v-if="editor.error" class="notice error-notice" role="alert">
      <span>{{ editor.error }}</span
      ><UiIconButton
        label="关闭错误提示"
        icon="close"
        @click="editor.error = ''"
      />
    </div>
    <div v-else-if="editor.message" class="notice" role="status">
      <span>{{ editor.message }}</span
      ><UiIconButton
        label="关闭提示"
        icon="close"
        @click="editor.message = ''"
      />
    </div>
    <main
      id="editor-panel"
      class="app-main"
      :role="editor.project.stage > 0 ? 'tabpanel' : undefined"
      :aria-labelledby="
        editor.project.stage > 0
          ? `editor-tab-${editor.project.stage}`
          : undefined
      "
    >
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
    <AudioBar v-if="editor.project.stage < 2" @audio="audioInput?.click()" />
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
        <UiSelect
          v-model="theme"
          label="主题"
          :options="themes"
          @change="applyTheme"
        /><label class="native-field"
          >主题色<input
            v-model="seed"
            type="color"
            @input="applyTheme" /></label
        ><UiField
          :model-value="String(editor.compensation)"
          label="录点提前补偿（ms）"
          type="number"
          min="-1000"
          max="1000"
          step="10"
          @update:model-value="editor.compensation = Number($event)"
        />
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
