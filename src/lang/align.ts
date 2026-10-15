/** Reading of a stretch of line text, as character offsets into the line. */
export interface ReadingSpan {
  start: number;
  end: number;
  /** Hiragana. */
  reading: string;
}
export interface ReadingToken {
  surface_form: string;
  reading?: string;
  pos?: string;
}
export interface Word {
  start: number;
  end: number;
  /** は, を and へ as particles are written wa, o and e in romaji. */
  particle?: string;
}

const kanji = /[\p{Script=Han}々〆ヶ]/u;
export const toHiragana = (text: string): string =>
  text.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Kana in a word anchors its reading, so okurigana stay out of the ruby:
 * 引き出す／ひきだす gives 引＝ひ and 出＝だ. A word that cannot be matched that
 * way (物語, １２月) is read as one group.
 */
export function alignToken(surface: string, reading: string): ReadingSpan[] {
  const runs: { text: string; kanji: boolean; start: number }[] = [];
  let position = 0;
  for (const char of surface) {
    const isKanji = kanji.test(char);
    const last = runs.at(-1);
    if (last && last.kanji === isKanji) last.text += char;
    else runs.push({ text: char, kanji: isKanji, start: position });
    position += char.length;
  }
  if (!runs.some((run) => run.kanji)) return [];
  const hira = toHiragana(reading);
  if (!hira || hira === toHiragana(surface)) return [];
  const pattern = new RegExp(
    `^${runs.map((run) => (run.kanji ? "(.+?)" : escape(toHiragana(run.text)))).join("")}$`,
    "u",
  );
  const match = pattern.exec(hira);
  if (!match) return [{ start: 0, end: surface.length, reading: hira }];
  let group = 1;
  return runs.flatMap((run) =>
    run.kanji
      ? [
          {
            start: run.start,
            end: run.start + run.text.length,
            reading: match[group++],
          },
        ]
      : [],
  );
}

/** Spans for a whole line from analyzer tokens, which cover the text in order. */
export function lineSpans(tokens: ReadingToken[]): ReadingSpan[] {
  let offset = 0;
  return tokens.flatMap((token) => {
    const spans = token.reading
      ? alignToken(token.surface_form, token.reading).map((span) => ({
          ...span,
          start: span.start + offset,
          end: span.end + offset,
        }))
      : [];
    offset += token.surface_form.length;
    return spans;
  });
}

const particles: Record<string, string> = { は: "wa", を: "o", へ: "e" };
export function lineWords(tokens: ReadingToken[]): Word[] {
  let offset = 0;
  const words: Word[] = [];
  for (const token of tokens) {
    const start = offset;
    offset += token.surface_form.length;
    // Auxiliary verbs belong to the word before them: 行った is itta.
    if (token.pos === "助動詞" && words.length) {
      words[words.length - 1].end = offset;
      continue;
    }
    const particle =
      token.pos === "助詞" ? particles[token.surface_form] : undefined;
    words.push(
      particle ? { start, end: offset, particle } : { start, end: offset },
    );
  }
  return words;
}
