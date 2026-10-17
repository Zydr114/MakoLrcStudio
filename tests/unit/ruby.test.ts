import { describe, expect, it } from "vitest";
import {
  moraCuts,
  readingCuts,
  readingOf,
  rubyParts,
  setRuby,
  splitAt,
} from "../../src/domain/ruby";
import {
  activeLines,
  syllablesOf,
  validate,
  type ProjectDraft,
} from "../../src/domain/model";
import {
  setSyllableEnd,
  setSyllableStart,
  syllableEndBounds,
} from "../../src/domain/edit";
import { createEditor } from "../../src/state/editor";
import { FakeTransport, fromLyrics } from "./helpers";

const morae = (reading: string) => splitAt(reading, moraCuts(reading));

describe("readings and morae", () => {
  it("splits kana by mora: small kana join, っ ん ー stand alone, pinyin stays whole", () => {
    expect(morae("せん")).toEqual(["せ", "ん"]);
    expect(morae("きょう")).toEqual(["きょ", "う"]);
    expect(morae("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(morae("ラーメン")).toEqual(["ラ", "ー", "メ", "ン"]);
    expect(morae("ティー")).toEqual(["ティ", "ー"]);
    expect(morae("quán")).toEqual(["quán"]);
    expect(() => splitAt("せん", [0])).toThrow();
  });
  it("keeps attached punctuation outside the ruby base", () => {
    expect(rubyParts("「詮、")).toEqual({
      before: "「",
      base: "詮",
      after: "、",
    });
    expect(rubyParts("今日 ")).toEqual({
      before: "",
      base: "今日",
      after: " ",
    });
    expect(rubyParts("…")).toEqual({ before: "", base: "…", after: "" });
  });
});

describe("editing a unit's reading", () => {
  function timed(): ProjectDraft {
    return fromLyrics("[00:01]<00:01>詮<00:03>な<00:04>");
  }
  it("turns a plain unit into syllables and keeps the unit start", () => {
    const project = timed();
    const line = activeLines(project)[0];
    setRuby(line, 0, ["せ", "ん"]);
    const unit = line.units[0];
    expect(unit.ruby).toBe(true);
    expect(readingOf(unit)).toBe("せん");
    expect(readingCuts(unit)).toEqual([1]);
    expect(unit.syllables.map((s) => s.startMs)).toEqual([1000, null]);
    expect(validate(project).map((issue) => issue.message)).toEqual([
      "「詮・ん」尚未记录起点",
    ]);
    setSyllableStart(project, 0, 1, 2000);
    expect(validate(project)).toEqual([]);
  });
  it("keeps times at unchanged reading offsets and restores a plain unit", () => {
    const project = timed();
    const line = activeLines(project)[0];
    setRuby(line, 0, ["せ", "ん"]);
    setSyllableStart(project, 0, 1, 2000);
    const [first, second] = line.units[0].syllables;
    setRuby(line, 0, ["ぜ", "ん"]);
    expect(line.units[0].syllables.map((s) => [s.id, s.startMs])).toEqual([
      [first.id, 1000],
      [second.id, 2000],
    ]);
    setRuby(line, 0, ["ぜん"]);
    expect(syllablesOf(line).map((s) => s.startMs)).toEqual([1000, 3000]);
    line.units[0].autoRuby = true;
    setRuby(line, 0, ["せ", "ん"]);
    expect(line.units[0].autoRuby).toBeUndefined();
    setRuby(line, 0, null);
    expect(line.units[0]).toMatchObject({ ruby: false, text: "詮" });
    expect(line.units[0].syllables).toHaveLength(1);
    expect(line.units[0].syllables[0]).toMatchObject({
      text: "詮",
      startMs: 1000,
    });
    expect(() => setRuby(line, 0, ["", "ん"])).toThrow("读音");
  });
});

describe("syllable ends", () => {
  it("bounds a pause between its own start and the next start", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>日<00:03>");
    expect(syllableEndBounds(project, 0, 0)).toEqual([1001, 2000]);
    expect(() => syllableEndBounds(project, 0, 1)).toThrow("收尾");
    setSyllableEnd(project, 0, 0, 1500);
    expect(validate(project)).toEqual([]);
    expect(() => setSyllableStart(project, 0, 1, 1400)).toThrow("相邻边界");
    expect(() => setSyllableEnd(project, 0, 0, 2001)).toThrow("相邻边界");
    setSyllableEnd(project, 0, 0, null);
    expect(syllablesOf(activeLines(project)[0])[0].endMs).toBeNull();
  });
});

describe("recording a ruby unit", () => {
  it("asks for one Enter per syllable and names each in the cue", async () => {
    const audio = new FakeTransport(),
      editor = createEditor(audio, false);
    await editor.loadAudio({} as File);
    editor.importText("[00:01]詮な");
    editor.goStage(3);
    editor.command("编辑读音", (draft) =>
      setRuby(activeLines(draft)[0], 0, ["せ", "ん"]),
    );
    await editor.enter();
    audio.position = 1000;
    await editor.enter();
    expect(editor.lastRecorded?.text).toBe("詮・せ");
    audio.position = 1400;
    await editor.enter();
    expect(editor.lastRecorded?.text).toBe("詮・ん");
    audio.position = 1900;
    await editor.enter();
    expect(editor.lastRecorded?.text).toBe("な");
    audio.position = 2500;
    await editor.enter();
    expect(syllablesOf(editor.line!).map((s) => s.startMs)).toEqual([
      1000, 1400, 1900,
    ]);
    expect(editor.line?.endMs).toBe(2500);
    expect(editor.isComplete).toBe(true);
    await editor.restartWordTiming();
    expect(syllablesOf(editor.line!).map((s) => s.startMs)).toEqual([
      null,
      null,
      null,
    ]);
    expect(editor.line?.endMs).toBeNull();
    expect(editor.line?.startMs).toBe(1000);
  });
});
