<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { editor } from "../state/editor";
import { formatTime, completeLine } from "../domain/model";
import {
  setLineStart,
  setUnitStart,
  setLineEnd,
  shiftAll,
} from "../domain/edit";
import { graphemes, mergeUnits, splitUnit } from "../domain/tokenize";
import UiButton from "../components/UiButton.vue";
import Icon from "../components/Icon.vue";
import TimeInput from "../components/TimeInput.vue";
import Waveform from "../components/Waveform.vue";
import Modal from "../components/Modal.vue";
const emit = defineEmits<{ audio: [] }>();
const splitOpen = ref(false),
  shiftOpen = ref(false),
  shiftMs = ref("0"),
  listOpen = ref(false);
const lineMode = computed(() => editor.project.stage === 2);
const current = computed(() => editor.line?.units[editor.cursor]);
const selected = computed(() => editor.line?.units[editor.selectedUnit]);
const conflict = computed(() =>
  editor.conflicts.find((issue) => issue.lineId === editor.line?.id),
);
const brokenComplete = computed(
  () => !!editor.line && completeLine(editor.line) && !editor.isComplete,
);
const status = computed(() =>
  editor.mode === "starting"
    ? "正在开始播放…"
    : editor.mode === "recording"
      ? "正在记录"
      : editor.mode === "review"
        ? "试听中"
        : editor.mode === "paused"
          ? "已暂停"
          : editor.mode === "ended"
            ? "已到播放边界"
            : editor.isComplete && !lineMode.value
              ? "本行完成"
              : "准备开始",
);
const target = computed(() =>
  lineMode.value
    ? editor.line?.text
    : editor.isComplete
      ? "完成"
      : brokenComplete.value
        ? "待调整"
        : current.value?.text.trim() || "收尾",
);
const prompt = computed(() =>
  brokenComplete.value && !lineMode.value
    ? "调整时标，或从选中单位重打"
    : editor.isComplete && !lineMode.value
      ? "R 试听 · Ctrl / Cmd + Enter 下一句"
      : editor.mode === "ended" && editor.cursor === editor.line?.units.length
        ? "Enter 以播放边界收尾"
        : editor.mode === "recording"
          ? lineMode.value
            ? "听到这句开始时，按 Enter"
            : current.value
              ? "听到这个单位开始时，按 Enter"
              : "唱完最后一个单位，按 Enter 收尾"
          : "Enter 开始 / 继续播放，本次不记录",
);
function focusWorkspace() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function recordClick() {
  focusWorkspace();
  void editor.enter();
}
function retimeClick() {
  editor.retime(editor.selectedUnit);
  focusWorkspace();
}
function reviewClick() {
  focusWorkspace();
  void editor.review();
}
watch(
  () => editor.cursor,
  () =>
    nextTick(() =>
      document
        .querySelector(".unit-strip .pending")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    ),
);
const splitChars = computed(() =>
  selected.value ? graphemes(selected.value.text) : [],
);
function selectUnit(index: number, event: MouseEvent) {
  editor.pause();
  if (event.shiftKey) editor.selectionEnd = index;
  else {
    editor.selectedUnit = index;
    editor.selectionEnd = index;
  }
  const time = editor.line?.units[index].startMs;
  if (time !== null && time !== undefined) editor.seek(time - 200);
}
function merge() {
  editor.pause();
  editor.command("合并单位", (p) => {
    const line = p.lines[editor.lineIndex];
    line.units = mergeUnits(
      line.units,
      Math.min(editor.selectedUnit, editor.selectionEnd),
      Math.max(editor.selectedUnit, editor.selectionEnd),
    );
  });
  editor.selectedUnit = Math.min(editor.selectedUnit, editor.selectionEnd);
  editor.selectionEnd = editor.selectedUnit;
}
function split(offset: number) {
  editor.command("拆分单位", (p) => {
    const line = p.lines[editor.lineIndex];
    line.units = splitUnit(line.units, editor.selectedUnit, offset);
  });
  splitOpen.value = false;
  setTimeout(focusWorkspace, 0);
}
function applyShift() {
  const value = Number(shiftMs.value);
  if (!Number.isSafeInteger(value)) {
    editor.error = "请输入整数毫秒。";
    return;
  }
  if (editor.command("整体平移", (p) => shiftAll(p, value)))
    shiftOpen.value = false;
}
function choose(id: string) {
  editor.selectLine(id);
  listOpen.value = false;
  focusWorkspace();
}
function fieldStart(ms: number) {
  editor.pause();
  return editor.command(lineMode.value ? "调整句首" : "调整单位起点", (p) => {
    if (lineMode.value) setLineStart(p, editor.lineIndex, ms);
    else setUnitStart(p, editor.lineIndex, editor.selectedUnit, ms);
  });
}
function fieldEnd(ms: number) {
  editor.pause();
  return editor.command("调整收尾", (p) => setLineEnd(p, editor.lineIndex, ms));
}
function selectedClass(index: number) {
  return (
    index >= Math.min(editor.selectedUnit, editor.selectionEnd) &&
    index <= Math.max(editor.selectedUnit, editor.selectionEnd)
  );
}
</script>
<template>
  <section class="timing-layout">
    <aside class="lyric-nav surface" :class="{ open: listOpen }">
      <div class="nav-heading">
        <h2>歌词</h2>
        <span
          >{{
            lineMode
              ? editor.project.lines.filter((l) => l.startMs !== null).length
              : editor.finishedCount
          }}
          / {{ editor.project.lines.length }}</span
        >
      </div>
      <div class="lyric-nav-list">
        <button
          v-for="(line, index) in editor.project.lines"
          :key="line.id"
          :class="{ active: line.id === editor.line?.id }"
          :title="
            editor.conflicts.find((issue) => issue.lineId === line.id)?.message
          "
          @click="choose(line.id)"
        >
          <span class="nav-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <div>
            <strong>{{ line.text }}</strong
            ><small>{{ formatTime(line.startMs) }}</small>
          </div>
          <Icon
            v-if="
              (lineMode ? line.startMs !== null : completeLine(line)) &&
              !editor.conflicts.some((issue) => issue.lineId === line.id)
            "
            name="check"
            :size="16"
          /><span
            v-else
            class="progress-dot"
            :class="{
              partial: line.units.some((u) => u.startMs !== null),
              invalid: editor.conflicts.some(
                (issue) => issue.lineId === line.id,
              ),
            }"
          />
        </button>
      </div>
      <button
        class="text-link shift-button"
        @click="
          editor.pause();
          shiftOpen = true;
        "
      >
        整曲时间偏移
      </button>
    </aside>
    <div
      class="timing-workspace surface"
      data-workspace
      tabindex="0"
      aria-label="打轴工作区"
    >
      <div class="workspace-heading">
        <div>
          <button
            class="icon-button drawer-toggle"
            aria-label="显示歌词列表"
            @click="listOpen = !listOpen"
          >
            <Icon name="list" /></button
          ><span class="eyebrow">{{
            lineMode ? "LINE BY LINE" : "ONE WORD AT A TIME"
          }}</span>
          <h1>{{ lineMode ? "逐行打轴" : "逐字打轴" }}</h1>
        </div>
        <span class="workspace-counter"
          >第 {{ editor.lineIndex + 1 }} /
          {{ editor.project.lines.length }} 句</span
        >
      </div>
      <div v-if="!editor.asset" class="missing-audio">
        <Icon name="music" /><span>草稿已恢复，重新选择原音频即可继续。</span
        ><UiButton variant="tonal" @click="emit('audio')">选择音频</UiButton>
      </div>
      <template v-if="editor.line"
        ><p v-if="conflict" class="conflict-note" role="alert">
          {{ conflict.message }}。调整时标或重打修正。
        </p>
        <div
          class="target-area"
          :class="{ complete: editor.isComplete && !lineMode }"
        >
          <span class="state-label"
            ><span
              class="status-dot"
              :class="{ live: editor.mode === 'recording' }"
            />{{ status }}</span
          >
          <p v-if="!lineMode" class="full-line">{{ editor.line.text }}</p>
          <div class="target-caption">
            {{
              lineMode
                ? "待记录句首"
                : editor.isComplete
                  ? "已记录起点和收尾"
                  : current
                    ? "待记录起点"
                    : "等待收尾"
            }}
          </div>
          <div class="target-text" :class="{ 'sentence-target': lineMode }">
            {{ target }}
          </div>
          <p class="record-prompt">
            <kbd>Enter</kbd>{{ prompt.replace(/^Enter\s*/, "") }}
          </p>
          <span v-if="!lineMode" class="unit-progress"
            >{{ editor.line.units.filter((u) => u.startMs !== null).length }} /
            {{ editor.line.units.length }} 个起点 ·
            {{ editor.line.endMs === null ? "收尾待记录" : "已收尾" }}</span
          >
        </div>
        <div v-if="!lineMode" class="unit-strip" aria-label="本句切分">
          <button
            v-for="(unit, index) in editor.line.units"
            :key="unit.id"
            :class="{
              recorded: unit.startMs !== null,
              pending: index === editor.cursor && !editor.isComplete,
              selected: selectedClass(index),
            }"
            :aria-label="`选择单位 ${index + 1}：${unit.text.trim()}`"
            @click="selectUnit(index, $event)"
          >
            <span>{{ unit.text.trim() }}</span
            ><small>{{
              unit.startMs === null ? "待打" : formatTime(unit.startMs)
            }}</small></button
          ><span
            class="unit-end"
            :class="{ recorded: editor.line.endMs !== null }"
            >{{ editor.line.endMs === null ? "＋ 收尾" : "✓ 收尾" }}</span
          >
        </div>
        <div v-if="!lineMode" class="unit-tools">
          <span class="small-note">Shift + 点击选中相邻单位</span>
          <div>
            <button
              class="text-link"
              :disabled="editor.selectedUnit === editor.selectionEnd"
              @click="merge"
            >
              <Icon name="merge" :size="16" />合并</button
            ><button
              class="text-link"
              :disabled="splitChars.length < 2"
              @click="
                editor.pause();
                splitOpen = true;
              "
            >
              <Icon name="split" :size="16" />拆分</button
            ><button class="text-link" @click="retimeClick">
              <Icon name="repeat" :size="16" />从选中单位重打
            </button>
          </div>
        </div>
        <Waveform />
        <div class="precision-row">
          <TimeInput
            :value="
              lineMode ? editor.line.startMs : (selected?.startMs ?? null)
            "
            :label="
              lineMode ? '本句起点' : `「${selected?.text.trim() ?? ''}」起点`
            "
            :commit="fieldStart"
          /><TimeInput
            v-if="
              !lineMode && editor.selectedUnit === editor.line.units.length - 1
            "
            :value="editor.line.endMs"
            label="本句收尾"
            :commit="fieldEnd"
          /><span v-else-if="!lineMode" class="small-note"
            >终点由下一单位起点决定</span
          ><span v-else class="small-note"
            >已有逐字时间的句首修改会平移整句。</span
          >
        </div>
        <div class="workspace-actions">
          <div>
            <UiButton
              variant="filled"
              :disabled="
                !editor.asset ||
                editor.mode === 'starting' ||
                (!lineMode && (editor.isComplete || brokenComplete))
              "
              :icon="editor.playing ? 'check' : 'play'"
              @click="recordClick"
              >{{
                editor.mode === "recording"
                  ? lineMode
                    ? "记录句首"
                    : current
                      ? "记录起点"
                      : "记录收尾"
                  : editor.mode === "paused"
                    ? "继续打轴"
                    : lineMode && editor.line.startMs !== null
                      ? "重打本句"
                      : "开始打轴"
              }}</UiButton
            ><UiButton
              variant="text"
              icon="repeat"
              :disabled="!editor.asset"
              @click="reviewClick"
              >试听本句</UiButton
            >
          </div>
          <UiButton
            v-if="lineMode"
            variant="tonal"
            icon="arrow"
            @click="editor.confirmLines"
            >逐行完成，进入逐字</UiButton
          ><UiButton
            v-else
            variant="tonal"
            icon="arrow"
            :disabled="!editor.isComplete"
            @click="editor.nextLine"
            >下一句</UiButton
          >
        </div>
        <div class="keyboard-strip">
          <span><kbd>Space</kbd>播放 / 暂停</span
          ><span><kbd>Backspace</kbd>退回并暂停</span
          ><span><kbd>R</kbd>试听</span>
        </div>
      </template>
    </div>
    <Modal :open="splitOpen" title="选择拆分位置" @close="splitOpen = false"
      ><p class="small-note">
        点击完整字符之间的分隔线；新单位的起点需要重新记录。
      </p>
      <div class="split-picker">
        <template v-for="(char, index) in splitChars" :key="index"
          ><span>{{ char }}</span
          ><button
            v-if="index < splitChars.length - 1"
            :aria-label="`在第 ${index + 1} 个字符后拆分`"
            @click="split(splitChars.slice(0, index + 1).join('').length)"
          >
            │
          </button></template
        >
      </div></Modal
    >
    <Modal :open="shiftOpen" title="整体平移歌词" @close="shiftOpen = false"
      ><p>正数延后，负数提前。句首、逐字起点与收尾一同移动。</p>
      <label class="native-field"
        >偏移毫秒<input v-model="shiftMs" type="number" step="1"
      /></label>
      <footer>
        <UiButton @click="shiftOpen = false">取消</UiButton
        ><UiButton variant="filled" @click="applyShift">应用偏移</UiButton>
      </footer></Modal
    >
  </section>
</template>
