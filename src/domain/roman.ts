import type { LyricLine, TimingUnit } from "./model";
import { moraCuts, readingOf, rubyParts, splitAt } from "./ruby";
import type { Word } from "../lang/align";

export type Romanize = (kana: string) => string;
const kanaOnly = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const latinOnly = /^[\p{Script=Latin}\p{N}\p{M}'’\- ]+$/u;
const toKatakana = (text: string) =>
  text.replace(/[ぁ-ゖ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  );
/** Punctuation that reads the same in Latin script; the rest is dropped. */
const marks: Record<string, string> = {
  "，": ",",
  "、": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  ",": ",",
  ".": ".",
  "!": "!",
  "?": "?",
};

/** What a unit sounds like in kana, or in Latin letters when it already is Latin. */
function sound(unit: TimingUnit): { kana?: string; latin?: string } {
  const base = rubyParts(unit.text).base.trim();
  const reading = readingOf(unit);
  if (unit.ruby)
    return kanaOnly.test(reading) ? { kana: reading } : { latin: reading };
  if (kanaOnly.test(base)) return { kana: base };
  if (latinOnly.test(base)) return { latin: base };
  return {};
}

export interface LineRoman {
  units: (string | undefined)[];
  text: string;
  /** Units with Chinese characters but no reading: they need ruby first. */
  missing: number;
}

/**
 * Romanize a line from its readings. Sokuon and the long vowel mark need their
 * neighbours, so each unit is converted together with the mora next to it and
 * that neighbour's letters are taken off again.
 */
export function romanizeLine(
  line: LyricLine,
  romanize: Romanize,
  words?: Word[],
): LineRoman {
  const sounds = line.units.map(sound);
  const firstMora = (kana = "") => splitAt(kana, moraCuts(kana))[0] ?? "";
  const convert = (kana: string) => romanize(toKatakana(kana));
  let missing = 0,
    position = 0;
  const starts: number[] = [];
  const units = line.units.map((unit, index) => {
    starts.push(position);
    position += unit.text.length;
    const { kana, latin } = sounds[index];
    if (latin !== undefined) return latin;
    if (!kana) {
      if (/\p{Script=Han}/u.test(unit.text)) missing++;
      return undefined;
    }
    const word = words?.find(
      (item) =>
        item.particle &&
        item.start === starts[index] + rubyParts(unit.text).before.length,
    );
    if (word && rubyParts(unit.text).base === kana) return word.particle;
    const before = kana.startsWith("ー")
      ? (sounds[index - 1]?.kana?.slice(-1) ?? "")
      : "";
    const after = /[っッ]$/.test(kana)
      ? firstMora(sounds[index + 1]?.kana)
      : "";
    let result = convert(before + kana + after);
    const head = before && convert(before),
      tail = after && convert(after);
    if (head && result.startsWith(head)) result = result.slice(head.length);
    if (tail && result.endsWith(tail)) result = result.slice(0, -tail.length);
    return result;
  });
  // Spaces go between words when they are known, otherwise between units.
  const breaks = words ? new Set(words.map((word) => word.start)) : null;
  let text = "";
  line.units.forEach((unit, index) => {
    const parts = rubyParts(unit.text);
    const start = starts[index] + parts.before.length;
    if (index > 0 && (!breaks || breaks.has(start) || /\s/.test(parts.before)))
      text += " ";
    text += units[index] ?? "";
    text += [...parts.after]
      .map((char) => marks[char] ?? (/\s/.test(char) ? " " : ""))
      .join("");
  });
  return {
    units,
    text: text
      .replace(/\s+/g, " ")
      .replace(/ ([,.!?])/g, "$1")
      .trim(),
    missing,
  };
}
