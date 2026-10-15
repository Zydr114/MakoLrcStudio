import type { LyricLine, Syllable, TimingUnit } from "./model";
import { newSyllable, newUnit, unitStart } from "./model";
import { characterGaps } from "./segmentation";
import { graphemes, tokenizeText } from "./tokenize";

const small = new Set(
  Array.from(
    "ぁぃぅぇぉゃゅょゎゕゖァィゥェォャュョヮヵヶㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ",
  ),
);
const latin = (s: string) => /^[\p{Script=Latin}\p{Number}\p{M}'’]/u.test(s);

/**
 * Default syllables of a reading. In kana each mora is one: a small kana such as
 * ゃ joins the one before it, while っ, ん and ー stand alone. A Latin run (pinyin)
 * stays one piece.
 */
export function moraCuts(reading: string): number[] {
  const chars = graphemes(reading);
  const cuts: number[] = [];
  let offset = 0;
  chars.forEach((char, index) => {
    const previous = chars[index - 1];
    if (
      index > 0 &&
      !small.has(char) &&
      !/^\s/u.test(char) &&
      !/^[\p{P}]/u.test(char) &&
      !(latin(char) && latin(previous))
    )
      cuts.push(offset);
    offset += char.length;
  });
  return cuts;
}

export function splitAt(text: string, cuts: readonly number[]): string[] {
  const legal = new Set(characterGaps(text));
  if (
    cuts.some(
      (cut, index) => !legal.has(cut) || (index > 0 && cut <= cuts[index - 1]),
    )
  )
    throw new Error("分隔线必须位于完整字符之间，且不能交叉。");
  const edges = [0, ...cuts, text.length];
  const pieces = edges
    .slice(0, -1)
    .map((start, i) => text.slice(start, edges[i + 1]));
  if (pieces.some((piece) => !piece.trim()))
    throw new Error("每个音节都需要读音文字。");
  return pieces;
}

/** Where the current syllables of a ruby unit divide its reading. */
export function readingCuts(unit: TimingUnit): number[] {
  let offset = 0;
  return unit.syllables
    .slice(0, -1)
    .map((syllable) => (offset += syllable.text.length));
}
export const readingOf = (unit: TimingUnit): string =>
  unit.ruby ? unit.syllables.map((syllable) => syllable.text).join("") : "";

/**
 * Give a unit a reading (pieces = its syllables), or take it away (null).
 * Times stay with syllables that begin at the same reading offset; the first
 * syllable always keeps the unit start, the last one the pause after the unit.
 */
export function setRuby(
  line: LyricLine,
  unitIndex: number,
  pieces: string[] | null,
): void {
  const unit = line.units[unitIndex];
  const first = unit.syllables[0],
    pause = unit.syllables.at(-1)!.endMs;
  if (!pieces) {
    line.units[unitIndex] = {
      id: unit.id,
      text: unit.text,
      ruby: false,
      ...(unit.roman !== undefined ? { roman: unit.roman } : {}),
      syllables: [{ ...first, text: unit.text, endMs: pause }],
    };
    return;
  }
  if (!pieces.length || pieces.some((piece) => !piece.trim()))
    throw new Error("读音不能为空。");
  const origins = new Map<number, Syllable>();
  if (unit.ruby) {
    let offset = 0;
    for (const syllable of unit.syllables) {
      origins.set(offset, syllable);
      offset += syllable.text.length;
    }
  }
  origins.set(0, first);
  let offset = 0;
  const syllables = pieces.map((text, index): Syllable => {
    const old = origins.get(offset);
    offset += text.length;
    const endMs =
      index === pieces.length - 1
        ? pause
        : old?.text === text
          ? old.endMs
          : null;
    return old ? { ...old, text, endMs } : { ...newSyllable(text), endMs };
  });
  const { autoRuby: _, ...rest } = unit;
  line.units[unitIndex] = { ...rest, ruby: true, syllables };
}

/** Base text without the punctuation and spaces a unit carries, for <ruby>. */
export function rubyParts(text: string): {
  before: string;
  base: string;
  after: string;
} {
  const match = /^([\s\p{P}\p{S}]*)([\s\S]*?)([\s\p{P}\p{S}]*)$/u.exec(text)!;
  return match[2]
    ? { before: match[1], base: match[2], after: match[3] }
    : { before: "", base: text, after: "" };
}

/** Undo a group: one plain unit per character again, the group start kept on the first. */
export function splitIntoCharacters(line: LyricLine, unitIndex: number): void {
  const unit = line.units[unitIndex];
  const texts = tokenizeText(unit.text);
  if (texts.length < 2) throw new Error("这个单位只有一个字。");
  const units = texts.map((text, index) =>
    index ? newUnit(text) : { ...newUnit(text, unitStart(unit)), id: unit.id },
  );
  units.at(-1)!.syllables[0].endMs = unit.syllables.at(-1)!.endMs;
  line.units.splice(unitIndex, 1, ...units);
}
