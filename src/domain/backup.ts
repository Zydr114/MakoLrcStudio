import { copyProject, type ProjectDraft } from "./model";

export function readBackup(text: string): ProjectDraft {
  let value: ProjectDraft;
  try {
    value = JSON.parse(text) as ProjectDraft;
  } catch {
    throw new Error("备份不是有效的 JSON 文件。");
  }
  const validTime = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isSafeInteger(v));
  const fail = () => {
    throw new Error("备份内容不完整或版本不受支持。");
  };
  if (
    !value ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !Array.isArray(value.lines) ||
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
  const ids = new Set<string>();
  const unique = (id: unknown) => {
    if (typeof id !== "string" || !id || ids.has(id)) fail();
    ids.add(id as string);
  };
  for (const line of value.lines) {
    if (
      !line ||
      typeof line.text !== "string" ||
      !validTime(line.startMs) ||
      !validTime(line.endMs) ||
      !Array.isArray(line.units)
    )
      fail();
    unique(line.id);
    for (const unit of line.units) {
      if (!unit || typeof unit.text !== "string" || !validTime(unit.startMs))
        fail();
      unique(unit.id);
    }
    if (
      line.units.length &&
      line.units.map((u) => u.text).join("") !== line.text
    )
      fail();
  }
  if (
    value.activeLineId !== null &&
    !value.lines.some((l) => l.id === value.activeLineId)
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
