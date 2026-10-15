import { describe, expect, it } from "vitest";
import { TokenizerBuilder } from "@patdx/kuromoji";
import NodeDictionaryLoader from "@patdx/kuromoji/node";
import { alignToken, lineSpans } from "../../src/lang/align";
import { chineseReader } from "../../src/lang/chinese";
import {
  applyChineseRuby,
  applyJapaneseRuby,
  confirmRuby,
  guessLanguage,
  pendingRuby,
} from "../../src/domain/autoRuby";
import { readingOf, setRuby, splitIntoCharacters } from "../../src/domain/ruby";
import { editLine } from "../../src/domain/edit";
import {
  activeLines,
  newLine,
  syllablesOf,
  unitStart,
} from "../../src/domain/model";
import { fromLyrics } from "./helpers";

const tokenizer = new TokenizerBuilder({
  loader: new NodeDictionaryLoader({
    dic_path: "node_modules/@patdx/kuromoji/dict/",
  } as never),
}).build();
const readings = (line: ReturnType<typeof newLine>) =>
  line.units.map((unit) =>
    unit.ruby
      ? `${unit.text}|${unit.syllables.map((s) => s.text).join("・")}`
      : unit.text,
  );

describe("aligning dictionary readings", () => {
  it("anchors on kana so okurigana stay out of the ruby", () => {
    expect(alignToken("引き出す", "ヒキダス")).toEqual([
      { start: 0, end: 1, reading: "ひ" },
      { start: 2, end: 3, reading: "だ" },
    ]);
    expect(alignToken("物語", "モノガタリ")).toEqual([
      { start: 0, end: 2, reading: "ものがたり" },
    ]);
    expect(alignToken("１２月", "ジュウニガツ")).toEqual([
      { start: 0, end: 3, reading: "じゅうにがつ" },
    ]);
    expect(alignToken("きみ", "キミ")).toEqual([]);
    expect(
      lineSpans([
        { surface_form: "君", reading: "キミ" },
        { surface_form: "と", reading: "ト" },
        { surface_form: "歌う", reading: "ウタウ" },
      ]),
    ).toEqual([
      { start: 0, end: 1, reading: "きみ" },
      { start: 2, end: 3, reading: "うた" },
    ]);
  });
});

describe("automatic Japanese ruby", () => {
  it("reads a line with the bundled dictionary and divides readings by mora", async () => {
    const read = await tokenizer;
    const line = newLine("今日も君と引き出す物語");
    const stats = applyJapaneseRuby(line, lineSpans(read.tokenize(line.text)));
    expect(readings(line)).toEqual([
      "今日|きょ・う",
      "も",
      "君|き・み",
      "と",
      "引|ひ",
      "き",
      "出|だ",
      "す",
      "物語|も・の・が・た・り",
    ]);
    expect(stats).toEqual({ annotated: 5, kept: 0, skipped: 0 });
    expect(pendingRuby(line)).toBe(5);
    expect(line.units.map((unit) => unit.text).join("")).toBe(line.text);
  }, 30000);
  it("never replaces a typed reading and never drops recorded times", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>日<00:03>も<00:04>");
    const line = activeLines(project)[0];
    const spans = [{ start: 0, end: 2, reading: "きょう" }];
    expect(applyJapaneseRuby(line, spans)).toMatchObject({ skipped: 1 });
    line.units[1].syllables[0].startMs = null;
    expect(applyJapaneseRuby(line, spans)).toMatchObject({ annotated: 1 });
    expect(unitStart(line.units[0])).toBe(1000);
    expect(syllablesOf(line).map((s) => s.startMs)).toEqual([1000, null, 3000]);
    confirmRuby(line);
    expect(pendingRuby(line)).toBe(0);
    setRuby(line, 0, ["こん", "にち"]);
    expect(applyJapaneseRuby(line, spans)).toMatchObject({ kept: 1 });
    expect(readingOf(line.units[0])).toBe("こんにち");
  });
});

describe("automatic Chinese pinyin", () => {
  it("judges polyphones by word and keeps one syllable per character", async () => {
    const read = await chineseReader();
    const line = newLine("银行行长，长大");
    applyChineseRuby(line, read(line.text));
    expect(readings(line)).toEqual([
      "银|yín",
      "行|háng",
      "行|háng",
      "长，|zhǎng",
      "长|zhǎng",
      "大|dà",
    ]);
    expect(syllablesOf(line)).toHaveLength(6);
    expect(guessLanguage([line])).toBe("zh");
    expect(guessLanguage([newLine("君と")])).toBe("ja");
  });
});

describe("text edits keep readings", () => {
  it("keeps readings outside the changed part and clears every time", () => {
    const project = fromLyrics(
      "[00:01]<00:01>今<00:02>日<00:03>も<00:04>君<00:05>",
    );
    const line = activeLines(project)[0];
    setRuby(line, 0, ["い", "ま"]);
    setRuby(line, 3, ["き", "み"]);
    editLine(project, line.id, "今日は君");
    expect(readings(line)).toEqual(["今|い・ま", "日", "は", "君|き・み"]);
    expect(syllablesOf(line).every((s) => s.startMs === null)).toBe(true);
    expect(line.startMs).toBe(1000);
    editLine(project, line.id, "全部違う");
    expect(line.units.some((unit) => unit.ruby)).toBe(false);
  });
  it("splits a group back into characters", () => {
    const line = newLine("物語");
    applyJapaneseRuby(line, [{ start: 0, end: 2, reading: "ものがたり" }]);
    splitIntoCharacters(line, 0);
    expect(readings(line)).toEqual(["物", "語"]);
  });
});
