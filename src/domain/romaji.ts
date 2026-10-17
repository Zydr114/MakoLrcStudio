const latin = /[\p{Script=Latin}]/u;

/** Whether a reading contains Latin letters that may be romaji. */
export function hasRomaji(text: string): boolean {
  return latin.test(text);
}

/**
 * Convert basic Hepburn romaji in a reading to hiragana. Kana, kanji,
 * punctuation and spaces stay where they are. WanaKana loads on demand so the
 * converter does not add to the initial bundle.
 */
export async function romajiToKana(text: string): Promise<string> {
  if (!hasRomaji(text)) return text;
  const { toHiragana } = await import("wanakana");
  return toHiragana(text);
}
