import { ref } from "vue";
import { editor } from "./editor";
import { activeLines } from "../domain/model";
import { tokenize } from "../domain/tokenize";
import { romanizeLine } from "../domain/roman";
import type { Word } from "../lang/align";

export const romanLoading = ref(false);
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Line and word romanization from the readings, as one undoable edit. Japanese
 * uses the dictionary for word spacing and particles; typed romanization stays.
 */
export async function generateRoman(lineIds: string[]): Promise<boolean> {
  if (romanLoading.value) return false;
  editor.pause();
  romanLoading.value = true;
  editor.error = "";
  try {
    const { toRomaji } = await import("wanakana");
    const lines = editor.lines.filter((line) => lineIds.includes(line.id));
    const japanese = lines.some((line) => kana.test(line.text));
    const words = new Map<string, Word[]>();
    if (japanese) {
      const { japaneseWords } = await import("../lang/japanese");
      const split = await japaneseWords();
      for (const line of lines)
        if (kana.test(line.text)) words.set(line.id, split(line.text));
    }
    const texts = new Map(lines.map((line) => [line.id, line.text]));
    let made = 0,
      kept = 0,
      missing = 0;
    const ok = editor.command("从注音生成罗马音", (draft) => {
      for (const line of activeLines(draft)) {
        if (texts.get(line.id) !== line.text) continue;
        if (line.roman.trim() && !line.romanAuto) {
          kept++;
          continue;
        }
        if (!line.units.length) line.units = tokenize(line.text);
        const result = romanizeLine(line, toRomaji, words.get(line.id));
        line.roman = result.text;
        line.units.forEach((unit, index) => {
          if (result.units[index]) unit.roman = result.units[index];
          else delete unit.roman;
        });
        line.romanAuto = true;
        missing += result.missing;
        made++;
      }
      if (!draft.romanLang) draft.romanLang = japanese ? "ja-Latn" : "zh-Latn";
    });
    if (!ok) return false;
    editor.message = [
      `已生成 ${made} 行罗马音，待确认`,
      kept ? `${kept} 行保留了手写的罗马音` : "",
      missing ? `${missing} 处汉字没有读音，请先在「注音」图层注音` : "",
    ]
      .filter(Boolean)
      .join("；")
      .concat("。");
    return true;
  } catch (error) {
    editor.error = `罗马音生成失败：${(error as Error).message}`;
    return false;
  } finally {
    romanLoading.value = false;
  }
}
