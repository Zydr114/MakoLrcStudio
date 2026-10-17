<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { editor } from "../state/editor";
import {
  activeLines,
  completeLine,
  formatTime,
  hasTiming,
  syllableLabel,
  syllableRefs,
  syllablesOf,
} from "../domain/model";
import {
  setLineStartBoundary,
  setSyllableStart,
  setSyllableEnd,
  syllableEndBounds,
  setLineEnd,
  shiftAll,
} from "../domain/edit";
import { playingLineIndex, tokenIntervals } from "../domain/timing";
import UiButton from "../components/UiButton.vue";
import UiIconButton from "../components/UiIconButton.vue";
import UiField from "../components/UiField.vue";
import UiSelect from "../components/UiSelect.vue";
import UiToggle from "../components/UiToggle.vue";
import { extraModes, previewModes } from "../components/controlOptions";
import Icon from "../components/Icon.vue";
import TimeInput from "../components/TimeInput.vue";
import Waveform from "../components/Waveform.vue";
import Modal from "../components/Modal.vue";
import TimingCue from "../components/TimingCue.vue";
import TokenSegmentation from "../components/TokenSegmentation.vue";
import LyricPreview from "../components/LyricPreview.vue";
import SongPreview from "../components/SongPreview.vue";
import LineTextEditor from "../components/LineTextEditor.vue";
const emit = defineEmits<{ audio: [] }>();
const listOpen = ref(false),
  shiftOpen = ref(false),
  songOpen = ref(false),
  textOpen = ref(false),
  shiftMs = ref("0"),
  fillPreview = ref(false),
  extraMode = ref<(typeof extraModes)[number]["value"]>("translation");
const hasExtras = computed(() =>
  editor.lines.some((line) => line.translation || line.roman),
);
const extras = computed(() =>
  !hasExtras.value
    ? []
    : extraMode.value === "both"
      ? (["translation", "roman"] as const).slice()
      : extraMode.value === "none"
        ? []
        : [extraMode.value],
);
const playingLine = computed(() =>
  playingLineIndex(editor.displayProject, editor.positionMs),
);
const lineMode = computed(() => editor.project.stage === 2);
const hasLineTiming = computed(() => {
  const line = editor.line;
  return (
    !!line && (line.startMs !== null || line.endMs !== null || hasTiming(line))
  );
});
const selected = computed(() => editor.selectedSyllable?.syllable);
const selectedText = computed(() =>
  editor.selectedSyllable
    ? syllableLabel(
        editor.selectedSyllable.unit,
        editor.selectedSyllable.syllable,
      )
    : "",
);
const syllableCount = computed(() =>
  editor.line ? syllablesOf(editor.line).length : 0,
);
const lastSelected = computed(
  () => editor.selectedIndex === syllableCount.value - 1,
);
/** An explicit end leaves a pause before the next syllable. */
const paused = computed(() => selected.value?.endMs != null);
const selectedEnd = computed(() =>
  lastSelected.value
    ? editor.line?.endMs
    : (selected.value?.endMs ??
      (editor.line &&
        syllablesOf(editor.line)[editor.selectedIndex + 1]?.startMs)),
);
const conflict = computed(() =>
  editor.conflicts.find((issue) => issue.lineId === editor.line?.id),
);
const previewLine = computed(() => {
  if (editor.auditionScope === "song" || lineMode.value) {
    const index = playingLineIndex(editor.displayProject, editor.positionMs);
    if (index >= 0) return editor.displayLines[index];
    if (editor.recordingArmed && editor.lastRecorded && lineMode.value)
      return (
        editor.displayLines.find(
          (line) => line.id === editor.lastRecorded!.lineId,
        ) ?? editor.displayLine
      );
    if (editor.auditionScope === "song")
      return (
        editor.displayLines
          .filter(
            (line) =>
              line.startMs !== null && line.startMs <= editor.positionMs,
          )
          .at(-1) ?? editor.displayLine
      );
  }
  return editor.displayLine;
});
const previewLimit = computed(() => {
  const index = editor.displayLines.findIndex(
    (line) => line.id === previewLine.value?.id,
  );
  return Math.min(
    editor.project.audio?.durationMs ?? Infinity,
    editor.displayLines[index + 1]?.startMs ?? Infinity,
  );
});
const provisional = computed(() =>
  editor.recordingArmed &&
  editor.lastRecorded?.lineId === editor.line?.id &&
  editor.lastRecorded.index === editor.cursor - 1 &&
  editor.positionMs >= editor.lastRecorded.timeMs
    ? editor.line &&
      syllableRefs(editor.line)[editor.lastRecorded.index]?.unit.id
    : null,
);
const selectedInterval = computed(() =>
  editor.displayLine
    ? tokenIntervals(
        editor.displayLine,
        Math.min(
          editor.project.audio?.durationMs ?? Infinity,
          editor.displayLines[editor.lineIndex + 1]?.startMs ?? Infinity,
        ),
      ).find((interval) => interval.id === selected.value?.id)
    : undefined,
);
function focus() {
  document
    .querySelector<HTMLElement>("[data-workspace]")
    ?.focus({ preventScroll: true });
}
function choose(id: string) {
  editor.selectLine(id);
  listOpen.value = false;
  focus();
}
function applyStart(p: typeof editor.project, ms: number) {
  if (lineMode.value) setLineStartBoundary(p, editor.lineIndex, ms);
  else setSyllableStart(p, editor.lineIndex, editor.selectedIndex, ms);
}
function applyEnd(p: typeof editor.project, ms: number) {
  if (lineMode.value) setLineEnd(p, editor.lineIndex, ms);
  else if (
    editor.selectedIndex ===
    syllablesOf(activeLines(p)[editor.lineIndex]).length - 1
  )
    setLineEnd(p, editor.lineIndex, ms);
  else if (paused.value)
    setSyllableEnd(p, editor.lineIndex, editor.selectedIndex, ms);
  else setSyllableStart(p, editor.lineIndex, editor.selectedIndex + 1, ms);
}
function fieldStart(ms: number) {
  if (editor.recordingArmed) editor.pause();
  editor.clearPreview();
  return editor.command("调整起点", (p) => applyStart(p, ms));
}
function fieldEnd(ms: number) {
  if (editor.recordingArmed) editor.pause();
  editor.clearPreview();
  return editor.command("调整终点", (p) => applyEnd(p, ms));
}
/** Turning a pause on moves nothing: the end starts at the next boundary. */
function togglePause(on: boolean) {
  if (editor.recordingArmed) editor.pause();
  editor.clearPreview();
  const index = editor.selectedIndex;
  editor.command(on ? "设置停顿" : "取消停顿", (p) =>
    setSyllableEnd(
      p,
      editor.lineIndex,
      index,
      on ? syllableEndBounds(p, editor.lineIndex, index)[1] : null,
    ),
  );
}
function previewStart(ms: number) {
  return editor.previewCommand("start-field", (p) => applyStart(p, ms));
}
function previewEnd(ms: number) {
  return editor.previewCommand("end-field", (p) => applyEnd(p, ms));
}
function cancelField(owner: string) {
  if (editor.previewOwner === owner) editor.clearPreview();
}
function audition(scope: "line" | "token" | "boundary" | "song") {
  focus();
  void editor.review(scope);
}
function auditionVariant(scope: "line" | "token" | "boundary") {
  return editor.auditionScope === scope ? "filled" : "outlined";
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
watch(
  () => editor.cursor,
  () =>
    nextTick(() =>
      document
        .querySelector(".unit-strip .pending")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    ),
);
</script>
<template>
  <section class="timing-layout">
    <aside class="lyric-nav surface" :class="{ open: listOpen }">
      <div class="nav-heading">
        <h2>歌词</h2>
        <span
          >{{
            lineMode
              ? editor.lines.filter((line) => line.startMs !== null).length
              : editor.finishedCount
          }}
          / {{ editor.lines.length }}</span
        >
      </div>
      <div class="lyric-nav-list">
        <button
          v-for="(line, index) in editor.lines"
          :key="line.id"
          :class="{
            active: line.id === editor.line?.id,
            playing: editor.playing && index === playingLine,
          }"
          :aria-current="line.id === editor.line?.id ? 'true' : undefined"
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
            v-if="editor.playing && index === playingLine"
            class="nav-playing-icon"
            name="play"
            :size="16"
            aria-label="当前播放行"
          />
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
              partial: hasTiming(line),
              invalid: editor.conflicts.some(
                (issue) => issue.lineId === line.id,
              ),
            }"
          />
        </button>
      </div>
      <UiButton
        v-if="!lineMode"
        class="song-button"
        variant="text"
        :disabled="!editor.asset || editor.editingText"
        @click="songOpen = true"
      >
        试听整曲
      </UiButton>
      <UiButton
        class="shift-button"
        variant="tonal"
        @click="
          editor.pause();
          shiftOpen = true;
        "
      >
        整曲时间偏移
      </UiButton>
    </aside>
    <div
      class="timing-workspace surface"
      data-workspace
      tabindex="0"
      aria-label="打轴工作区"
    >
      <div class="workspace-heading">
        <div>
          <UiIconButton
            class="drawer-toggle"
            label="显示歌词列表"
            icon="list"
            @click="listOpen = !listOpen"
          />
          <h1>{{ lineMode ? "逐行打轴" : "逐字打轴" }}</h1>
          <UiButton
            variant="text"
            :disabled="editor.editingText"
            @click="textOpen = true"
          >
            {{ lineMode ? "编辑／拆分" : "编辑正文" }}
          </UiButton>
          <UiButton
            class="clear-line-action"
            variant="outlined"
            icon="trash"
            :disabled="editor.editingText || !hasLineTiming"
            title="清除本行句首、逐字起点和收尾；可用撤销恢复"
            @click="editor.clearLineTiming"
            >清除本行时标</UiButton
          >
        </div>
        <span class="workspace-counter"
          >第 {{ editor.lineIndex + 1 }} / {{ editor.lines.length }} 行
          <template v-if="!lineMode"
            >·
            {{
              editor.line &&
              syllablesOf(editor.line).filter(
                (syllable) => syllable.startMs !== null,
              ).length
            }}
            / {{ syllableCount }}</template
          ></span
        >
      </div>
      <div v-if="!editor.asset" class="missing-audio">
        <span>{{
          editor.project.audio ? "重新选择原音频" : "选择音频以开始打轴"
        }}</span
        ><UiButton variant="tonal" @click="emit('audio')">选择音频</UiButton>
      </div>
      <template v-if="editor.line">
        <p v-if="conflict" class="conflict-note" role="alert">
          {{ conflict.message }}
        </p>
        <TimingCue v-if="!editor.editingText" />
        <LyricPreview
          v-if="previewLine"
          :line="previewLine"
          :lines="editor.displayLines"
          :active-line-id="previewLine.id"
          :position-ms="editor.positionMs"
          :limit-ms="previewLimit"
          :fill="fillPreview"
          :line-mode="lineMode"
          :provisional-unit-id="provisional"
          :extras="extras"
          scrolling
        />
        <LineTextEditor :open="textOpen" @close="textOpen = false" />
        <TokenSegmentation v-if="!lineMode" v-show="!textOpen" />
        <div v-if="!editor.editingText" class="precision-row">
          <TimeInput
            :value="
              lineMode ? editor.line.startMs : (selected?.startMs ?? null)
            "
            :label="lineMode ? '本句起点' : `「${selectedText}」起点`"
            :commit="fieldStart"
            :preview="previewStart"
            :cancel="() => cancelField('start-field')"
          />
          <TimeInput
            :value="lineMode ? editor.line.endMs : (selectedEnd ?? null)"
            :label="
              lineMode
                ? '本句终点'
                : lastSelected
                  ? '本句收尾'
                  : `「${selectedText}」终点`
            "
            :commit="fieldEnd"
            :preview="previewEnd"
            :cancel="() => cancelField('end-field')"
            :disabled="lineMode && editor.line.startMs === null"
            :title="
              lineMode
                ? '留空时取下一句起点作为参考终点'
                : lastSelected
                  ? '真实收尾'
                  : paused
                    ? '独立终点：与下一音节之间留出停顿'
                    : '与下一项起点共用边界'
            "
          />
          <UiToggle
            v-if="
              !lineMode &&
              !lastSelected &&
              (paused || selectedInterval?.kind === 'confirmed')
            "
            switch
            :model-value="paused"
            label="停顿"
            @update:model-value="togglePause"
          />
          <span
            v-if="
              lineMode &&
              (editor.line.endMs === null || editor.line.endInferred)
            "
            class="small-note"
            >{{ editor.line.endMs === null ? "参考范围" : "参考收尾" }}</span
          >
          <span
            v-if="!lineMode && selectedInterval?.kind === 'confirmed'"
            class="duration-label"
            >{{
              (
                (selectedInterval.endMs! - selectedInterval.startMs) /
                1000
              ).toFixed(3)
            }}s</span
          >
        </div>
        <div v-if="!editor.editingText" class="workspace-actions">
          <div class="audition-actions">
            <UiButton
              class="audition-action"
              :variant="auditionVariant('line')"
              :aria-pressed="editor.auditionScope === 'line'"
              :disabled="!editor.asset"
              @click="audition('line')"
              >试听本行</UiButton
            ><UiButton
              v-if="!lineMode"
              class="audition-action"
              :variant="auditionVariant('token')"
              :aria-pressed="editor.auditionScope === 'token'"
              :disabled="
                !editor.asset || selectedInterval?.kind !== 'confirmed'
              "
              title="需已确认区间"
              @click="audition('token')"
              >试听选中</UiButton
            ><UiButton
              v-if="!lineMode"
              class="audition-action"
              :variant="auditionVariant('boundary')"
              :aria-pressed="editor.auditionScope === 'boundary'"
              :disabled="!editor.asset || selected?.startMs === null"
              @click="audition('boundary')"
              >试听边界</UiButton
            ><UiToggle switch v-model="editor.loopAudition" label="循环试听" />
            <UiSelect
              v-if="!lineMode"
              v-model="fillPreview"
              label="预览方式"
              compact
              :options="previewModes"
            /><UiSelect
              v-if="hasExtras"
              v-model="extraMode"
              label="附加显示"
              compact
              :options="extraModes"
            /><span
              v-if="
                editor.auditionScope === 'line' &&
                (editor.line.endMs === null || editor.line.endInferred)
              "
              class="small-note"
              >参考收尾</span
            >
          </div>
          <UiButton
            v-if="
              lineMode && !editor.lines.every((line) => line.startMs !== null)
            "
            variant="tonal"
            :disabled="editor.lineIssues.length > 0"
            @click="editor.confirmLines"
            >逐行完成，进入逐字</UiButton
          ><UiButton
            v-else-if="!lineMode && editor.lineIndex < editor.lines.length - 1"
            variant="tonal"
            icon="arrow"
            :disabled="
              !editor.isComplete || editor.lineIndex === editor.lines.length - 1
            "
            @click="editor.nextLine"
            >下一句</UiButton
          >
        </div>
        <Waveform @audio="emit('audio')" />
      </template>
      <p v-else class="empty-note">
        「{{
          editor.part.name
        }}」还没有歌词行。请到文本处理添加，或切换到其他声部。
      </p>
    </div>
    <SongPreview
      :open="songOpen"
      :fill="fillPreview"
      @close="songOpen = false"
    />
    <Modal
      :open="shiftOpen"
      title="整体平移歌词"
      @close="shiftOpen = false"
      @closed="focus"
      ><UiField
        v-model="shiftMs"
        type="number"
        label="偏移毫秒（正数延后）"
        min="-3600000"
        max="3600000"
        step="1"
      />
      <footer>
        <UiButton variant="text" @click="shiftOpen = false">取消</UiButton
        ><UiButton variant="filled" @click="applyShift">应用偏移</UiButton>
      </footer></Modal
    >
  </section>
</template>
