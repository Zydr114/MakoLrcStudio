import {
  activeLines,
  activePart,
  newLine,
  newUnit,
  retextUnit,
  syllablesOf,
  unitStart,
  type ProjectDraft,
  type TimingUnit,
} from "./model";
import { graphemes, tokenize } from "./tokenize";

export function editLine(
  project: ProjectDraft,
  id: string,
  text: string,
): void {
  const line = activeLines(project).find((l) => l.id === id)!;
  if (line.text === text) return;
  // Readings and word romanization are typed by hand: keep them where the text did not change.
  const kept = line.units.some((unit) => unit.ruby || unit.roman)
    ? retainUnits(line.units, line.text, text)
    : [];
  line.text = text;
  line.units = kept;
  line.endMs = null;
  line.endInferred = undefined;
}

/**
 * Units in the unchanged head and tail of the text survive an edit, with every
 * time cleared; the changed middle is split again from scratch.
 */
function retainUnits(
  units: TimingUnit[],
  before: string,
  after: string,
): TimingUnit[] {
  let head = 0;
  while (
    head < before.length &&
    head < after.length &&
    before[head] === after[head]
  )
    head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail++;
  const prefix: TimingUnit[] = [],
    suffix: TimingUnit[] = [];
  let position = 0,
    prefixEnd = 0,
    suffixStart = before.length;
  for (const unit of units) {
    const end = position + unit.text.length;
    if (end <= head) {
      prefix.push(unit);
      prefixEnd = end;
    } else if (position >= before.length - tail) {
      if (!suffix.length) suffixStart = position;
      suffix.push(unit);
    }
    position = end;
  }
  const middle = after.slice(
    prefixEnd,
    after.length - (before.length - suffixStart),
  );
  const result = [...prefix, ...tokenize(middle), ...suffix].map((unit) => ({
    ...unit,
    syllables: unit.syllables.map((syllable) => ({
      ...syllable,
      startMs: null,
      endMs: null,
    })),
  }));
  return result.map((unit) => unit.text).join("") === after
    ? result
    : tokenize(after);
}

export function splitLine(
  project: ProjectDraft,
  id: string,
  offset: number,
): void {
  const lines = activeLines(project);
  const index = lines.findIndex((l) => l.id === id);
  const line = lines[index];
  if (offset <= 0 || offset >= line.text.length)
    throw new Error("把光标放在句子中间再拆分。");
  let boundary = 0;
  if (
    !graphemes(line.text).some((part) => (boundary += part.length) === offset)
  )
    throw new Error("请选择完整字符之间的位置，组合字符不能拆开。");
  const firstText = line.text.slice(0, offset),
    secondText = line.text.slice(offset);
  if (!firstText.trim() || !secondText.trim())
    throw new Error("拆句后两行都需要歌词正文。");
  const second = newLine(secondText);
  second.endMs = line.endMs;
  second.endInferred = line.endInferred;
  let boundaryMs: number | null = null;
  if (line.units.length) {
    if (line.units.map((unit) => unit.text).join("") !== line.text)
      throw new Error("切分文本与歌词正文不一致，请先修改正文。");
    let position = 0,
      prefix = "";
    const left: TimingUnit[] = [],
      right: TimingUnit[] = [];
    for (const unit of line.units) {
      const end = position + unit.text.length;
      if (end <= offset) left.push(unit);
      else if (position >= offset) {
        right.push(prefix ? retextUnit(unit, prefix + unit.text) : unit);
        prefix = "";
      } else {
        // A cut inside a unit cannot divide its reading: both halves become plain.
        const before = unit.text.slice(0, offset - position),
          after = unit.text.slice(offset - position);
        if (before.trim())
          left.push({ ...newUnit(before, unitStart(unit)), id: unit.id });
        else {
          const previous = left.pop()!;
          left.push(retextUnit(previous, previous.text + before));
        }
        if (after.trim())
          right.push(before.trim() ? newUnit(after) : retextUnit(unit, after));
        else prefix = after; // Leading whitespace belongs to the next measured word.
      }
      position = end;
    }
    second.units = right;
    second.startMs = boundaryMs = right[0] ? unitStart(right[0]) : null;
    // A pause before the cut is where the first half really ends.
    const last = left.at(-1)?.syllables.at(-1);
    if (last?.endMs != null) {
      boundaryMs = last.endMs;
      last.endMs = null;
    }
    line.units = left;
  }
  line.text = firstText;
  line.endMs = boundaryMs;
  line.endInferred = undefined;
  lines.splice(index + 1, 0, second);
}

export function mergeLines(project: ProjectDraft, id: string): void {
  const lines = activeLines(project);
  const index = lines.findIndex((l) => l.id === id);
  if (index < 0 || index >= lines.length - 1)
    throw new Error("这已经是最后一行。");
  const first = lines[index];
  const second = lines[index + 1];
  const separator =
    /[\p{Script=Latin}\p{Number}]$/u.test(first.text) &&
    /^[\p{Script=Latin}\p{Number}]/u.test(second.text)
      ? " "
      : "";
  editLine(project, id, first.text + separator + second.text);
  lines.splice(index + 1, 1);
  if (project.activeLineId === second.id) project.activeLineId = first.id;
}

function assertRange(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`时间需在 ${min}–${max}ms 之间，请检查相邻边界。`);
}

/** Bounds of one syllable start; index runs over the whole line's syllables. */
export function syllableBounds(
  project: ProjectDraft,
  lineIndex: number,
  index: number,
): [number, number] {
  const lines = activeLines(project);
  const line = lines[lineIndex];
  const syllables = syllablesOf(line);
  const previousLine = lines[lineIndex - 1];
  let lower =
    index === 0
      ? Math.max(0, previousLine?.endMs ?? (previousLine?.startMs ?? -1) + 1)
      : (line.startMs ?? 0);
  for (let i = 0; i < index; i++) {
    const { startMs, endMs } = syllables[i];
    if (startMs !== null) lower = Math.max(lower, startMs + 1);
    if (endMs !== null) lower = Math.max(lower, endMs);
  }
  let upper =
    Math.min(
      project.audio?.durationMs ?? Infinity,
      lines[lineIndex + 1]?.startMs ?? Infinity,
    ) - 1;
  if (line.endMs !== null) upper = Math.min(upper, line.endMs - 1);
  for (let i = index; i < syllables.length; i++) {
    const { startMs, endMs } = syllables[i];
    if (i > index && startMs !== null) upper = Math.min(upper, startMs - 1);
    if (endMs !== null) upper = Math.min(upper, endMs - 1);
  }
  return [lower, upper];
}

export function setSyllableStart(
  project: ProjectDraft,
  lineIndex: number,
  index: number,
  ms: number,
): void {
  const [min, max] = syllableBounds(project, lineIndex, index);
  assertRange(ms, min, max);
  const line = activeLines(project)[lineIndex];
  syllablesOf(line)[index].startMs = ms;
  if (index === 0) line.startMs = ms;
}

/** Bounds of an explicit syllable end (a pause before the next syllable). */
export function syllableEndBounds(
  project: ProjectDraft,
  lineIndex: number,
  index: number,
): [number, number] {
  const lines = activeLines(project);
  const line = lines[lineIndex];
  const syllables = syllablesOf(line);
  const own = syllables[index];
  if (!own || index === syllables.length - 1)
    throw new Error("最后一个音节的终点就是本句收尾。");
  if (own.startMs === null) throw new Error("先记录这个音节的起点。");
  const later = syllables
    .slice(index + 1)
    .map((syllable) => syllable.startMs)
    .find((time) => time !== null);
  const upper =
    later ??
    line.endMs ??
    Math.min(
      project.audio?.durationMs ?? Infinity,
      lines[lineIndex + 1]?.startMs ?? Infinity,
    );
  return [own.startMs + 1, upper];
}

/** A null end joins the syllable to the next one again. */
export function setSyllableEnd(
  project: ProjectDraft,
  lineIndex: number,
  index: number,
  ms: number | null,
): void {
  const [min, max] = syllableEndBounds(project, lineIndex, index);
  if (ms !== null) assertRange(ms, min, max);
  syllablesOf(activeLines(project)[lineIndex])[index].endMs = ms;
}

export function lineEndBounds(
  project: ProjectDraft,
  index: number,
): [number, number] {
  const lines = activeLines(project);
  const line = lines[index];
  const times = syllablesOf(line).flatMap(({ startMs, endMs }) => [
    startMs ?? -1,
    (endMs ?? 0) - 1,
  ]);
  return [
    Math.max(line.startMs ?? 0, ...times) + 1,
    Math.min(
      project.audio?.durationMs ?? Infinity,
      lines[index + 1]?.startMs ?? Infinity,
    ),
  ];
}

export function setLineEnd(
  project: ProjectDraft,
  index: number,
  ms: number,
): void {
  const [lower, upper] = lineEndBounds(project, index);
  assertRange(ms, lower, upper);
  const line = activeLines(project)[index];
  line.endMs = ms;
  line.endInferred = undefined;
}

export function lineStartBounds(
  project: ProjectDraft,
  index: number,
): [number, number] {
  const lines = activeLines(project);
  const line = lines[index];
  const previous = lines[index - 1];
  const min = Math.max(0, previous?.endMs ?? (previous?.startMs ?? -1) + 1);
  const limit = Math.min(
    project.audio?.durationMs ?? Infinity,
    lines[index + 1]?.startMs ?? Infinity,
  );
  let max = limit - 1;
  const known = syllablesOf(line)
    .flatMap((syllable) => [syllable.startMs, syllable.endMs])
    .filter((time): time is number => time !== null);
  if (line.startMs !== null) {
    if (line.endMs !== null)
      max = Math.min(max, limit - (line.endMs - line.startMs));
    for (const time of known)
      max = Math.min(max, limit - 1 - (time - line.startMs));
  } else if (known.length) max = Math.min(max, Math.min(...known) - 1);
  return [min, max];
}

export function setLineStart(
  project: ProjectDraft,
  index: number,
  ms: number,
): void {
  const line = activeLines(project)[index];
  const [min, max] = lineStartBounds(project, index);
  const delta = ms - (line.startMs ?? ms);
  assertRange(ms, min, max);
  line.startMs = ms;
  for (const syllable of syllablesOf(line)) {
    if (syllable.startMs !== null) syllable.startMs += delta;
    if (syllable.endMs !== null) syllable.endMs += delta;
  }
  if (line.endMs !== null) line.endMs += delta;
}

/**
 * Move only the line start, keeping later syllables and the end where they are.
 * The first syllable shares this boundary, so it follows when it already has a time.
 */
export function setLineStartBoundary(
  project: ProjectDraft,
  index: number,
  ms: number,
): void {
  const line = activeLines(project)[index];
  const [min, max] = syllableBounds(project, index, 0);
  assertRange(ms, min, max);
  line.startMs = ms;
  const first = syllablesOf(line)[0];
  if (first && first.startMs !== null) first.startMs = ms;
}

export interface CleanOptions {
  trim: boolean;
  blanks: boolean;
  brackets: boolean;
  find: string;
  replacement: string;
}
export function cleanProject(
  project: ProjectDraft,
  options: CleanOptions,
): void {
  const part = activePart(project);
  for (const line of [...part.lines]) {
    let text = line.text;
    if (options.find) text = text.split(options.find).join(options.replacement);
    if (options.brackets) {
      let before: string;
      do {
        before = text;
        text = text.replace(
          /\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】/g,
          "",
        );
      } while (text !== before);
    }
    if (options.trim) text = text.trim();
    if (options.blanks && !text.trim())
      part.lines = part.lines.filter((l) => l.id !== line.id);
    else editLine(project, line.id, text);
  }
}

/** The whole song moves against the audio, so every part moves together. */
export function shiftAll(project: ProjectDraft, delta: number): void {
  const lines = project.parts.flatMap((part) => part.lines);
  const values = lines
    .flatMap((l) => [
      l.startMs,
      l.endMs,
      ...syllablesOf(l).flatMap((s) => [s.startMs, s.endMs]),
    ])
    .filter((v): v is number => v !== null);
  if (
    values.some(
      (v) =>
        v + delta < 0 || v + delta > (project.audio?.durationMs ?? Infinity),
    )
  )
    throw new Error("整体平移会超出音频范围。");
  for (const line of lines) {
    if (line.startMs !== null) line.startMs += delta;
    if (line.endMs !== null) line.endMs += delta;
    for (const syllable of syllablesOf(line)) {
      if (syllable.startMs !== null) syllable.startMs += delta;
      if (syllable.endMs !== null) syllable.endMs += delta;
    }
  }
}
