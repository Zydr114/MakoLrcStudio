import { newLine, type ProjectDraft } from "./model";
import { graphemes } from "./tokenize";

export function editLine(
  project: ProjectDraft,
  id: string,
  text: string,
): void {
  const line = project.lines.find((l) => l.id === id)!;
  if (line.text === text) return;
  line.text = text;
  line.units = [];
  line.endMs = null;
}

export function splitLine(
  project: ProjectDraft,
  id: string,
  offset: number,
): void {
  const index = project.lines.findIndex((l) => l.id === id);
  const line = project.lines[index];
  if (offset <= 0 || offset >= line.text.length)
    throw new Error("把光标放在句子中间再拆分。");
  let boundary = 0;
  if (
    !graphemes(line.text).some((part) => (boundary += part.length) === offset)
  )
    throw new Error("请选择完整字符之间的位置，组合字符不能拆开。");
  const second = newLine(line.text.slice(offset));
  editLine(project, id, line.text.slice(0, offset));
  project.lines.splice(index + 1, 0, second);
}

export function mergeLines(project: ProjectDraft, id: string): void {
  const index = project.lines.findIndex((l) => l.id === id);
  if (index < 0 || index >= project.lines.length - 1)
    throw new Error("这已经是最后一行。");
  const first = project.lines[index];
  const second = project.lines[index + 1];
  const separator =
    /[\p{Script=Latin}\p{Number}]$/u.test(first.text) &&
    /^[\p{Script=Latin}\p{Number}]/u.test(second.text)
      ? " "
      : "";
  editLine(project, id, first.text + separator + second.text);
  project.lines.splice(index + 1, 1);
}

function assertRange(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`时间需在 ${min}–${max}ms 之间，请检查相邻边界。`);
}

export function unitBounds(
  project: ProjectDraft,
  lineIndex: number,
  unitIndex: number,
): [number, number] {
  const line = project.lines[lineIndex];
  const previousLine = project.lines[lineIndex - 1];
  let lower =
    unitIndex === 0
      ? Math.max(0, previousLine?.endMs ?? (previousLine?.startMs ?? -1) + 1)
      : (line.startMs ?? 0);
  for (let i = 0; i < unitIndex; i++)
    if (line.units[i].startMs !== null)
      lower = Math.max(lower, line.units[i].startMs! + 1);
  let upper =
    Math.min(
      project.audio?.durationMs ?? Infinity,
      project.lines[lineIndex + 1]?.startMs ?? Infinity,
    ) - 1;
  if (line.endMs !== null) upper = Math.min(upper, line.endMs - 1);
  for (let i = unitIndex + 1; i < line.units.length; i++)
    if (line.units[i].startMs !== null)
      upper = Math.min(upper, line.units[i].startMs! - 1);
  return [lower, upper];
}

export function setUnitStart(
  project: ProjectDraft,
  lineIndex: number,
  unitIndex: number,
  ms: number,
): void {
  const [min, max] = unitBounds(project, lineIndex, unitIndex);
  assertRange(ms, min, max);
  const line = project.lines[lineIndex];
  line.units[unitIndex].startMs = ms;
  if (unitIndex === 0) line.startMs = ms;
}

export function setLineEnd(
  project: ProjectDraft,
  index: number,
  ms: number,
): void {
  const line = project.lines[index];
  const lower =
    Math.max(line.startMs ?? 0, ...line.units.map((u) => u.startMs ?? -1)) + 1;
  const upper = Math.min(
    project.audio?.durationMs ?? Infinity,
    project.lines[index + 1]?.startMs ?? Infinity,
  );
  assertRange(ms, lower, upper);
  line.endMs = ms;
}

export function lineStartBounds(
  project: ProjectDraft,
  index: number,
): [number, number] {
  const line = project.lines[index];
  const previous = project.lines[index - 1];
  const min = Math.max(0, previous?.endMs ?? (previous?.startMs ?? -1) + 1);
  const limit = Math.min(
    project.audio?.durationMs ?? Infinity,
    project.lines[index + 1]?.startMs ?? Infinity,
  );
  let max = limit - 1;
  const known = line.units
    .map((unit) => unit.startMs)
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
  const line = project.lines[index];
  const [min, max] = lineStartBounds(project, index);
  const delta = ms - (line.startMs ?? ms);
  assertRange(ms, min, max);
  line.startMs = ms;
  for (const unit of line.units)
    if (unit.startMs !== null) unit.startMs += delta;
  if (line.endMs !== null) line.endMs += delta;
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
  for (const line of [...project.lines]) {
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
      project.lines = project.lines.filter((l) => l.id !== line.id);
    else editLine(project, line.id, text);
  }
}

export function shiftAll(project: ProjectDraft, delta: number): void {
  const values = project.lines
    .flatMap((l) => [l.startMs, l.endMs, ...l.units.map((u) => u.startMs)])
    .filter((v): v is number => v !== null);
  if (
    values.some(
      (v) =>
        v + delta < 0 || v + delta > (project.audio?.durationMs ?? Infinity),
    )
  )
    throw new Error("整体平移会超出音频范围。");
  for (const line of project.lines) {
    if (line.startMs !== null) line.startMs += delta;
    if (line.endMs !== null) line.endMs += delta;
    for (const unit of line.units)
      if (unit.startMs !== null) unit.startMs += delta;
  }
}
