import type { LyricLine, TimingUnit } from "./model";
import { moraCuts, rubyParts, setRuby, splitAt } from "./ruby";
import { graphemes, mergeUnits, splitUnit, tokenize } from "./tokenize";
import type { ReadingSpan } from "../lang/align";

export type RubySkipReason = "timed" | "mismatch";
export interface SkippedReading {
  /** The word or kanji run the dictionary tried to read. */
  text: string;
  /** `timed` would merge units with recorded times; `mismatch` cannot align. */
  reason: RubySkipReason;
}
export interface AutoRubyStats {
  /** Units that received an automatic reading. */
  annotated: number;
  /** Readings someone typed or confirmed, which automatic ruby never replaces. */
  kept: number;
  /** Spans that do not fit the current units, or would drop recorded times. */
  skipped: number;
  /** Every skipped span, for a per-word report. */
  skippedReadings: SkippedReading[];
}
export const emptyStats = (): AutoRubyStats => ({
  annotated: 0,
  kept: 0,
  skipped: 0,
  skippedReadings: [],
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

/**
 * Split the unit that contains `offset` so the border becomes a unit border.
 * A reading covers only the kanji run of a word (四角い／しかく), so a word-level
 * unit has to be divided before the reading can sit on its kanji. Returns false
 * when the border is not a grapheme boundary or the unit has data to keep.
 */
function splitAtBorder(line: LyricLine, offset: number): boolean {
  let start = 0;
  for (let index = 0; index < line.units.length; index++) {
    const unit = line.units[index];
    const end = start + unit.text.length;
    if (offset > start && offset < end) {
      // Ruby and roman text belong to the whole unit; cutting it would drop them.
      if (unit.ruby || unit.roman !== undefined) return false;
      try {
        line.units = splitUnit(line.units, index, offset - start);
      } catch {
        return false;
      }
      return true;
    }
    start = end;
  }
  return true;
}

/** Japanese: each kanji word (or kanji run inside it) gets its reading, divided by mora. */
export function applyJapaneseRuby(
  line: LyricLine,
  spans: ReadingSpan[],
  stats = emptyStats(),
): AutoRubyStats {
  hasUnits(line);
  const skipped = (text: string, reason: RubySkipReason) => {
    stats.skipped++;
    stats.skippedReadings.push({ text, reason });
  };
  for (const span of spans) {
    const groupAt = () => {
      const starts = offsets(line);
      const first = starts.findLastIndex((start) => start <= span.start);
      const last = starts.findLastIndex((start) => start < span.end);
      return { first, last, group: line.units.slice(first, last + 1) };
    };
    const word = line.text.slice(span.start, span.end);
    const before = groupAt();
    if (before.first < 0 || !before.group.length) {
      skipped(word, "mismatch");
      continue;
    }
    // Check typed or confirmed readings before any splitting destroys them.
    if (before.group.some(manual)) {
      stats.kept++;
      continue;
    }
    // The kanji run may end inside a word-level unit (四角い): split at the
    // reading borders instead of dropping the reading for the whole word.
    if (!splitAtBorder(line, span.start) || !splitAtBorder(line, span.end)) {
      skipped(word, "mismatch");
      continue;
    }
    const { first, last, group } = groupAt();
    if (first < 0 || !group.length) {
      skipped(word, "mismatch");
      continue;
    }
    const text = group.map((unit) => unit.text).join("");
    if (rubyParts(text).base !== word) {
      skipped(word, "mismatch");
      continue;
    }
    if (group.slice(1).some(timed)) {
      // Merging these units into one ruby group would discard their start times.
      skipped(word, "timed");
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
