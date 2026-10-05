import { newId, type LyricLine, type TimingUnit } from "./model";
import { graphemes } from "./tokenize";
export function characterGaps(text: string): number[] {
  let offset = 0;
  return graphemes(text)
    .slice(0, -1)
    .map((character) => (offset += character.length));
}
export function unitCuts(line: LyricLine): number[] {
  const legal = new Set(characterGaps(line.text));
  let offset = 0;
  return line.units
    .slice(0, -1)
    .map((unit) => (offset += unit.text.length))
    .filter((offset) => legal.has(offset));
}
export interface TextGroup {
  start: number;
  end: number;
  text: string;
}
export function partitionText(
  text: string,
  cuts: readonly number[],
): TextGroup[] {
  const legal = new Set(characterGaps(text));
  if (
    cuts.some(
      (cut, index) =>
        !Number.isSafeInteger(cut) ||
        !legal.has(cut) ||
        (index > 0 && cut <= cuts[index - 1]),
    )
  )
    throw new Error("分隔线必须位于完整字符之间，且不能交叉。");
  const edges = [0, ...cuts, text.length];
  return edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1],
      part = text.slice(start, end);
    if (!part.trim()) throw new Error("分隔线不能生成空白单位。");
    return { start, end, text: part };
  });
}
function anchors(line: LyricLine): Map<number, TimingUnit> {
  let position = 0;
  const origins = new Map<number, TimingUnit>();
  for (const unit of line.units) {
    origins.set(position, unit);
    position += unit.text.length;
  }
  return origins;
}
/** Identity and measured time follow original text positions, never repeated text values. */
export function resegmentLine(
  line: LyricLine,
  cuts: readonly number[],
): TimingUnit[] {
  const origins = anchors(line);
  return partitionText(line.text, cuts).map((group) => {
    const old = origins.get(group.start);
    return {
      id: old?.id ?? newId(),
      text: group.text,
      startMs: old?.startMs ?? null,
    };
  });
}
export function segmentationSummary(line: LyricLine, cuts: readonly number[]) {
  const origins = anchors(line),
    groups = partitionText(line.text, cuts);
  return {
    count: groups.length,
    retained: groups.filter(
      (group) => origins.get(group.start)?.startMs != null,
    ).length,
    addedMissing: groups.filter((group) => !origins.has(group.start)).length,
  };
}

/** Add a character boundary without clearing neighboring timestamps or the terminal. */
export function splitTokenAt(line: LyricLine, offset: number): TimingUnit[] {
  if (unitCuts(line).includes(offset)) throw new Error("光标处已有分隔线。");
  return resegmentLine(
    line,
    [...unitCuts(line), offset].sort((a, b) => a - b),
  );
}
