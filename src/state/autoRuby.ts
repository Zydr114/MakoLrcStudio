import { ref } from "vue";
import { editor } from "./editor";
import { activeLines, completeLine, type LyricLine } from "../domain/model";
import {
  applyChineseRuby,
  applyJapaneseRuby,
  emptyStats,
  type AutoRubyStats,
} from "../domain/autoRuby";

export type RubyLanguage = "ja" | "zh";
/** Shown while a dictionary loads: the Japanese one is about 17 MB. */
export const rubyLoading = ref<RubyLanguage | null>(null);

/**
 * Reads the given lines of the current part with a dictionary, then writes the
 * readings as one undoable edit. Typed or confirmed readings are never replaced.
 */
export async function runAutoRuby(
  language: RubyLanguage,
  lineIds: string[],
): Promise<boolean> {
  if (rubyLoading.value) return false;
  editor.pause();
  rubyLoading.value = language;
  editor.error = "";
  try {
    const texts = new Map(
      editor.lines
        .filter((line) => lineIds.includes(line.id))
        .map((line) => [line.id, line.text]),
    );
    // Read everything first: the edit itself must not wait on a download.
    let annotate: (line: LyricLine, stats: AutoRubyStats) => void;
    if (language === "ja") {
      const { japaneseReader } = await import("../lang/japanese");
      const read = await japaneseReader();
      const spans = new Map([...texts].map(([id, text]) => [id, read(text)]));
      annotate = (line, stats) =>
        applyJapaneseRuby(line, spans.get(line.id)!, stats);
    } else {
      const { chineseReader } = await import("../lang/chinese");
      const read = await chineseReader();
      const pinyin = new Map([...texts].map(([id, text]) => [id, read(text)]));
      annotate = (line, stats) =>
        applyChineseRuby(line, pinyin.get(line.id)!, stats);
    }
    const stats = emptyStats();
    let reopened = 0;
    const ok = editor.command("自动注音", (draft) => {
      for (const line of activeLines(draft)) {
        // A line edited while the dictionary loaded is left alone.
        if (texts.get(line.id) !== line.text) continue;
        const complete = completeLine(line);
        annotate(line, stats);
        if (complete && !completeLine(line)) reopened++;
      }
    });
    if (!ok) return false;
    editor.message = [
      `自动注音完成：${stats.annotated} 处待确认`,
      stats.kept ? `${stats.kept} 处保留了已确认的读音` : "",
      stats.skipped ? `${stats.skipped} 处与现有切分不符，已跳过` : "",
      reopened ? `${reopened} 行新增了待打的音节` : "",
    ]
      .filter(Boolean)
      .join("；")
      .concat("。请逐行核对。");
    return true;
  } catch (error) {
    editor.error =
      language === "ja"
        ? `日语词典加载失败，自动注音不可用（手动注音不受影响）：${(error as Error).message}`
        : `拼音数据加载失败：${(error as Error).message}`;
    return false;
  } finally {
    rubyLoading.value = null;
  }
}
