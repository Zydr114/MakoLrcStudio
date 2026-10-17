import {
  activeLines,
  syllableRefs,
  validate,
  type LyricLine,
  type ProjectDraft,
} from "./model";

export type IntervalKind = "confirmed" | "reference" | "unknown" | "conflict";
export interface TimingInterval {
  /** Syllable id for word timing, line id for line timing. */
  id: string;
  lineIndex: number;
  unitIndex: number | null;
  /** Position in the line's syllable sequence. */
  index: number | null;
  text: string;
  startMs: number;
  endMs: number | null;
  kind: IntervalKind;
}

/** Only an immediate successor or an explicit end closes an interval. Null is never an estimate. */
export function tokenIntervals(
  line: LyricLine,
  limitMs = Infinity,
): TimingInterval[] {
  let previous = -1;
  const refs = syllableRefs(line);
  return refs.flatMap(({ syllable, unit, unitIndex, index }) => {
    if (syllable.startMs === null) return [];
    const start = syllable.startMs;
    const last = index === refs.length - 1;
    const next = last ? line.endMs : refs[index + 1].syllable.startMs;
    const end = syllable.endMs ?? next;
    const conflict =
      (index === 0 && line.startMs !== null && start !== line.startMs) ||
      start < (line.startMs ?? 0) ||
      start <= previous ||
      start >= limitMs ||
      (line.endMs !== null && start >= line.endMs) ||
      (end !== null && (end <= start || end > limitMs)) ||
      (syllable.endMs !== null && (last || (next !== null && end! > next)));
    previous = Math.max(start, (syllable.endMs ?? 0) - 1);
    return [
      {
        id: syllable.id,
        lineIndex: 0,
        unitIndex,
        index,
        text: unit.ruby ? syllable.text : unit.text,
        startMs: start,
        endMs: end,
        kind: conflict ? "conflict" : end === null ? "unknown" : "confirmed",
      },
    ];
  });
}

export function lineIntervals(project: ProjectDraft): TimingInterval[] {
  const duration = project.audio?.durationMs ?? Infinity;
  const lines = activeLines(project);
  const conflicts = new Set(
    validate(project, false)
      .filter((issue) => issue.kind === "conflict")
      .map((issue) => issue.lineId),
  );
  return lines.flatMap((line, index) => {
    if (line.startMs === null) return [];
    const reference =
      index === lines.length - 1 ? duration : lines[index + 1].startMs;
    const end = line.endMs ?? reference;
    return [
      {
        id: line.id,
        lineIndex: index,
        unitIndex: null,
        index: null,
        text: line.text,
        startMs: line.startMs,
        endMs: end !== null && Number.isFinite(end) ? end : null,
        kind: conflicts.has(line.id)
          ? "conflict"
          : line.endInferred
            ? "reference"
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
  syllableId: string | null;
  /** Position in the line's syllable sequence. */
  index: number | null;
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
    syllableId: null,
    index: null,
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
  if (!active) {
    // Inside the line but after an explicit syllable end: a real pause.
    const paused = intervals.some(
      (interval) =>
        interval.kind === "confirmed" &&
        interval.endMs! <= sourceMs &&
        intervals.some(
          (next) =>
            next.index === interval.index! + 1 && next.startMs > sourceMs,
        ),
    );
    return empty(paused ? "gap" : "unknown");
  }
  return {
    syllableId: active.id,
    index: active.index,
    unitId: line.units[active.unitIndex!].id,
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
