import {
  activeLines,
  activePart,
  newId,
  newLine,
  newPart,
  partColors,
  syllablesOf,
  type LyricLine,
  type PartKind,
  type ProjectDraft,
  type VocalPart,
} from "./model";

export const partKindLabels: Record<PartKind, string> = {
  person: "演唱者",
  group: "合唱",
  other: "其他",
};

function findPart(project: ProjectDraft, id: string): VocalPart {
  const part = project.parts.find((item) => item.id === id);
  if (!part) throw new Error("找不到这个声部。");
  return part;
}

function checkName(project: ProjectDraft, name: string, self?: string) {
  const value = name.trim();
  if (!value) throw new Error("声部名称不能为空。");
  if (project.parts.some((part) => part.id !== self && part.name === value))
    throw new Error(`已有名为「${value}」的声部。`);
  return value;
}

export function nextPartName(project: ProjectDraft): string {
  for (let n = project.parts.length + 1; ; n++)
    if (!project.parts.some((part) => part.name === `声部 ${n}`))
      return `声部 ${n}`;
}

export interface PartOptions {
  name: string;
  kind: PartKind;
  background: boolean;
  /** Start from the current part's text; timing is never copied, each part is timed on its own. */
  copyText: boolean;
}
export function addPart(
  project: ProjectDraft,
  options: PartOptions,
): VocalPart {
  const used = new Set(project.parts.map((part) => part.color));
  const color =
    partColors.find((item) => !used.has(item)) ??
    partColors[project.parts.length % partColors.length];
  const part = newPart(
    checkName(project, options.name),
    options.copyText
      ? activeLines(project).map((line) => newLine(line.text))
      : [],
    color,
  );
  part.kind = options.kind;
  part.background = options.background;
  project.parts.push(part);
  return part;
}

export function updatePart(
  project: ProjectDraft,
  id: string,
  patch: Partial<Pick<VocalPart, "name" | "kind" | "background" | "color">>,
): void {
  const part = findPart(project, id);
  if (patch.name !== undefined) part.name = checkName(project, patch.name, id);
  if (patch.kind !== undefined) part.kind = patch.kind;
  if (patch.background !== undefined) part.background = patch.background;
  if (patch.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(patch.color))
      throw new Error("颜色需为 #RRGGBB。");
    part.color = patch.color;
  }
}

export function removePart(project: ProjectDraft, id: string): void {
  findPart(project, id);
  if (project.parts.length === 1) throw new Error("至少保留一个声部。");
  project.parts = project.parts.filter((part) => part.id !== id);
  if (project.mainPartId === id) project.mainPartId = project.parts[0].id;
  if (project.activePartId === id) {
    project.activePartId = project.mainPartId;
    project.activeLineId = activeLines(project)[0]?.id ?? null;
  }
}

export function movePart(project: ProjectDraft, id: string, delta: number) {
  const index = project.parts.findIndex((part) => part.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= project.parts.length) return;
  const [part] = project.parts.splice(index, 1);
  project.parts.splice(target, 0, part);
}

/** A copy has its own identity: ids are never shared between parts. */
function cloneLine(line: LyricLine): LyricLine {
  const copy = structuredClone(line);
  copy.id = newId();
  for (const unit of copy.units) unit.id = newId();
  for (const syllable of syllablesOf(copy)) syllable.id = newId();
  return copy;
}

/**
 * Lines keep their timing when they change parts. Timed lines merge into the
 * target by start; otherwise they go after the target's lines in their own order.
 */
export function transferLines(
  project: ProjectDraft,
  ids: readonly string[],
  targetId: string,
  copy: boolean,
): { appended: boolean } {
  const source = activePart(project),
    target = findPart(project, targetId);
  if (target.id === source.id) throw new Error("请选择另一个声部。");
  const picked = source.lines.filter((line) => ids.includes(line.id));
  if (!picked.length) throw new Error("请先选择歌词行。");
  const moved = copy ? picked.map(cloneLine) : picked;
  const timed = [...target.lines, ...moved].every(
    (line) => line.startMs !== null,
  );
  target.lines = timed
    ? [...target.lines, ...moved].sort((a, b) => a.startMs! - b.startMs!)
    : [...target.lines, ...moved];
  if (!copy) {
    const index = source.lines.findIndex((line) => ids.includes(line.id));
    source.lines = source.lines.filter((line) => !ids.includes(line.id));
    if (ids.includes(project.activeLineId ?? ""))
      project.activeLineId =
        source.lines[Math.min(index, source.lines.length - 1)]?.id ?? null;
  }
  return { appended: !timed };
}

/** What the LRC compatibility export leaves out, for the export notice. */
export function lrcLosses(project: ProjectDraft): string[] {
  const losses: string[] = [];
  const others = project.parts.length - 1;
  if (others) losses.push(`其他 ${others} 个声部`);
  const main =
    project.parts.find((part) => part.id === project.mainPartId) ??
    project.parts[0];
  const units = main.lines.flatMap((line) => line.units);
  if (units.some((unit) => unit.ruby)) losses.push("注音");
  if (main.lines.some((line) => line.translation.trim())) losses.push("翻译");
  if (
    main.lines.some((line) => line.roman.trim()) ||
    units.some((unit) => unit.roman?.trim())
  )
    losses.push("罗马音");
  if (
    main.lines.some((line) =>
      syllablesOf(line).some((syllable) => syllable.endMs !== null),
    )
  )
    losses.push("音节停顿");
  return losses;
}
