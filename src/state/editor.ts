import { computed, markRaw, reactive, ref, shallowRef, watch } from "vue";
import { AudioTransport, type AudioAsset } from "../audio/transport";
import {
  newProject,
  copyProject,
  completeLine,
  validate,
  type ProjectDraft,
} from "../domain/model";
import { ProjectHistory, type PointChange } from "../domain/history";
import { importLyrics, exportLyrics } from "../domain/lrc";
import { readBackup, downloadText } from "../domain/backup";
import { setLineStart, setLineEnd, setUnitStart } from "../domain/edit";
import { tokenize } from "../domain/tokenize";
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
  const loading = ref(false),
    restoring = ref(true);
  const error = ref(""),
    message = ref(""),
    saveState = ref("尚无草稿");
  const mode = ref<SessionMode>("idle");
  const positionMs = ref(0),
    playing = ref(false),
    rate = ref(1),
    volume = ref(0.8);
  const compensation = ref(0),
    selectedUnit = ref(0),
    selectionEnd = ref(0);
  const history = markRaw(new ProjectHistory());
  const historyVersion = ref(0);
  let saveGeneration = 0;
  let initialized = !persist;
  let retimeOne = false;
  const lineIndex = computed(() =>
    Math.max(
      0,
      project.value.lines.findIndex((l) => l.id === project.value.activeLineId),
    ),
  );
  const line = computed(() => project.value.lines[lineIndex.value] ?? null);
  const cursor = computed(() => {
    const current = line.value;
    if (!current) return 0;
    const missing = current.units.findIndex((u) => u.startMs === null);
    return missing < 0 ? current.units.length : missing;
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
  const finishedCount = computed(
    () =>
      project.value.lines.filter(
        (line) => completeLine(line) && validLine(line.id),
      ).length,
  );
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
      if (JSON.stringify(next) === JSON.stringify(project.value)) return true;
      history.push(project.value, next, label, point);
      historyVersion.value++;
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
          message.value = "已恢复本机草稿，请重新选择原音频继续。";
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
      message.value = "音频已准备好。";
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
  function importText(text: string, name = "未命名歌词") {
    pause();
    if (!text.trim()) {
      error.value = "请先输入或导入歌词。";
      return false;
    }
    const imported = importLyrics(text);
    const success = command("导入歌词", (draft) => {
      draft.lines = imported.lines;
      draft.metadata = imported.metadata;
      draft.name =
        imported.metadata.ti || name.replace(/\.(lrc|elrc|txt)$/i, "");
      draft.activeLineId = imported.lines[0]?.id ?? null;
      draft.stage = 0;
      draft.unlockedStage = 1;
    });
    message.value =
      imported.notices.join(" ") ||
      `已导入 ${imported.lines.length} 行，下一步整理歌词。`;
    return success;
  }
  function resetProject() {
    pause();
    transport.reset();
    asset.value = null;
    history.clear();
    historyVersion.value++;
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
      transport.reset();
      asset.value = null;
      project.value = draft;
      history.clear();
      historyVersion.value++;
      selectedUnit.value = 0;
      selectionEnd.value = 0;
      message.value = "编辑进度已恢复，请选择原音频。";
      error.value = "";
      sync();
    } catch (value) {
      showError(value);
    }
  }
  function undo() {
    const item = history.undo();
    if (!item) return;
    pause();
    const restored = copyProject(item.before);
    restored.stage = project.value.stage;
    restored.unlockedStage = Math.min(
      restored.unlockedStage,
      project.value.unlockedStage,
    );
    if (restored.stage > restored.unlockedStage)
      restored.stage = restored.unlockedStage;
    restored.activeLineId = restored.lines.some(
      (l) => l.id === project.value.activeLineId,
    )
      ? project.value.activeLineId
      : (restored.lines[0]?.id ?? null);
    project.value = restored;
    historyVersion.value++;
    error.value = "";
    message.value = `已撤销：${item.label}`;
    selectedUnit.value = Math.min(
      cursor.value,
      Math.max(0, (line.value?.units.length ?? 1) - 1),
    );
    selectionEnd.value = selectedUnit.value;
  }
  function redo() {
    const item = history.redo();
    if (!item) return;
    pause();
    project.value = copyProject(item.after);
    historyVersion.value++;
    error.value = "";
    message.value = `已重做：${item.label}`;
  }
  function backspace() {
    const point = history.past.at(-1)?.point;
    if (
      !point ||
      (project.value.stage === 3 && point.lineId !== line.value?.id)
    ) {
      message.value = "暂无可回退的打点；其他编辑可以使用撤销。";
      return;
    }
    undo();
    view({ activeLineId: point.lineId });
    seek(point.timeMs - 1000);
    mode.value = "paused";
    selectedUnit.value = Math.min(
      point.index,
      Math.max(0, (line.value?.units.length ?? 1) - 1),
    );
    selectionEnd.value = selectedUnit.value;
    message.value = "已退回刚才的单位。Enter 继续播放，再按 Enter 重新记录。";
  }
  function prepareUnits() {
    if (line.value && !line.value.units.length && line.value.text.trim())
      command("切分当前句", (draft) => {
        draft.lines[lineIndex.value].units = tokenize(
          draft.lines[lineIndex.value].text,
        );
      });
  }
  function selectLine(id: string) {
    pause();
    view({ activeLineId: id });
    mode.value = "idle";
    if (project.value.stage === 3) prepareUnits();
    selectedUnit.value = Math.min(
      cursor.value,
      Math.max(0, (line.value?.units.length ?? 1) - 1),
    );
    selectionEnd.value = selectedUnit.value;
    const index = lineIndex.value;
    const prior =
      project.value.lines
        .slice(0, index)
        .reverse()
        .find((l) => l.startMs !== null)?.startMs ?? 0;
    seek((line.value?.startMs ?? prior) - 1000);
  }
  function goStage(stage: number) {
    if (stage > project.value.unlockedStage) return;
    pause();
    message.value = "";
    view({ stage });
    mode.value = "idle";
    if (stage === 2)
      selectLine(
        (
          project.value.lines.find((l) => l.startMs === null) ??
          project.value.lines[0]
        )?.id ?? "",
      );
    if (stage === 3) {
      prepareUnits();
      selectLine(line.value?.id ?? "");
    }
  }
  function confirmText() {
    if (
      !project.value.lines.length ||
      project.value.lines.some((l) => !l.text.trim())
    ) {
      error.value = "请删除空行并保留至少一句歌词。";
      return;
    }
    if (!asset.value) {
      error.value = "请先选择音频，再开始逐行打轴。";
      return;
    }
    view({ unlockedStage: Math.max(2, project.value.unlockedStage) });
    goStage(2);
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
    view({ unlockedStage: 3 });
    goStage(3);
  }
  function seek(ms: number) {
    pause();
    transport.seek(ms);
    sync();
    if (asset.value) view({ playheadMs: Math.round(positionMs.value) });
  }
  function clipEnd() {
    return Math.min(
      project.value.lines[lineIndex.value + 1]?.startMs ?? Infinity,
      asset.value?.info.durationMs ?? 0,
    );
  }
  async function startRecording() {
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return;
    }
    if (project.value.stage === 3 && isComplete.value) {
      message.value = "本行已完成。R 试听，Ctrl / Cmd + Enter 下一句。";
      return;
    }
    if (project.value.stage === 3 && completeLine(line.value)) {
      error.value = "本行有时间冲突，请调整时标或从选中单位重打。";
      return;
    }
    retimeOne = project.value.stage === 2 && line.value.startMs !== null;
    message.value = "";
    mode.value = "starting";
    try {
      await transport.play(
        positionMs.value,
        project.value.stage === 3 ? clipEnd() : asset.value.info.durationMs,
      );
      if (mode.value === "starting")
        mode.value = transport.playing ? "recording" : "paused";
      sync();
    } catch (value) {
      mode.value = "paused";
      showError(value);
    }
  }
  function recordPoint(ms: number) {
    const current = line.value;
    if (!current) return;
    const index = lineIndex.value;
    if (project.value.stage === 2) {
      if (
        !command("记录句首", (draft) => setLineStart(draft, index, ms), {
          lineId: current.id,
          index: 0,
          timeMs: ms,
        })
      )
        return;
      const next =
        project.value.lines.slice(index + 1).find((l) => l.startMs === null) ??
        project.value.lines.find((l) => l.startMs === null);
      if (!retimeOne && next) view({ activeLineId: next.id });
      else {
        pause();
        mode.value = "idle";
        message.value = "句首已记录。检查时间后进入逐字打轴。";
      }
    } else {
      const unit = cursor.value;
      if (
        !command(
          unit < current.units.length ? "记录单位起点" : "记录收尾",
          (draft) => {
            if (unit < current.units.length)
              setUnitStart(draft, index, unit, ms);
            else setLineEnd(draft, index, ms);
          },
          { lineId: current.id, index: unit, timeMs: ms },
        )
      ) {
        pause();
        return;
      }
      selectedUnit.value = Math.min(cursor.value, current.units.length - 1);
      selectionEnd.value = selectedUnit.value;
      if (isComplete.value) {
        pause();
        mode.value = "idle";
        message.value = "本行完成。先试听，再进入下一句。";
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
      if (
        project.value.stage === 3 &&
        cursor.value === line.value?.units.length &&
        !isComplete.value
      )
        recordPoint(positionMs.value);
      else {
        message.value = "已到播放边界。请回退补打，或调整下一句的起点。";
        mode.value = "paused";
      }
    } else await startRecording();
  }
  async function review() {
    if (!asset.value || !line.value) {
      error.value = "请先选择音频。";
      return;
    }
    pause();
    mode.value = "review";
    try {
      await transport.play(
        Math.max(0, (line.value.startMs ?? 0) - 1000),
        Math.min(
          (line.value.endMs ?? clipEnd()) + 300,
          asset.value.info.durationMs,
        ),
      );
      sync();
    } catch (value) {
      mode.value = "idle";
      showError(value);
    }
  }
  async function togglePlayback() {
    if (transport.playing || mode.value === "starting") {
      pause();
      return;
    }
    if (project.value.stage >= 2 && !isComplete.value) await startRecording();
    else if (line.value && project.value.stage >= 2) await review();
    else if (asset.value) {
      mode.value = "review";
      await transport.play(positionMs.value);
      sync();
    }
  }
  function setRate(value: number) {
    pause();
    transport.setRate(value);
    rate.value = value;
    sync();
  }
  function setVolume(value: number) {
    transport.setVolume(value);
    volume.value = value;
  }
  function nextLine() {
    if (!isComplete.value) {
      message.value = "先记录本句剩余起点和收尾；也可以在列表选择另一句。";
      return;
    }
    const next = project.value.lines[lineIndex.value + 1];
    if (next) selectLine(next.id);
    else {
      pause();
      message.value = "已到最后一行，可以检查并导出。";
    }
  }
  function retime(index = 0) {
    if (!line.value) return;
    pause();
    command("从选中单位重打", (draft) => {
      const target = draft.lines[lineIndex.value];
      target.units.slice(index).forEach((u) => (u.startMs = null));
      target.endMs = null;
    });
    selectedUnit.value = index;
    selectionEnd.value = index;
    mode.value = "idle";
    seek(
      (index > 0
        ? line.value.units[index - 1].startMs
        : (line.value.startMs ?? 0))! - 1000,
    );
  }
  function exportLrc() {
    try {
      downloadText(exportLyrics(project.value), `${project.value.name}.lrc`);
      message.value = "增强 LRC 已导出。";
    } catch (value) {
      const first = issues.value[0];
      if (first) selectLine(first.lineId);
      showError(value);
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
    mode.value = mode.value === "recording" ? "ended" : "idle";
  };

  return reactive({
    project,
    asset,
    loading,
    restoring,
    error,
    message,
    saveState,
    mode,
    positionMs,
    playing,
    rate,
    volume,
    compensation,
    selectedUnit,
    selectionEnd,
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
    loadAudio,
    importText,
    resetProject,
    restoreBackup,
    undo,
    redo,
    backspace,
    selectLine,
    goStage,
    confirmText,
    confirmLines,
    seek,
    enter,
    review,
    togglePlayback,
    setRate,
    setVolume,
    nextLine,
    retime,
    exportLrc,
    backup,
  });
}

export const editor = createEditor();
