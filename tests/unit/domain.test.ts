import { describe, it, expect } from "vitest";
import {
  newProject,
  parseTime,
  formatTime,
  validate,
} from "../../src/domain/model";
import { importLyrics, exportLyrics } from "../../src/domain/lrc";
import { tokenize, splitUnit, mergeUnits } from "../../src/domain/tokenize";
import {
  editLine,
  cleanProject,
  setUnitStart,
  setLineStart,
  setLineEnd,
} from "../../src/domain/edit";

describe("lyric import and export", () => {
  it("keeps zero timestamps distinct from missing and expands repeated lines", () => {
    const result = importLyrics(
      "[offset:100]\n[00:01.00][00:03.00]今日\n[00:00.00]君\nplain\n",
    );
    expect(result.lines.map((l) => l.startMs)).toEqual([900, 2900, -100, null]);
    expect(result.lines[0].units).toEqual([]);
    expect(result.metadata.offset).toBeUndefined();
  });
  it("round trips exact Japanese text, spaces, metadata and the terminal boundary", () => {
    const input =
      "[ti:test]\n[00:12.340]<00:12.340>今日 <00:12.800>も<00:13.410>\n";
    const project = { ...newProject(), ...importLyrics(input) };
    expect(project.lines[0].text).toBe("今日 も");
    expect(project.lines[0].endMs).toBe(13410);
    expect(exportLyrics(project)).toBe(input);
    expect(validate(project)).toEqual([]);
  });
  it("does not fabricate a missing ending", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[00:00.00]<00:00.00>hello"),
    };
    expect(project.lines[0].endMs).toBeNull();
    expect(() => exportLyrics(project)).toThrow("收尾");
  });
  it("preserves an implicit first unit before the first inline tag", () => {
    const line = importLyrics("[00:01]a<00:02>b<00:03>").lines[0];
    expect(line.units.map((u) => [u.text, u.startMs])).toEqual([
      ["a", 1000],
      ["b", 2000],
    ]);
  });
});

describe("Unicode-safe units", () => {
  it("keeps dakuten, halfwidth kana, emoji and Latin words intact", () => {
    const text = "か\u3099 ｶﾞ👩‍👩‍👧‍👦 I don’t re-enter 世界！";
    const units = tokenize(text);
    expect(units.map((u) => u.text)).toEqual([
      "か\u3099 ",
      "ｶﾞ",
      "👩‍👩‍👧‍👦 ",
      "I ",
      "don’t ",
      "re-enter ",
      "世",
      "界！",
    ]);
    expect(units.map((u) => u.text).join("")).toBe(text);
  });
  it("supports manually grouping Japanese and splitting on real character boundaries", () => {
    const units = tokenize("きゃ今日");
    units[0].startMs = 1000;
    const grouped = mergeUnits(units, 0, 1);
    expect(grouped[0]).toMatchObject({ text: "きゃ", startMs: 1000 });
    expect(
      splitUnit(grouped, 0, 1)
        .slice(0, 2)
        .map((u) => u.startMs),
    ).toEqual([1000, null]);
    expect(() => splitUnit(tokenize("👩‍👩‍👧‍👦a"), 0, 1)).toThrow();
  });
});

describe("editing invariants", () => {
  it("invalidates only changed text and previews cleaning using a copy", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[00:01]<00:01>君<00:02>\n[00:03]<00:03>歌う<00:04>"),
    };
    editLine(project, project.lines[0].id, "きみ");
    expect(project.lines[0].units).toEqual([]);
    expect(project.lines[1].endMs).toBe(4000);
    const cleaned = {
      ...newProject(),
      ...importLyrics("  今日（きょう）\n\n"),
    };
    cleanProject(cleaned, {
      trim: true,
      blanks: true,
      brackets: true,
      find: "",
      replacement: "",
    });
    expect(cleaned.lines.map((l) => l.text)).toEqual(["今日"]);
  });
  it("moves shared boundaries and translates a finished sentence", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[00:01]<00:01>君<00:02>と<00:03>\n[00:05]次"),
    };
    setUnitStart(project, 0, 1, 2300);
    setLineEnd(project, 0, 3300);
    setLineStart(project, 0, 1500);
    expect(project.lines[0].units.map((u) => u.startMs)).toEqual([1500, 2800]);
    expect(project.lines[0].endMs).toBe(3800);
    expect(() => setUnitStart(project, 0, 1, 1499)).toThrow();
    expect(() => setLineStart(project, 0, 4500)).toThrow();
  });
  it("formats rollover exactly and rejects invalid time fields", () => {
    expect(formatTime(60000)).toBe("01:00.000");
    expect(parseTime("01:00.001")).toBe(60001);
    expect(parseTime("00:99.100")).toBeNull();
  });
});
