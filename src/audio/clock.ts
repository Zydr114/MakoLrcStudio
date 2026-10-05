export interface ClockAnchor {
  offsetMs: number;
  contextStart: number;
  rate: number;
}

/** Convert an input event's monotonic timestamp to the original audio timeline. */
export function eventToSourceMs(
  eventTime: number,
  output: { contextTime: number; performanceTime: number },
  anchor: ClockAnchor,
): number {
  const audioTime =
    output.contextTime + (eventTime - output.performanceTime) / 1000;
  return (
    anchor.offsetMs + (audioTime - anchor.contextStart) * anchor.rate * 1000
  );
}
