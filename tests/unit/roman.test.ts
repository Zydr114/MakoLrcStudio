import { describe, expect, it } from "vitest";
import { toRomaji } from "wanakana";
import { TokenizerBuilder } from "@patdx/kuromoji";
import NodeDictionaryLoader from "@patdx/kuromoji/node";
import { lineSpans, lineWords } from "../../src/lang/align";
import { chineseReader } from "../../src/lang/chinese";
import { applyChineseRuby, applyJapaneseRuby } from "../../src/domain/autoRuby";
import { romanizeLine } from "../../src/domain/roman";
import { tokenize } from "../../src/domain/tokenize";
import { readBackup } from "../../src/domain/backup";
import { activeLines, newLine } from "../../src/domain/model";
import { fromLyrics } from "./helpers";

const tokenizer = new TokenizerBuilder({
  loader: new NodeDictionaryLoader({
    dic_path: "node_modules/@patdx/kuromoji/dict/",
  } as never),
}).build();

describe("romanization from readings", () => {
  it("spaces Japanese by word, reads particles as wa/o/e and keeps sokuon with its mora", async () => {
    const read = await tokenizer;
    const line = newLine("君は学校へ行った");
    const tokens = read.tokenize(line.text);
    applyJapaneseRuby(line, lineSpans(tokens));
    const result = romanizeLine(line, toRomaji, lineWords(tokens));
    expect(result.text).toBe("kimi wa gakkou e itta");
    expect(result.units).toEqual(["kimi", "wa", "gakkou", "e", "i", "t", "ta"]);
    expect(result.missing).toBe(0);
  }, 30000);
  it("joins a long vowel mark to the mora before it and keeps Latin words", () => {
    const line = newLine("ラーメン、Yeah!");
    line.units = tokenize(line.text);
    const result = romanizeLine(line, toRomaji);
    expect(result.units).toEqual(["ra", "a", "me", "n", "Yeah"]);
    expect(result.text).toBe("ra a me n, Yeah!");
    const sokuon = newLine("がっこう");
    sokuon.units = tokenize(sokuon.text);
    expect(romanizeLine(sokuon, toRomaji).units).toEqual([
      "ga",
      "k",
      "ko",
      "u",
    ]);
  });
  it("uses pinyin for Chinese and counts characters without a reading", async () => {
    const read = await chineseReader();
    const line = newLine("我们，长大");
    applyChineseRuby(line, read(line.text));
    expect(romanizeLine(line, toRomaji).text).toBe("wǒ men, zhǎng dà");
    const bare = newLine("长大");
    bare.units = tokenize(bare.text);
    expect(romanizeLine(bare, toRomaji)).toMatchObject({
      missing: 2,
      text: "",
    });
  });
  it("stores the generated flag in backups", () => {
    const project = fromLyrics("今日");
    activeLines(project)[0].roman = "kyou";
    activeLines(project)[0].romanAuto = true;
    expect(activeLines(readBackup(JSON.stringify(project)))[0]).toMatchObject({
      roman: "kyou",
      romanAuto: true,
    });
  });
});
