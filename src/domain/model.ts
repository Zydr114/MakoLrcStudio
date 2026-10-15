import type { AudioInfo } from "../audio/transport";

/** The timing atom. A null end continues to the next syllable start, or to the line end. */
export interface Syllable {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
}
/** A display unit: a character, a word or one ruby group. */
export interface TimingUnit {
  id: string;
  /** Base text, including attached punctuation and spaces. */
  text: string;
  /** With ruby the syllable texts joined are the reading; without it one syllable repeats the text. */
  ruby: boolean;
  /** Automatic ruby that nobody has confirmed yet. */
  autoRuby?: boolean;
  roman?: string;
  syllables: Syllable[];
}
export interface LyricLine {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  units: TimingUnit[];
  translation: string;
  roman: string;
  /** Generated romanization (line and units) that nobody has confirmed yet. */
  romanAuto?: boolean;
  songPart?: string;
}
export type PartKind = "person" | "group" | "other";
/** A vocal part has its own timeline; parts may overlap each other but not themselves. */
export interface VocalPart {
  id: string;
  name: string;
  kind: PartKind;
  background: boolean;
  color: string;
  lines: LyricLine[];
}
export interface ProjectDraft {
  version: 2;
  name: string;
  metadata: Record<string, string>;
  audio: AudioInfo | null;
  parts: VocalPart[];
  /** The part exported to LRC. */
  mainPartId: string;
  /** View state like activeLineId: switching parts is not an edit. */
  activePartId: string;
  stage: number;
  unlockedStage: number;
  activeLineId: string | null;
  playheadMs: number;
  translationLang: string;
  romanLang: string;
}
export interface Issue {
  kind: "missing" | "conflict";
  lineId: string;
  syllableId?: string;
  message: string;
}
export const partKinds: PartKind[] = ["person", "group", "other"];
export const partColors = [
  "#0b84d8",
  "#d6457f",
  "#2f9c5a",
  "#c98400",
  "#7a5ad8",
  "#00999b",
];
export const newId = (): string => crypto.randomUUID();
export const newSyllable = (
  text: string,
  startMs: number | null = null,
): Syllable => ({ id: newId(), text, startMs, endMs: null });
export const newUnit = (
  text: string,
  startMs: number | null = null,
): TimingUnit => ({
  id: newId(),
  text,
  ruby: false,
  syllables: [newSyllable(text, startMs)],
});
export const newLine = (
  text: string,
  startMs: number | null = null,
): LyricLine => ({
  id: newId(),
  text,
  startMs,
  endMs: null,
  units: [],
  translation: "",
  roman: "",
});
export const newPart = (
  name: string,
  lines: LyricLine[] = [],
  color = partColors[0],
): VocalPart => ({
  id: newId(),
  name,
  kind: "person",
  background: false,
  color,
  lines,
});
export function newProject(lines: LyricLine[] = []): ProjectDraft {
  const main = newPart("主唱", lines);
  return {
    version: 2,
    name: "未命名歌词",
    metadata: {},
    audio: null,
    parts: [main],
    mainPartId: main.id,
    activePartId: main.id,
    stage: 0,
    unlockedStage: 0,
    activeLineId: null,
    playheadMs: 0,
    translationLang: "",
    romanLang: "",
  };
}
export const copyProject = (project: ProjectDraft): ProjectDraft =>
  JSON.parse(JSON.stringify(project)) as ProjectDraft;
export const activePart = (project: ProjectDraft): VocalPart =>
  project.parts.find((part) => part.id === project.activePartId) ??
  project.parts[0];
export const activeLines = (project: ProjectDraft): LyricLine[] =>
  activePart(project).lines;
export const mainPart = (project: ProjectDraft): VocalPart =>
  project.parts.find((part) => part.id === project.mainPartId) ??
  project.parts[0];
export const lineCount = (project: ProjectDraft): number =>
  project.parts.reduce((count, part) => count + part.lines.length, 0);

export interface SyllableRef {
  syllable: Syllable;
  unit: TimingUnit;
  unitIndex: number;
  /** Position in the line's whole syllable sequence, the order of Enter. */
  index: number;
}
export function syllableRefs(line: LyricLine): SyllableRef[] {
  const refs: SyllableRef[] = [];
  line.units.forEach((unit, unitIndex) =>
    unit.syllables.forEach((syllable) =>
      refs.push({ syllable, unit, unitIndex, index: refs.length }),
    ),
  );
  return refs;
}
export const syllablesOf = (line: LyricLine): Syllable[] =>
  line.units.flatMap((unit) => unit.syllables);
export const unitStart = (unit: TimingUnit): number | null =>
  unit.syllables[0]?.startMs ?? null;
/** How a syllable is named in messages: a ruby reading keeps its base, as in 詮・せ. */
export const syllableLabel = (unit: TimingUnit, syllable: Syllable): string =>
  unit.ruby ? `${unit.text.trim()}・${syllable.text}` : unit.text.trim();
export const hasTiming = (line: LyricLine): boolean =>
  syllablesOf(line).some(
    (syllable) => syllable.startMs !== null || syllable.endMs !== null,
  );
/** A plain unit's only syllable repeats its text; ruby keeps the reading. */
export function retextUnit(unit: TimingUnit, text: string): TimingUnit {
  if (unit.ruby) return { ...unit, text };
  return { ...unit, text, syllables: [{ ...unit.syllables[0], text }] };
}
export const completeLine = (line: LyricLine): boolean =>
  line.units.length > 0 &&
  syllablesOf(line).every((syllable) => syllable.startMs !== null) &&
  line.endMs !== null;

export function formatTime(ms: number | null): string {
  if (ms === null) return "—";
  const value = Math.abs(Math.round(ms));
  return `${ms < 0 ? "-" : ""}${String(Math.floor(value / 60000)).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}

export function parseTime(input: string): number | null {
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  const value =
    Number(match[1]) * 60000 +
    Number(match[2]) * 1000 +
    Number((match[3] || "").padEnd(3, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** Rules inside one part. Different parts never constrain each other. */
export function validateLines(
  lines: LyricLine[],
  duration = Infinity,
  full = true,
): Issue[] {
  const issues: Issue[] = [];
  let previousStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const add = (
      message: string,
      syllableId?: string,
      kind: Issue["kind"] = "conflict",
    ) => issues.push({ lineId: line.id, syllableId, message, kind });
    if (!line.text.trim()) add("空行需要删除或填写歌词");
    if (/[\r\n]/.test(line.text))
      add("行内有换行，请先在整理阶段拆成独立歌词行");
    if (line.startMs === null) add("尚未记录句首", undefined, "missing");
    else {
      if (line.startMs < 0 || line.startMs >= duration) add("句首超出音频范围");
      if (line.startMs <= previousStart)
        add("句首需要晚于上一句；请检查同时间的翻译行或重复行");
      previousStart = line.startMs;
    }
    const nextStart = lines[i + 1]?.startMs ?? duration;
    if (
      line.endMs !== null &&
      (line.endMs > nextStart ||
        line.endMs > duration ||
        line.endMs <= (line.startMs ?? -1))
    )
      add("收尾需要晚于句首，且不超过下一句起点");
    if (!full) continue;
    if (!line.units.length) add("尚未切分和制作逐字时间", undefined, "missing");
    const refs = syllableRefs(line);
    const first = refs[0]?.syllable;
    if (
      first?.startMs != null &&
      line.startMs !== null &&
      first.startMs !== line.startMs
    )
      add("首个单位起点需与句首一致", first.id);
    let previous = (line.startMs ?? 0) - 1;
    for (const { syllable, unit, index } of refs) {
      const label = syllableLabel(unit, syllable);
      if (syllable.startMs === null)
        add(`「${label}」尚未记录起点`, syllable.id, "missing");
      else {
        if (
          syllable.startMs <= previous ||
          syllable.startMs < (line.startMs ?? 0) ||
          syllable.startMs >= nextStart ||
          syllable.startMs >= duration
        )
          add(`「${label}」起点与相邻边界冲突`, syllable.id);
        previous = syllable.startMs;
      }
      if (syllable.endMs !== null) {
        const next = refs[index + 1]?.syllable.startMs;
        if (
          index === refs.length - 1 ||
          syllable.endMs <= (syllable.startMs ?? Infinity) ||
          (next != null && syllable.endMs > next)
        )
          add(`「${label}」终点与相邻边界冲突`, syllable.id);
        else previous = Math.max(previous, syllable.endMs - 1);
      }
    }
    if (line.endMs === null) add("尚未记录收尾", undefined, "missing");
    else if (line.endMs <= previous) add("收尾需要晚于最后一个单位起点");
    if (
      line.units.length &&
      line.units.map((u) => u.text).join("") !== line.text
    )
      add("切分文本与歌词正文不一致");
  }
  return issues;
}

/** Validates the part being edited. */
export const validate = (project: ProjectDraft, full = true): Issue[] =>
  validateLines(
    activeLines(project),
    project.audio?.durationMs ?? Infinity,
    full,
  );
