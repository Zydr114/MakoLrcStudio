/** Pinyin with tone marks for each Chinese character, keyed by its offset in the text. */
export async function chineseReader(): Promise<
  (text: string) => Map<number, string>
> {
  const { pinyin } = await import("pinyin-pro");
  return (text) => {
    const result = new Map<number, string>();
    let offset = 0;
    // Whole lines go in at once so polyphones are judged by their words.
    for (const item of pinyin(text, { type: "all", toneSandhi: false })) {
      if (item.isZh && item.pinyin) result.set(offset, item.pinyin);
      offset += item.origin.length;
    }
    return result;
  };
}
