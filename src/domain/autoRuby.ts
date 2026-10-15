import type { LyricLine, TimingUnit } from "./model";
import { moraCuts, rubyParts, setRuby, splitAt } from "./ruby";
import { graphemes, mergeUnits, tokenize } from "./tokenize";
import type { ReadingSpan } from "../lang/align";

export interface AutoRubyStats {
  /** Units that received an automatic reading. */
  annotated: number;
  /** Readings someone typed or confirmed, which automatic ruby never replaces. */
  kept: number;
  /** Spans that do not fit the current units, or would drop recorded times. */
  skipped: number;
}
export const emptyStats = (): AutoRubyStats => ({
  annotated: 0,
  kept: 0,
  skipped: 0,
});
const manual = (unit: TimingUnit) => unit.ruby && !unit.autoRuby;
const timed = (unit: TimingUnit) =>
  unit.syllables.some((s) => s.startMs !== null || s.endMs !== null);
function offsets(line: LyricLine): number[] {
  let position = 0;
  return line.units.map((unit) => {
    const start = position;
    position += unit.text.length;
    return start;
  });
}
const hasUnits = (line: LyricLine) => {
  if (!line.units.length) line.units = tokenize(line.text);
};

/** Japanese: each kanji word (or kanji run inside it) gets its reading, divided by mora. */
export function applyJapaneseRuby(
  line: LyricLine,
  spans: ReadingSpan[],
  stats = emptyStats(),
): AutoRubyStats {
  hasUnits(line);
  for (const span of spans) {
    const starts = offsets(line);
    const first = starts.findLastIndex((start) => start <= span.start);
    const last = starts.findLastIndex((start) => start < span.end);
    const group = line.units.slice(first, last + 1);
    if (first < 0 || !group.length) {
      stats.skipped++;
      continue;
    }
    if (group.some(manual)) {
      stats.kept++;
      continue;
    }
    const text = group.map((unit) => unit.text).join("");
    if (
      rubyParts(text).base !== line.text.slice(span.start, span.end) ||
      group.slice(1).some(timed)
    ) {
      stats.skipped++;
      continue;
    }
    if (last > first) line.units = mergeUnits(line.units, first, last);
    setRuby(line, first, splitAt(span.reading, moraCuts(span.reading)));
    line.units[first].autoRuby = true;
    stats.annotated++;
  }
  return stats;
}

/**
 * Chinese: a unit of Chinese characters gets their pinyin as one syllable, so
 * the number of Enter presses does not change; pinyin is only for reading.
 */
export function applyChineseRuby(
  line: LyricLine,
  pinyin: Map<number, string>,
  stats = emptyStats(),
): AutoRubyStats {
  hasUnits(line);
  const starts = offsets(line);
  line.units.forEach((unit, index) => {
    const parts = rubyParts(unit.text);
    let offset = starts[index] + parts.before.length;
    const readings = graphemes(parts.base).map((char) => {
      const reading = pinyin.get(offset);
      offset += char.length;
      return reading;
    });
    if (!readings.length || readings.some((reading) => !reading)) return;
    if (manual(unit)) {
      stats.kept++;
      return;
    }
    setRuby(line, index, [readings.join(" ")]);
    line.units[index].autoRuby = true;
    stats.annotated++;
  });
  return stats;
}

/** Kana anywhere means Japanese: Chinese lyrics do not use it. */
export const guessLanguage = (lines: LyricLine[]): "ja" | "zh" =>
  lines.some((line) =>
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line.text),
  )
    ? "ja"
    : "zh";

export const pendingRuby = (line: LyricLine): number =>
  line.units.filter((unit) => unit.autoRuby).length;

export function confirmRuby(
  line: LyricLine,
  from = 0,
  to = line.units.length - 1,
) {
  for (const unit of line.units.slice(from, to + 1)) delete unit.autoRuby;
}
