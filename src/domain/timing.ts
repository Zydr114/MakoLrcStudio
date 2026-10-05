import { validate, type LyricLine, type ProjectDraft } from "./model";

export type IntervalKind = "confirmed" | "reference" | "unknown" | "conflict";
export interface TimingInterval {
  id: string;
  lineIndex: number;
  unitIndex: number | null;
  text: string;
  startMs: number;
  endMs: number | null;
  kind: IntervalKind;
}

/** Only an immediate successor can close an interval. Null is never an estimate. */
export function tokenIntervals(
  line: LyricLine,
  limitMs = Infinity,
): TimingInterval[] {
  let previous = -1;
  return line.units.flatMap((unit, index) => {
    if (unit.startMs === null) return [];
    const start = unit.startMs;
    const end =
      index === line.units.length - 1
        ? line.endMs
        : line.units[index + 1].startMs;
    const conflict =
      (index === 0 && line.startMs !== null && start !== line.startMs) ||
      start < (line.startMs ?? 0) ||
      start <= previous ||
      start >= limitMs ||
      (line.endMs !== null && start >= line.endMs) ||
      (end !== null && (end <= start || end > limitMs));
    previous = start;
    return [
      {
        id: unit.id,
        lineIndex: 0,
        unitIndex: index,
        text: unit.text,
        startMs: start,
        endMs: end,
        kind: conflict ? "conflict" : end === null ? "unknown" : "confirmed",
      },
    ];
  });
}

export function lineIntervals(project: ProjectDraft): TimingInterval[] {
  const duration = project.audio?.durationMs ?? Infinity;
  const conflicts = new Set(
    validate(project, false)
      .filter((issue) => issue.kind === "conflict")
      .map((issue) => issue.lineId),
  );
  return project.lines.flatMap((line, index) => {
    if (line.startMs === null) return [];
    const reference =
      index === project.lines.length - 1
        ? duration
        : project.lines[index + 1].startMs;
    const end = line.endMs ?? reference;
    return [
      {
        id: line.id,
        lineIndex: index,
        unitIndex: null,
        text: line.text,
        startMs: line.startMs,
        endMs: end !== null && Number.isFinite(end) ? end : null,
        kind: conflicts.has(line.id)
          ? "conflict"
          : line.endMs !== null
            ? "confirmed"
            : end === null || !Number.isFinite(end)
              ? "unknown"
              : "reference",
      },
    ];
  });
}

export interface TimingSample {
  unitId: string | null;
  unitIndex: number | null;
  progress: number | null;
  status: "before" | "active" | "gap" | "unknown" | "conflict";
}

export function sampleLineTiming(
  line: LyricLine,
  sourceMs: number,
  limitMs = Infinity,
): TimingSample {
  const empty = (status: TimingSample["status"]): TimingSample => ({
    unitId: null,
    unitIndex: null,
    progress: null,
    status,
  });
  if (line.startMs === null) return empty("unknown");
  if (sourceMs < line.startMs) return empty("before");
  if (line.endMs !== null && sourceMs >= line.endMs) return empty("gap");
  const intervals = tokenIntervals(line, limitMs);
  // A broken line cannot be made to look correctly synchronized by picking one of its overlaps.
  if (intervals.some((interval) => interval.kind === "conflict"))
    return empty("conflict");
  const active = intervals.find(
    (interval) =>
      interval.kind === "confirmed" &&
      sourceMs >= interval.startMs &&
      sourceMs < interval.endMs!,
  );
  if (!active) return empty("unknown");
  return {
    unitId: active.id,
    unitIndex: active.unitIndex,
    progress: (sourceMs - active.startMs) / (active.endMs! - active.startMs),
    status: "active",
  };
}

export function playingLineIndex(
  project: ProjectDraft,
  sourceMs: number,
): number {
  return (
    lineIntervals(project).find(
      (interval) =>
        interval.kind !== "conflict" &&
        sourceMs >= interval.startMs &&
        interval.endMs !== null &&
        sourceMs < interval.endMs,
    )?.lineIndex ?? -1
  );
}
