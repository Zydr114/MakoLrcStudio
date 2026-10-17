import { computed, markRaw, reactive, ref, shallowRef, watch } from "vue";
import { AudioTransport, type AudioAsset } from "../audio/transport";
import {
  newProject,
  newPart,
  copyProject,
  completeLine,
  activePart,
  activeLines,
  lineCount,
  mainPart,
  partColors,
  validateLines,
  syllableRefs,
  syllablesOf,
  syllableLabel,
  hasTiming,
  validate,
  type ProjectDraft,
} from "../domain/model";
import { ProjectHistory, type PointChange } from "../domain/history";
import { importLyrics, exportLyrics } from "../domain/lrc";
import { readBackup, downloadText } from "../domain/backup";
import {
  setLineStartBoundary,
  setLineEnd,
  setSyllableStart,
  completeLineEnds,
} from "../domain/edit";
import { tokenize } from "../domain/tokenize";
import { lrcLosses, nextPartName } from "../domain/parts";
import {
  exportTtml as ttmlText,
  importTtml,
  looksLikeTtml,
} from "../domain/ttml";
import {
  exportAss as assText,
  importAss,
  looksLikeAss,
  type AssOptions,
} from "../domain/ass";
import { fontMetrics } from "./assFont";
import {
  assStyleOf,
  normalizeAssStyle,
  type AssStyle,
} from "../domain/assStyle";
import {
  createAudition,
  type AuditionScope,
  type AuditionTarget,
} from "./audition";
import { tokenIntervals } from "../domain/timing";
import { loadDraft, saveDraft } from "./persistence";

export type SessionMode =
  "idle" | "starting" | "recording" | "paused" | "review" | "ended";
export type TransportPort = Pick<
  AudioTransport,
  | "asset"
  | "playing"
  | "rate"
  | "volume"
  | "load"
  | "play"
  | "pause"
  | "seek"
  | "setRate"
  | "setVolume"
  | "reset"
  | "captureMs"
  | "nowMs"
  | "onEnded"
>;

export function createEditor(
  transport: TransportPort = markRaw(new AudioTransport()),
  persist = true,
) {
  const project = shallowRef<ProjectDraft>(newProject());
  const asset = shallowRef<AudioAsset | null>(null);
  const gestureDraft = shallowRef<ProjectDraft | null>(null);
  const previewOwner = ref<string | null>(null);
  const displayProject = computed(() => gestureDraft.value ?? project.value);
  const loading = ref(false),
    restoring = ref(true);
  const error = ref(""),
    message = ref(""),
    saveState = ref("尚无草稿");
  const mode = ref<SessionMode>("idle");
  const recordingArmed = ref(false);
  const editingText = ref(false);
  /** Which layer of the text view is shown: lyrics, readings, translation or romanization. */
  const textLayer = ref<"lyrics" | "ruby" | "translation" | "roman">("lyrics");
  const positionMs = ref(0),
    playing = ref(false),
    rate = ref(1),
    volume = ref(0.8);
  const compensation = ref(0);
  /** The selected timing point: a position in the current line's syllables. */
  const selectedIndex = ref(0);
  const history = markRaw(new ProjectHistory());
  const historyVersion = ref(0);
  let saveGeneration = 0;
  let initialized = !persist;
  let retimeOne = false;
  const audition = createAudition(
    transport,
    auditionBounds,
    () => {
      mode.value = "review";
      recordingArmed.value = false;
    },
    sync,
    (value) => {
      showError(value);
      mode.value = "idle";
    },
  );
  const part = computed(() => activePart(project.value));
  /** The shared ASS preset and appearance; old drafts fall back to defaults. */
  const assStyle = computed(() => assStyleOf(project.value));
  /** Lines of the part being edited; every view works on one part at a time. */
  const lines = computed(() => part.value.lines);
  const displayLines = computed(() => activeLines(displayProject.value));
  const lineIndex = computed(() =>
    Math.max(
      0,
      lines.value.findIndex((l) => l.id === project.value.activeLineId),
    ),
  );
  const line = computed(() => lines.value[lineIndex.value] ?? null);
  const displayLine = computed(
    () => displayLines.value[lineIndex.value] ?? null,
  );
  /** Whole project, every part: whether there is anything to edit at all. */
  const lineTotal = computed(() => lineCount(project.value));
  const selectedSyllable = computed(() =>
    line.value ? (syllableRefs(line.value)[selectedIndex.value] ?? null) : null,
  );
  const displaySyllable = computed(() =>
    displayLine.value
      ? (syllableRefs(displayLine.value)[selectedIndex.value] ?? null)
      : null,
  );
  function clearPreview() {
    gestureDraft.value = null;
    previewOwner.value = null;
  }
  function previewCommand(
    owner: string,
    apply: (draft: ProjectDraft) => void,
  ): boolean {
    try {
      const draft = copyProject(project.value);
      apply(draft);
      gestureDraft.value = draft;
      previewOwner.value = owner;
      error.value = "";
      return true;
    } catch (value) {
      return false;
    }
  }
  function commitPreview(label: string): boolean {
    if (!gestureDraft.value) return true;
    const draft = gestureDraft.value;
    clearPreview();
    return command(label, (target) => {
      target.parts = draft.parts;
    });
  }
  /** The next syllable to record; the syllable count means the line end. */
  const cursor = computed(() => {
    const current = line.value;
    if (!current) return 0;
    const syllables = syllablesOf(current);
    const missing = syllables.findIndex((s) => s.startMs === null);
    return missing < 0 ? syllables.length : missing;
  });
  const lineIssues = computed(() => validate(project.value, false));
  const issues = computed(() => validate(project.value));
  const conflicts = computed(() =>
    issues.value.filter((issue) => issue.kind === "conflict"),
  );
  const validLine = (id: string) =>
    !issues.value.some((issue) => issue.lineId === id);
  const isComplete = computed(
    () => !!line.value && completeLine(line.value) && validLine(line.value.id),
  );
  /** What the primary word-timing button does for the current line. */
  const wordTimingAction = computed<"start" | "continue" | "restart">(() => {
    if (!line.value) return "start";
    if (isComplete.value) return "restart";
    return syllablesOf(line.value).some(
      (syllable) => syllable.startMs !== null || syllable.endMs !== null,
    )
      ? "continue"
      : "start";
  });
  const finishedCount = computed(
    () =>
      lines.value.filter((line) => completeLine(line) && validLine(line.id))
        .length,
  );
  const lastRecorded = computed(() => {
    historyVersion.value;
    const entry = [...history.past].reverse().find((entry) => entry.point);
    if (!entry?.point) return null;
    const sourceLine = entry.after.parts
      .flatMap((part) => part.lines)
      .find((line) => line.id === entry.point!.lineId);
    const ref = sourceLine && syllableRefs(sourceLine)[entry.point.index];
    return {
      ...entry.point,
      text:
        entry.after.stage === 2
          ? sourceLine?.text
          : ref
            ? syllableLabel(ref.unit, ref.syllable)
            : "收尾",
    };
  });
  const canUndo = computed(() => {
    historyVersion.value;
    return history.past.length > 0;
  });
  const canRedo = computed(() => {
    historyVersion.value;
    return history.future.length > 0;
  });

  function sync() {
    positionMs.value = transport.nowMs();
    playing.value = transport.playing;
  }
  function pause() {
    audition.invalidate();
    transport.pause();
    sync();
    if (
      asset.value &&
      project.value.playheadMs !== Math.round(positionMs.value)
    )
      view({ playheadMs: Math.round(positionMs.value) });
    if (mode.value !== "idle") mode.value = "paused";
  }
  function showError(value: unknown) {
    error.value = value instanceof Error ? value.message : String(value);
  }
  function command(
    label: string,
    apply: (draft: ProjectDraft) => void,
    point?: PointChange,
  ): boolean {
    try {
      const next = copyProject(project.value);
      apply(next);
      // Retain the v1 backup field; editing views no longer use it as a gate.
      next.unlockedStage = lineCount(next)
        ? 3
        : Math.max(next.stage, next.unlockedStage);
      if (JSON.stringify(next) === JSON.stringify(project.value)) return true;
      history.push(project.value, next, label, point);
      historyVersion.value++;
      clearPreview();
      project.value = next;
      error.value = "";
      return true;
    } catch (value) {
      showError(value);
      return false;
    }
  }
  function view(update: Partial<ProjectDraft>) {
    project.value = { ...project.value, ...update };
  }
  function setAssStyle(style: AssStyle): boolean {
    return command("修改字幕样式", (draft) => {
      draft.assStyle = normalizeAssStyle(style);
    });
  }
  async function flushSave() {
    if (!persist || !initialized) return;
    const generation = ++saveGeneration;
    const snapshot = copyProject(project.value);
    snapshot.playheadMs = Math.round(positionMs.value);
    saveState.value = "正在保存…";
    try {
      await saveDraft(snapshot);
      if (generation === saveGeneration) saveState.value = "草稿已保存在本机";
    } catch {
      if (generation === saveGeneration)
        saveState.value = "本机保存失败，请下载备份";
    }
  }
  watch(
    project,
    () => {
      if (initialized && persist) {
        saveState.value = "正在保存…";
        void flushSave();
      }
    },
    { flush: "sync" },
  );
  async function initialize() {
    if (persist) {
      try {
        const saved = await loadDraft();
        if (saved) {
          project.value = saved;
          message.value = "";
          saveState.value = "本机草稿已恢复";
        }
      } catch {
        saveState.value = "本机草稿不可用，仍可下载备份";
      }
    }
    initialized = true;
    restoring.value = false;
  }
  async function loadAudio(file: File) {
    if (loading.value) return;
    loading.value = true;
    pause();
    error.value = "";
    try {
      const result = await transport.load(file, project.value.audio?.hash);
      asset.value = markRaw(result);
      transport.seek(project.value.playheadMs);
      view({ audio: result.info });
      sync();
      message.value = "";
    } catch (value) {
      showError(
        value instanceof DOMException
          ? new Error(
              "音频无法解码。请尝试 WAV、MP3，或当前浏览器支持的其他格式。",
            )
          : value,
      );
    } finally {
      loading.value = false;
    }
  }
  /** Imports replace the project, or join it as one more part (asPart). */
  function importText(text: string, name = "未命名歌词", asPart = false) {
    pause();
    audition.cancel();
    recordingArmed.value = false;
    if (!text.trim()) {
      error.value = "请先输入或导入歌词。";
      return false;
    }
    if (looksLikeTtml(text))
      return importParts(name, asPart, "TTML", () => ({
        ...importTtml(text),
        mainIndex: 0,
        assStyle: null,
      }));
    if (looksLikeAss(text))
      return importParts(name, asPart, "ASS", () => importAss(text));
    const imported = importLyrics(text);
    if (asPart) {
      const success = command("作为新声部导入", (draft) => {
        const base = name.replace(/\.(lrc|elrc|txt)$/i, "").trim();
        const part = newPart(
          base && !draft.parts.some((p) => p.name === base)
            ? base
            : nextPartName(draft),
          imported.lines,
        );
        const used = new Set(draft.parts.map((p) => p.color));
        part.color = partColors.find((color) => !used.has(color)) ?? part.color;
        draft.parts.push(part);
        draft.activePartId = part.id;
        draft.activeLineId = imported.lines[0]?.id ?? null;
      });
      message.value = [
        success ? `已作为新声部「${part.value.name}」加入。` : "",
        ...imported.notices,
      ]
        .filter(Boolean)
        .join(" ");
      return success;
    }
    const success = command("导入歌词", (draft) => {
      const main = newPart("主唱", imported.lines);
      draft.parts = [main];
      draft.mainPartId = draft.activePartId = main.id;
      draft.metadata = imported.metadata;
      draft.name =
        imported.metadata.ti || name.replace(/\.(lrc|elrc|txt)$/i, "");
      draft.activeLineId = imported.lines[0]?.id ?? null;
      draft.stage = 0;
      draft.unlockedStage = 1;
    });
    message.value = imported.notices.join(" ");
    return success;
  }
  /** TTML and ASS bring whole parts: they replace the project or join it. */
  function importParts(
    name: string,
    asPart: boolean,
    format: string,
    read: () => ReturnType<typeof importAss>,
  ) {
    let imported: ReturnType<typeof importAss>;
    try {
      imported = read();
    } catch (value) {
      showError(value);
      return false;
    }
    const first = imported.parts[imported.mainIndex];
    const success = command(
      asPart ? `作为新声部导入 ${format}` : `导入 ${format}`,
      (draft) => {
        if (asPart) {
          for (const part of imported.parts) {
            let label = part.name;
            for (let n = 2; draft.parts.some((p) => p.name === label); n++)
              label = `${part.name} ${n}`;
            draft.parts.push({ ...part, name: label });
          }
        } else {
          draft.parts = imported.parts;
          draft.mainPartId = first.id;
          draft.metadata = imported.metadata;
          draft.name =
            imported.name ||
            name.replace(/\.(ttml|xml|ass|ssa)$/i, "") ||
            draft.name;
          if (imported.assStyle) draft.assStyle = imported.assStyle;
          draft.stage = 0;
          draft.unlockedStage = 1;
        }
        draft.translationLang ||= imported.translationLang;
        draft.romanLang ||= imported.romanLang;
        draft.activePartId = first.id;
        draft.activeLineId = first.lines[0]?.id ?? null;
      },
    );
    message.value = [
      success
        ? `已导入 ${format}：${imported.parts.length} 个声部（${imported.parts.map((p) => p.name).join("、")}）。`
        : "",
      asPart && imported.assStyle ? "作为新声部导入，未改变当前字幕样式。" : "",
      ...imported.notices,
    ]
      .filter(Boolean)
      .join(" ");
    return success;
  }
  function resetProject() {
    pause();
    audition.cancel();
    transport.reset();
    asset.value = null;
    history.clear();
    historyVersion.value++;
    clearPreview();
    recordingArmed.value = false;
    project.value = newProject();
    mode.value = "idle";
    error.value = "";
    message.value = "";
    sync();
  }
  function restoreBackup(text: string) {
    try {
      const draft = readBackup(text);
      pause();
      audition.cancel();
      clearPreview();
      recordingArmed.value = false;
      transport.reset();
      asset.value = null;
      project.value = draft;
      history.clear();
      historyVersion.value++;
      selectedIndex.value = 0;
      message.value = "编辑进度已恢复，请选择原音频。";
      error.value = "";
      sync();
    } catch (value) {
      showError(value);
    }
  }
  /** A snapshot returns in the part where it was edited, so the change is visible. */
  function restoreView(snapshot: ProjectDraft) {
    const restored = copyProject(snapshot);
    restored.stage = project.value.stage;
    restored.unlockedStage = Math.max(
      restored.stage,
      lineCount(restored) ? 3 : 0,
    );
    const restoredLines = activeLines(restored);
    restored.activeLineId = restoredLines.some(
      (l) => l.id === project.value.activeLineId,
    )
      ? project.value.activeLineId
      : restoredLines.some((l) => l.id === snapshot.activeLineId)
        ? snapshot.activeLineId
        : (restoredLines[0]?.id ?? null);
    return restored;
  }
  function undo() {
    clearPreview();
    const item = history.undo();
    if (!item) return;
    pause();
    audition.cancel();
    recordingArmed.value = false;
    project.value = restoreView(item.before);
    historyVersion.value++;
    error.value = "";
    message.value = `已撤销：${item.label}`;
    selectedIndex.value = Math.min(cursor.value, lastSyllable());
  }
  function redo() {
    clearPreview();
    const item = history.redo();
    if (!item) return;
    pause();
    audition.cancel();
    recordingArmed.value = false;
    project.value = restoreView(item.after);
    selectedIndex.value = Math.min(selectedIndex.value, lastSyllable());
    historyVersion.value++;
    error.value = "";
    message.value = `已重做：${item.label}`;
  }
  function backspace() {
    const entry = history.past.at(-1);
    const point = entry?.point;
    if (
      !point ||
      entry.after.stage !== project.value.stage ||
      !lines.value.some((line) => line.id === point.lineId) ||
      (project.value.stage === 3 && point.lineId !== line.value?.id)
    ) {
      message.value = "暂无可回退的打点；其他编辑可以使用撤销。";
      return;
    }
    undo();
    view({ activeLineId: point.lineId });
    seek(point.timeMs - 1000);
    mode.value = "paused";
    recordingArmed.value = true;
    retimeOne = project.value.stage === 2 && line.value?.startMs !== null;
    selectedIndex.value = Math.min(point.index, lastSyllable());
    message.value = "已退回刚才的单位。Enter 继续播放，再按 Enter 重新记录。";
  }
  /** Index of the last syllable in the current line, for clamping the selection. */
  function lastSyllable() {
    return Math.max(0, (line.value ? syllablesOf(line.value).length : 1) - 1);
  }
  function prepareUnits() {
    if (line.value && !line.value.units.length && line.value.text.trim())
      command("切分当前句", (draft) => {
        const target = activeLines(draft)[lineIndex.value];
        target.units = tokenize(target.text);
      });
  }
  function selectLine(id: string) {
    editingText.value = false;
    recordingArmed.value = false;
    audition.cancel();
    retimeOne = false;
    clearPreview();
    pause();
    view({ activeLineId: id });
    mode.value = "idle";
    if (project.value.stage === 3) prepareUnits();
    selectedIndex.value = Math.min(cursor.value, lastSyllable());
    const index = lineIndex.value;
    const prior =
      lines.value
        .slice(0, index)
        .reverse()
        .find((l) => l.startMs !== null)?.startMs ?? 0;
    seek((line.value?.startMs ?? prior) - 1000);
  }
  function applyStage(stage: number) {
    pause();
    audition.cancel();
    clearPreview();
    recordingArmed.value = false;
    editingText.value = false;
    retimeOne = false;
    message.value = "";
    view({ stage, unlockedStage: lineCount(project.value) ? 3 : 0 });
    mode.value = "idle";
    if (stage === 3) {
      prepareUnits();
      selectedIndex.value = Math.min(selectedIndex.value, lastSyllable());
    }
  }
  /**
   * Complete line ends before word timing. A strict call is used by the guided
   * transition and reports the first blocker; the tab switch only completes
   * what it can and still lets the user inspect the view.
   */
  function prepareWordTiming(strict: boolean): boolean {
    const duration = project.value.audio?.durationMs ?? Infinity;
    const probe = copyProject(project.value);
    const result = completeLineEnds(probe, duration);
    if (result.blocked.length) {
      if (!strict) return true;
      const blocker = result.blocked[0];
      const index = lines.value.findIndex((line) => line.id === blocker.lineId);
      if (index >= 0) selectLine(lines.value[index].id);
      error.value = `第 ${index + 1} 句${blocker.message}，请先在逐行打轴补全。`;
      return false;
    }
    if (!result.changed) return true;
    return command("补全句末时间", (draft) => {
      completeLineEnds(draft, duration);
    });
  }
  function enterWordTiming(): boolean {
    if (!lineCount(project.value)) return false;
    if (!asset.value) {
      error.value = "请先选择音频，再进入逐字打轴。";
      return false;
    }
    if (lineIssues.value.length) {
      selectLine(lineIssues.value[0].lineId);
      error.value = lineIssues.value[0].message;
      return false;
    }
    prepareUnits();
    if (!prepareWordTiming(true)) return false;
    view({ unlockedStage: 3 });
    applyStage(3);
    if (line.value && cursor.value < syllablesOf(line.value).length)
      selectedIndex.value = cursor.value;
    return true;
  }
  function goStage(stage: number) {
    if (
      ![0, 1, 2, 3].includes(stage) ||
      (stage > 0 && !lineCount(project.value))
    )
      return;
    if (stage === 3) {
      prepareUnits();
      prepareWordTiming(false);
    }
    applyStage(stage);
  }
  function confirmText() {
    if (!lines.value.length || lines.value.some((l) => !l.text.trim())) {
      error.value = "请删除空行并保留至少一句歌词。";
      return;
    }
    if (!asset.value) {
      error.value = "请先选择音频，再开始逐行打轴。";
      return;
    }
    view({ unlockedStage: Math.max(2, project.value.unlockedStage) });
    applyStage(2);
  }
  function confirmLines() {
    if (lineIssues.value.length) {
      selectLine(lineIssues.value[0].lineId);
      error.value = lineIssues.value[0].message;
      return;
    }
    if (!asset.value) {
      error.value = "请先选择音频。";
      return;
    }
    enterWordTiming();
  }
  function seek(ms: number) {
    pause();
    transport.seek(ms);
    sync();
    if (asset.value) view({ playheadMs: Math.round(positionMs.value) });
  }
  function clipEnd() {
    return Math.min(
      lines.value[lineIndex.value + 1]?.startMs ?? Infinity,
      asset.value?.info.durationMs ?? 0,
    );
  }
  /** Stage-2 line-start recording. Word timing has its own session below. */
  async function startRecording() {
    if (project.value.stage !== 2 || editingText.value) return;
    sync();
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return;
    }
    if (line.value.startMs !== null && !retimeOne) {
      message.value = "句首已有时间，选择重打本句以修改。";
      return;
    }
    recordingArmed.value = true;
    audition.cancel();
    message.value = "";
    mode.value = "starting";
    try {
      await transport.play(positionMs.value, asset.value.info.durationMs);
      if (mode.value === "starting")
        mode.value = transport.playing ? "recording" : "paused";
      sync();
    } catch (value) {
      mode.value = "paused";
      showError(value);
    }
  }
  async function playWordSession(from: number): Promise<boolean> {
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return false;
    }
    const end = recordingEnd();
    if (!(end > from)) {
      error.value = "本句没有可播放的区间，请先补全句首和收尾。";
      return false;
    }
    transport.seek(from);
    sync();
    recordingArmed.value = true;
    audition.cancel();
    message.value = "";
    error.value = "";
    mode.value = "starting";
    try {
      await transport.play(from, end);
      if (mode.value === "starting")
        mode.value = transport.playing ? "recording" : "paused";
      sync();
      return true;
    } catch (value) {
      mode.value = "paused";
      showError(value);
      return false;
    }
  }
  /** Start or continue the current line's word-timing session. */
  async function startWordTiming(): Promise<boolean> {
    if (project.value.stage !== 3) return false;
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return false;
    }
    if (line.value.startMs === null) {
      error.value = "本句还没有句首，请先在逐行打轴记录。";
      return false;
    }
    if (isComplete.value) {
      message.value = "本行已完成。点「重打本句」会清空逐字时间并保留句首。";
      return false;
    }
    if (lineIssues.value.length) {
      error.value = lineIssues.value[0].message;
      return false;
    }
    prepareUnits();
    if (wordTimingAction.value === "continue") return continueWordTiming();
    selectedIndex.value = 0;
    return playWordSession(Math.max(0, line.value.startMs - 1000));
  }
  async function continueWordTiming(): Promise<boolean> {
    const current = line.value;
    if (!asset.value || !current) {
      error.value = "请先选择音频。";
      return false;
    }
    if (current.startMs === null) {
      error.value = "本句还没有句首，请先在逐行打轴记录。";
      return false;
    }
    const end = recordingEnd();
    const points = syllablesOf(current)
      .flatMap((syllable) => [syllable.startMs, syllable.endMs])
      .filter((time): time is number => time !== null);
    const last = points.length ? Math.max(...points) : null;
    const from =
      positionMs.value >= current.startMs && positionMs.value < end
        ? positionMs.value
        : Math.max(0, (last ?? current.startMs) - 1000);
    return playWordSession(from);
  }
  /** Clear every word point and the measured end, keep the line onset, then replay. */
  async function restartWordTiming(): Promise<boolean> {
    if (project.value.stage !== 3 || !line.value || !asset.value) {
      error.value = "请先选择音频。";
      return false;
    }
    const index = lineIndex.value;
    pause();
    audition.cancel();
    const success = command("重打本句", (draft) => {
      const target = activeLines(draft)[index];
      syllablesOf(target).forEach((syllable) => {
        syllable.startMs = null;
        syllable.endMs = null;
      });
      target.endMs = null;
      target.endInferred = undefined;
    });
    if (!success) return false;
    selectedIndex.value = 0;
    return playWordSession(
      Math.max(0, (line.value?.startMs ?? positionMs.value) - 1000),
    );
  }
  function recordPoint(ms: number) {
    const current = line.value;
    if (!current) return;
    const index = lineIndex.value;
    if (project.value.stage === 2) {
      if (
        !command(
          "记录句首",
          (draft) => setLineStartBoundary(draft, index, ms),
          {
            lineId: current.id,
            index: 0,
            timeMs: ms,
          },
        )
      )
        return;
      const next =
        lines.value.slice(index + 1).find((l) => l.startMs === null) ??
        lines.value.find((l) => l.startMs === null);
      if (!retimeOne && next) view({ activeLineId: next.id });
      else {
        pause();
        recordingArmed.value = false;
        retimeOne = false;
        mode.value = "idle";
        message.value = "";
      }
    } else {
      const at = cursor.value;
      const syllables = syllablesOf(current);
      if (
        !command(
          at < syllables.length ? "记录单位起点" : "记录收尾",
          (draft) => {
            if (at < syllables.length) setSyllableStart(draft, index, at, ms);
            else setLineEnd(draft, index, ms);
          },
          { lineId: current.id, index: at, timeMs: ms },
        )
      ) {
        pause();
        return;
      }
      selectedIndex.value = Math.min(cursor.value, syllables.length - 1);
      if (
        isComplete.value ||
        (at < syllables.length &&
          syllables[at + 1]?.startMs !== null &&
          syllables[at + 1]?.startMs !== undefined)
      ) {
        pause();
        mode.value = "idle";
        recordingArmed.value = false;
        message.value = isComplete.value
          ? "本行完成。Ctrl / Cmd + Enter 进入下一句。"
          : "";
      }
    }
  }
  async function enter(eventTime = performance.now()) {
    if (mode.value === "starting") return;
    if (project.value.stage < 2) return;
    if (mode.value === "recording" && transport.playing) {
      const ms = transport.captureMs(eventTime);
      if (ms === null) {
        message.value = "等待音频开始播放，再记录起点。";
        return;
      }
      const correction = Number(compensation.value);
      if (!Number.isFinite(correction) || Math.abs(correction) > 1000) {
        error.value = "录点补偿需在 -1000–1000ms 之间。";
        pause();
        return;
      }
      recordPoint(ms - Math.round(correction));
    } else if (mode.value === "ended") {
      message.value = "范围结束，定位后补打。";
    } else if (project.value.stage === 3) {
      await startWordTiming();
    } else await startRecording();
  }
  function stopRecording() {
    pause();
    recordingArmed.value = false;
  }
  function retimeLine() {
    if (!line.value) return;
    pause();
    recordingArmed.value = false;
    retimeOne = true;
    seek((line.value.startMs ?? positionMs.value) - 1000);
    mode.value = "idle";
  }
  function recordingEnd() {
    const nextKnown =
      line.value &&
      syllablesOf(line.value)
        .slice(cursor.value + 1)
        .find((syllable) => syllable.startMs !== null)?.startMs;
    return Math.min(
      clipEnd(),
      nextKnown ?? Infinity,
      line.value?.endMs ?? Infinity,
    );
  }
  function auditionBounds(
    scope: AuditionScope,
    target: AuditionTarget,
    committed = false,
  ): [number, number] {
    const duration = asset.value?.info.durationMs ?? 0;
    if (scope === "song") return [0, duration];
    const index = lines.value.findIndex((line) => line.id === target.lineId);
    const data = activeLines(committed ? project.value : displayProject.value);
    const current = data[index];
    if (!current) throw new Error("请选择歌词行。");
    const limit = Math.min(data[index + 1]?.startMs ?? duration, duration);
    if (scope === "line")
      return [
        Math.max(0, (current.startMs ?? positionMs.value) - 800),
        Math.min(duration, (current.endMs ?? limit) + 300),
      ];
    const syllable = syllablesOf(current).find(
      (syllable) => syllable.id === target.syllableId,
    );
    if (!syllable || syllable.startMs === null)
      throw new Error("先记录选中项起点。");
    if (scope === "boundary")
      return [
        Math.max(0, syllable.startMs - 400),
        Math.min(duration, syllable.startMs + 600),
      ];
    const interval = tokenIntervals(current, limit).find(
      (interval) => interval.id === syllable.id,
    );
    if (interval?.kind !== "confirmed" || interval.endMs === null)
      throw new Error("选中范围未确认，请试听边界。");
    return [
      Math.max(0, interval.startMs - 200),
      Math.min(duration, interval.endMs + 200),
    ];
  }
  async function review(scope: AuditionScope = "line") {
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return;
    }
    pause();
    recordingArmed.value = false;
    message.value = "";
    await audition.start(scope, {
      lineId: line.value.id,
      syllableId: syllablesOf(line.value)[selectedIndex.value]?.id ?? null,
    });
  }
  async function togglePlayback() {
    if (editingText.value) return;
    if (transport.playing || mode.value === "starting") {
      pause();
      return;
    }
    if (!asset.value) return;
    recordingArmed.value = false;
    await audition.start(
      "song",
      { lineId: line.value?.id ?? "", syllableId: null },
      positionMs.value,
    );
  }
  function setRate(value: number) {
    pause();
    transport.setRate(value);
    rate.value = value;
    sync();
  }
  function setVolume(value: number) {
    const next = Math.round(value * 100) / 100;
    transport.setVolume(next);
    volume.value = next;
  }
  function nextLine() {
    if (!isComplete.value) {
      message.value = "先记录本句剩余起点和收尾；也可以在列表选择另一句。";
      return;
    }
    const next = lines.value[lineIndex.value + 1];
    if (next) selectLine(next.id);
    else {
      pause();
      message.value = "已到最后一行，可以检查并导出。";
    }
  }
  function clearLineTiming() {
    const current = line.value;
    if (!current) return false;
    const index = lineIndex.value;
    if (
      current.startMs === null &&
      current.endMs === null &&
      !hasTiming(current)
    )
      return true;
    pause();
    audition.cancel();
    recordingArmed.value = false;
    retimeOne = false;
    const success = command("清除本行时标", (draft) => {
      const target = activeLines(draft)[index];
      target.startMs = null;
      target.endMs = null;
      target.endInferred = undefined;
      syllablesOf(target).forEach((syllable) => {
        syllable.startMs = null;
        syllable.endMs = null;
      });
    });
    if (success) {
      selectedIndex.value = 0;
      mode.value = "idle";
      message.value = "已清除本行时标，可用撤销恢复。";
    }
    return success;
  }
  /** Remembered per part for this session, so switching back returns to the same line. */
  const partLines = new Map<string, string>();
  function switchPart(id: string) {
    const target = project.value.parts.find((part) => part.id === id);
    if (!target || id === project.value.activePartId) return;
    pause();
    audition.cancel();
    clearPreview();
    recordingArmed.value = false;
    editingText.value = false;
    retimeOne = false;
    if (project.value.activeLineId)
      partLines.set(project.value.activePartId, project.value.activeLineId);
    const remembered = partLines.get(id);
    // Otherwise the line sung at the playhead: parts are usually aligned by ear.
    const atPlayhead = target.lines
      .filter((l) => l.startMs !== null && l.startMs <= positionMs.value)
      .at(-1);
    const lineId =
      (remembered && target.lines.some((l) => l.id === remembered)
        ? remembered
        : atPlayhead?.id) ??
      target.lines[0]?.id ??
      null;
    view({ activePartId: id, activeLineId: lineId });
    mode.value = "idle";
    message.value = "";
    error.value = "";
    if (project.value.stage === 3) prepareUnits();
    selectedIndex.value = Math.min(cursor.value, lastSyllable());
  }
  /** Progress per part: line starts while timing lines, finished lines otherwise. */
  const partStats = computed(() =>
    project.value.parts.map((part) => {
      const duration = project.value.audio?.durationMs ?? Infinity;
      const wrong = new Set(
        validateLines(part.lines, duration).map((issue) => issue.lineId),
      );
      return {
        id: part.id,
        name: part.name,
        color: part.color,
        total: part.lines.length,
        done:
          project.value.stage === 2
            ? part.lines.filter((line) => line.startMs !== null).length
            : part.lines.filter((line) => !wrong.has(line.id)).length,
      };
    }),
  );
  function exportLrc() {
    try {
      downloadText(exportLyrics(project.value), `${project.value.name}.lrc`);
      const losses = lrcLosses(project.value);
      message.value = losses.length
        ? `增强 LRC 已导出，只含主声部「${mainPart(project.value).name}」。LRC 不支持，未导出：${losses.join("、")}。`
        : "增强 LRC 已导出。";
    } catch (value) {
      const main = mainPart(project.value);
      const first = validateLines(
        main.lines,
        project.value.audio?.durationMs ?? Infinity,
      )[0];
      if (first) {
        switchPart(main.id);
        selectLine(first.lineId);
      }
      showError(value);
    }
  }
  /** Every part is exported, so a problem in any part is shown where it is. */
  function revealIssue() {
    const duration = project.value.audio?.durationMs ?? Infinity;
    for (const part of project.value.parts) {
      const first = validateLines(part.lines, duration)[0];
      if (!first) continue;
      switchPart(part.id);
      selectLine(first.lineId);
      return;
    }
  }
  function exportTtml(options: { foldRuby: boolean }) {
    try {
      const { text, notices } = ttmlText(project.value, options);
      downloadText(
        text,
        `${project.value.name}.ttml`,
        "application/ttml+xml;charset=utf-8",
      );
      const count = project.value.parts.filter((p) => p.lines.length).length;
      message.value = [`TTML 已导出，包含 ${count} 个声部。`, ...notices].join(
        " ",
      );
      return true;
    } catch (value) {
      revealIssue();
      showError(value);
      return false;
    }
  }
  async function exportAss(
    options: Pick<
      AssOptions,
      "width" | "height" | "fill" | "leadInMs" | "introHintMs"
    >,
  ) {
    const style = assStyleOf(project.value);
    try {
      const metrics = await fontMetrics(style.font);
      const { text, notices } = assText(project.value, {
        ...options,
        style,
        measure: metrics.measure,
        emRatio: metrics.emRatio,
      });
      // A byte order mark keeps players from guessing the encoding.
      downloadText(
        "\ufeff" + text,
        `${project.value.name}.ass`,
        "text/x-ssa;charset=utf-8",
      );
      message.value = [
        "ASS 已导出：成品字幕与卡拉 OK 源在同一个文件。",
        metrics.available
          ? ""
          : `本机没有字体「${style.font}」，注音位置按替代字体计算，可能错位。`,
        ...notices,
      ]
        .filter(Boolean)
        .join(" ");
      return true;
    } catch (value) {
      revealIssue();
      showError(value);
      return false;
    }
  }
  function backup() {
    const snapshot = copyProject(project.value);
    snapshot.playheadMs = Math.round(positionMs.value);
    downloadText(
      JSON.stringify(snapshot, null, 2),
      `${project.value.name}.mako.json`,
      "application/json",
    );
  }
  transport.onEnded = () => {
    sync();
    if (mode.value === "review" && audition.handleEnd()) return;
    mode.value = mode.value === "recording" ? "ended" : "idle";
  };

  return reactive({
    project,
    asset,
    displayProject,
    part,
    assStyle,
    lines,
    lineTotal,
    displayLines,
    displayLine,
    selectedSyllable,
    displaySyllable,
    auditionScope: audition.scope,
    auditionRange: audition.range,
    auditionTarget: audition.target,
    loopAudition: audition.loop,
    previewOwner,
    previewCommand,
    commitPreview,
    clearPreview,
    loading,
    restoring,
    error,
    message,
    saveState,
    mode,
    recordingArmed,
    editingText,
    textLayer,
    cancelAudition: audition.cancel,
    lastRecorded,
    stopRecording,
    retimeLine,
    positionMs,
    playing,
    rate,
    volume,
    compensation,
    selectedIndex,
    lineIndex,
    line,
    cursor,
    isComplete,
    lineIssues,
    issues,
    conflicts,
    finishedCount,
    canUndo,
    canRedo,
    initialize,
    flushSave,
    sync,
    pause,
    showError,
    command,
    view,
    setAssStyle,
    loadAudio,
    importText,
    resetProject,
    restoreBackup,
    undo,
    redo,
    backspace,
    selectLine,
    goStage,
    enterWordTiming,
    confirmText,
    confirmLines,
    seek,
    enter,
    review,
    togglePlayback,
    setRate,
    setVolume,
    nextLine,
    wordTimingAction,
    startWordTiming,
    continueWordTiming,
    restartWordTiming,
    clearLineTiming,
    exportLrc,
    exportTtml,
    exportAss,
    backup,
    switchPart,
    partStats,
  });
}

export const editor = createEditor();
