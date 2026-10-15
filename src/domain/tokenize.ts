import { newUnit, unitStart, type TimingUnit } from "./model";

const segmenter = () => {
  if (!Intl.Segmenter)
    throw new Error("当前浏览器不支持完整字符切分，请更新浏览器。");
  return new Intl.Segmenter("ja", { granularity: "grapheme" });
};
export const graphemes = (text: string): string[] =>
  Array.from(segmenter().segment(text), (s) => s.segment);
const latin = (s: string) => /^[\p{Script=Latin}\p{Number}]/u.test(s);
const opening = new Set(Array.from("([{（［｛「『【《〈“‘"));

/** Default unit texts: a full visible character, a Latin word, punctuation attached. */
export function tokenizeText(text: string): string[] {
  const chars = graphemes(text);
  const units: string[] = [];
  let prefix = "";
  let quoted = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const quoteStart = char === '"' && !quoted;
    if (char === '"') quoted = !quoted;
    if (opening.has(char) || quoteStart) {
      prefix += char;
      continue;
    }
    if (/^[\s\p{P}]+$/u.test(char)) {
      if (prefix || !units.length) prefix += char;
      else units[units.length - 1] += char;
      continue;
    }
    let content = char;
    if (latin(char)) {
      while (i + 1 < chars.length) {
        if (latin(chars[i + 1])) {
          content += chars[++i];
          continue;
        }
        if (/^['’\-‐‑]$/.test(chars[i + 1]) && latin(chars[i + 2] ?? "")) {
          content += chars[++i] + chars[++i];
          continue;
        }
        break;
      }
    }
    units.push(prefix + content);
    prefix = "";
  }
  if (prefix) {
    if (units.length) units[units.length - 1] += prefix;
    else units.push(prefix);
  }
  return units;
}

export const tokenize = (text: string): TimingUnit[] =>
  tokenizeText(text).map((part) => newUnit(part));

export function splitUnit(
  units: TimingUnit[],
  index: number,
  offset: number,
): TimingUnit[] {
  const unit = units[index];
  const boundaries = new Set(
    Array.from(segmenter().segment(unit.text), (s) => s.index),
  );
  if (!boundaries.has(offset) || offset <= 0 || offset >= unit.text.length)
    throw new Error("请选择完整字符之间的拆分位置。");
  const first = newUnit(unit.text.slice(0, offset), unitStart(unit));
  const second = newUnit(unit.text.slice(offset));
  second.syllables[0].endMs = unit.syllables.at(-1)!.endMs;
  return [
    ...units.slice(0, index),
    { ...first, id: unit.id },
    second,
    ...units.slice(index + 1),
  ];
}

export function mergeUnits(
  units: TimingUnit[],
  from: number,
  to: number,
): TimingUnit[] {
  if (from < 0 || to <= from || to >= units.length)
    throw new Error("请选中至少两个相邻单位。");
  const text = units
    .slice(from, to + 1)
    .map((u) => u.text)
    .join("");
  // Ruby does not survive a merge; a pause after the last merged unit does.
  const merged = {
    ...newUnit(text, unitStart(units[from])),
    id: units[from].id,
  };
  merged.syllables[0].endMs = units[to].syllables.at(-1)!.endMs;
  return [...units.slice(0, from), merged, ...units.slice(to + 1)];
}
