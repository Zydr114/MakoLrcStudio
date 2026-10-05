export interface TimeViewport {
  startMs: number;
  endMs: number;
}
export function timeToRatio(ms: number, view: TimeViewport): number {
  return (ms - view.startMs) / Math.max(1, view.endMs - view.startMs);
}
export function ratioToTime(ratio: number, view: TimeViewport): number {
  return Math.round(
    view.startMs + ratio * Math.max(1, view.endMs - view.startMs),
  );
}
export function intervalGeometry(
  start: number,
  end: number,
  view: TimeViewport,
) {
  const left = Math.max(0, timeToRatio(start, view));
  const right = Math.min(1, timeToRatio(end, view));
  return { left: left * 100, width: Math.max(0, right - left) * 100 };
}
