import {
  copyProject,
  newId,
  partColors,
  partKinds,
  type LyricLine,
  type ProjectDraft,
} from "./model";

interface V1Line {
  id: string;
  text: string;
  startMs: number | null;
  endMs: number | null;
  units: { id: string; text: string; startMs: number | null }[];
}
type V1Project = Omit<
  ProjectDraft,
  | "version"
  | "parts"
  | "mainPartId"
  | "activePartId"
  | "translationLang"
  | "romanLang"
> & { version: 1; lines: V1Line[] };

const fail = (): never => {
  throw new Error("备份内容不完整或版本不受支持。");
};
const validTime = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isSafeInteger(v));
const isText = (v: unknown): v is string => typeof v === "string";

/** v1 had one timeline of start-only units: it becomes the main part, one syllable per unit. */
function migrate(value: V1Project): ProjectDraft {
  if (!Array.isArray(value.lines)) fail();
  for (const line of value.lines)
    if (!line || !Array.isArray(line.units) || line.units.some((u) => !u))
      fail();
  const partId = newId();
  const { lines, version, ...rest } = value;
  return {
    ...rest,
    version: 2,
    parts: [
      {
        id: partId,
        name: "主唱",
        kind: "person",
        background: false,
        color: partColors[0],
        lines: lines.map((line): LyricLine => ({
          id: line.id,
          text: line.text,
          startMs: line.startMs,
          endMs: line.endMs,
          units: line.units.map((unit) => ({
            id: unit.id,
            text: unit.text,
            ruby: false,
            syllables: [
              {
                id: newId(),
                text: unit.text,
                startMs: unit.startMs,
                endMs: null,
              },
            ],
          })),
          translation: "",
          roman: "",
        })),
      },
    ],
    mainPartId: partId,
    activePartId: partId,
    translationLang: "",
    romanLang: "",
  };
}

function checkLine(line: LyricLine, unique: (id: unknown) => void) {
  if (
    !line ||
    !isText(line.text) ||
    !validTime(line.startMs) ||
    !validTime(line.endMs) ||
    !Array.isArray(line.units) ||
    !isText(line.translation) ||
    !isText(line.roman) ||
    (line.romanAuto !== undefined && typeof line.romanAuto !== "boolean") ||
    (line.songPart !== undefined && !isText(line.songPart))
  )
    fail();
  unique(line.id);
  for (const unit of line.units) {
    if (
      !unit ||
      !isText(unit.text) ||
      typeof unit.ruby !== "boolean" ||
      (unit.autoRuby !== undefined && typeof unit.autoRuby !== "boolean") ||
      (unit.roman !== undefined && !isText(unit.roman)) ||
      !Array.isArray(unit.syllables) ||
      !unit.syllables.length
    )
      fail();
    unique(unit.id);
    for (const syllable of unit.syllables) {
      if (
        !syllable ||
        !isText(syllable.text) ||
        !validTime(syllable.startMs) ||
        !validTime(syllable.endMs)
      )
        fail();
      unique(syllable.id);
    }
    if (
      !unit.ruby &&
      (unit.syllables.length !== 1 || unit.syllables[0].text !== unit.text)
    )
      fail();
  }
  if (line.units.length && line.units.map((u) => u.text).join("") !== line.text)
    fail();
}

export function readBackup(text: string): ProjectDraft {
  let parsed: ProjectDraft | V1Project;
  try {
    parsed = JSON.parse(text) as ProjectDraft | V1Project;
  } catch {
    throw new Error("备份不是有效的 JSON 文件。");
  }
  if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) fail();
  const value = parsed.version === 1 ? migrate(parsed) : parsed;
  if (
    typeof value.name !== "string" ||
    !Array.isArray(value.parts) ||
    !value.parts.length ||
    !Number.isInteger(value.stage) ||
    value.stage < 0 ||
    value.stage > 3
  )
    fail();
  if (
    !Number.isInteger(value.unlockedStage) ||
    value.unlockedStage < value.stage ||
    value.unlockedStage > 3
  )
    fail();
  if (
    !value.metadata ||
    typeof value.metadata !== "object" ||
    Array.isArray(value.metadata) ||
    Object.entries(value.metadata).some(
      ([k, v]) => !/^[a-zA-Z][\w-]*$/.test(k) || typeof v !== "string",
    )
  )
    fail();
  if (!isText(value.translationLang) || !isText(value.romanLang)) fail();
  const ids = new Set<string>();
  const unique = (id: unknown) => {
    if (typeof id !== "string" || !id || ids.has(id)) fail();
    ids.add(id as string);
  };
  for (const part of value.parts) {
    if (
      !part ||
      !isText(part.name) ||
      !partKinds.includes(part.kind) ||
      typeof part.background !== "boolean" ||
      !/^#[0-9a-f]{6}$/i.test(part.color) ||
      !Array.isArray(part.lines)
    )
      fail();
    unique(part.id);
    for (const line of part.lines) checkLine(line, unique);
  }
  const partIds = value.parts.map((part) => part.id);
  if (
    !partIds.includes(value.mainPartId) ||
    !partIds.includes(value.activePartId)
  )
    fail();
  const active = value.parts.find((part) => part.id === value.activePartId)!;
  if (
    value.activeLineId !== null &&
    !active.lines.some((l) => l.id === value.activeLineId)
  )
    fail();
  if (
    value.audio !== null &&
    (!value.audio ||
      typeof value.audio.name !== "string" ||
      !Number.isSafeInteger(value.audio.size) ||
      value.audio.size < 0 ||
      !/^[a-f0-9]{64}$/.test(value.audio.hash) ||
      !Number.isSafeInteger(value.audio.durationMs) ||
      value.audio.durationMs <= 0)
  )
    fail();
  value.playheadMs ??= 0;
  if (
    !Number.isSafeInteger(value.playheadMs) ||
    value.playheadMs < 0 ||
    value.playheadMs > (value.audio?.durationMs ?? 0)
  )
    fail();
  return copyProject(value);
}

export function downloadText(
  text: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
