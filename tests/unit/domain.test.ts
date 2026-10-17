import { describe, it, expect } from "vitest";
import {
  activeLines,
  parseTime,
  formatTime,
  formatClock,
  unitStart,
  validate,
} from "../../src/domain/model";
import { fromLyrics } from "./helpers";
import { importLyrics, exportLyrics } from "../../src/domain/lrc";
import { tokenize, splitUnit, mergeUnits } from "../../src/domain/tokenize";
import { readBackup } from "../../src/domain/backup";
import {
  editLine,
  cleanProject,
  setSyllableStart,
  setLineStart,
  setLineStartBoundary,
  setLineEnd,
  splitLine,
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
    const project = fromLyrics(input);
    expect(activeLines(project)[0].text).toBe("今日 も");
    expect(activeLines(project)[0].endMs).toBe(13410);
    expect(exportLyrics(project)).toBe(input);
    expect(validate(project)).toEqual([]);
  });
  it("does not fabricate a missing ending", () => {
    const project = fromLyrics("[00:00.00]<00:00.00>hello");
    expect(activeLines(project)[0].endMs).toBeNull();
    expect(() => exportLyrics(project)).toThrow("收尾");
  });
  it("infers a plain LRC ending from the next later onset", () => {
    const result = importLyrics("[00:01]今日\n[00:03]君\n");
    expect(result.lines.map((line) => line.endMs)).toEqual([3000, null]);
    expect(result.lines.map((line) => line.endInferred)).toEqual([
      true,
      undefined,
    ]);
    expect(result.notices.join("")).toContain("补全 1 句");
  });
  it("keeps an explicit enhanced ending and skips equal onsets", () => {
    const explicit = importLyrics("[00:01]<00:01>a<00:02>\n[00:03]b");
    expect(explicit.lines[0].endMs).toBe(2000);
    expect(explicit.lines[0].endInferred).toBeUndefined();
    const equal = importLyrics("[00:01]a\n[00:01]b\n[00:02]c");
    expect(equal.lines.map((line) => line.endMs)).toEqual([2000, 2000, null]);
    expect(equal.lines.every((line) => line.endMs !== 1000)).toBe(true);
  });
  it("infers endings after applying the file offset", () => {
    const result = importLyrics("[offset:100]\n[00:01]a\n[00:03]b");
    expect(result.lines[0].startMs).toBe(900);
    expect(result.lines[0].endMs).toBe(2900);
    expect(result.lines[0].endInferred).toBe(true);
  });
  it("preserves an implicit first unit before the first inline tag", () => {
    const line = importLyrics("[00:01]a<00:02>b<00:03>").lines[0];
    expect(line.units.map((u) => [u.text, unitStart(u)])).toEqual([
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
    units[0].syllables[0].startMs = 1000;
    const grouped = mergeUnits(units, 0, 1);
    expect([grouped[0].text, unitStart(grouped[0])]).toEqual(["きゃ", 1000]);
    expect(
      splitUnit(grouped, 0, 1)
        .slice(0, 2)
        .map((u) => unitStart(u)),
    ).toEqual([1000, null]);
    expect(() => splitUnit(tokenize("👩‍👩‍👧‍👦a"), 0, 1)).toThrow();
  });
});

describe("editing invariants", () => {
  it("invalidates only changed text and previews cleaning using a copy", () => {
    const project = fromLyrics(
      "[00:01]<00:01>君<00:02>\n[00:03]<00:03>歌う<00:04>",
    );
    editLine(project, activeLines(project)[0].id, "きみ");
    expect(activeLines(project)[0].units).toEqual([]);
    expect(activeLines(project)[1].endMs).toBe(4000);
    const cleaned = fromLyrics("  今日（きょう）\n\n");
    cleanProject(cleaned, {
      trim: true,
      blanks: true,
      brackets: true,
      find: "",
      replacement: "",
    });
    expect(activeLines(cleaned).map((l) => l.text)).toEqual(["今日"]);
  });
  it("moves shared boundaries and translates a finished sentence", () => {
    const project = fromLyrics("[00:01]<00:01>君<00:02>と<00:03>\n[00:05]次");
    setSyllableStart(project, 0, 1, 2300);
    setLineEnd(project, 0, 3300);
    setLineStart(project, 0, 1500);
    expect(activeLines(project)[0].units.map((u) => unitStart(u))).toEqual([
      1500, 2800,
    ]);
    expect(activeLines(project)[0].endMs).toBe(3800);
    expect(() => setSyllableStart(project, 0, 1, 1499)).toThrow();
    expect(() => setLineStart(project, 0, 4500)).toThrow();
  });
  it("keeps a line end between its own start and the next line start", () => {
    const project = fromLyrics("[00:01]今日\n[00:06]次");
    setLineEnd(project, 0, 6000);
    expect(activeLines(project)[0].endMs).toBe(6000);
    expect(validate(project, false)).toEqual([]);
    expect(() => setLineEnd(project, 0, 6001)).toThrow("相邻边界");
    expect(() => setLineEnd(project, 0, 1000)).toThrow("相邻边界");
    const last = {
      ...fromLyrics("[00:01]今日"),
      audio: { name: "x", size: 1, hash: "a".repeat(64), durationMs: 4000 },
    };
    setLineEnd(last, 0, 4000);
    expect(activeLines(last)[0].endMs).toBe(4000);
    expect(() => setLineEnd(last, 0, 4001)).toThrow("相邻边界");
  });
  it("moves only the line start, keeping later units and the end in place", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>日<00:03>\n[00:06]次");
    setLineStartBoundary(project, 0, 1500);
    expect(activeLines(project)[0].startMs).toBe(1500);
    expect(activeLines(project)[0].units.map((u) => unitStart(u))).toEqual([
      1500, 2000,
    ]);
    expect(activeLines(project)[0].endMs).toBe(3000);
    expect(validate(project, false)).toEqual([]);
    expect(() => setLineStartBoundary(project, 0, 2000)).toThrow("相邻边界");
    expect(() => setLineStartBoundary(project, 0, -1)).toThrow("相邻边界");
    setLineStart(project, 0, 2000);
    expect(activeLines(project)[0].units.map((u) => unitStart(u))).toEqual([
      2000, 2500,
    ]);
    expect(activeLines(project)[0].endMs).toBe(3500);
  });
  it("formats rollover exactly and rejects invalid time fields", () => {
    expect(formatTime(60000)).toBe("01:00.000");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(6200)).toBe("00:06");
    expect(formatClock(60000)).toBe("01:00");
    expect(formatClock(3661000)).toBe("1:01:01");
    expect(parseTime("01:00.001")).toBe(60001);
    expect(parseTime("00:99.100")).toBeNull();
  });

  it("rejects splitting a combining character and preserves the first onset when splitting lines", () => {
    const project = fromLyrics("[00:01]か\u3099今日");
    expect(() => splitLine(project, activeLines(project)[0].id, 1)).toThrow(
      "完整字符",
    );
    splitLine(project, activeLines(project)[0].id, 2);
    expect(
      activeLines(project).map((line) => [line.text, line.startMs]),
    ).toEqual([
      ["か\u3099", 1000],
      ["今日", null],
    ]);
  });
  it("preserves unfinished drafts but rejects corrupt identities and incompatible backup versions", () => {
    const project = fromLyrics("[00:01]今日");
    project.activeLineId = activeLines(project)[0].id;
    expect(
      activeLines(readBackup(JSON.stringify(project)))[0].endMs,
    ).toBeNull();
    expect(() =>
      readBackup(JSON.stringify({ ...project, version: 99 })),
    ).toThrow();
    activeLines(project).push({ ...activeLines(project)[0] });
    expect(() => readBackup(JSON.stringify(project))).toThrow();
  });
  it("reports conflicting translations, out of range offsets, newline text and missing endings", () => {
    const project = fromLyrics(
      "[offset:2000]\n[00:01]今日\n[00:01]translation",
    );
    expect(
      validate(project).some((issue) => issue.message.includes("音频范围")),
    ).toBe(true);
    expect(
      validate(project).some((issue) => issue.message.includes("翻译")),
    ).toBe(true);
    activeLines(project)[0].text = "line\nbreak";
    expect(
      validate(project).some((issue) => issue.message.includes("换行")),
    ).toBe(true);
    const invalid = importLyrics("[offset:wrong]\n[00:01]歌");
    expect(invalid.metadata.offset).toBeUndefined();
    expect(invalid.notices.join("")).toContain("已忽略");
    expect(invalid.lines[0].startMs).toBe(1000);
  });
});
