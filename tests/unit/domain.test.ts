import { describe, it, expect } from "vitest";
import {
  newProject,
  parseTime,
  formatTime,
  validate,
} from "../../src/domain/model";
import { importLyrics, exportLyrics } from "../../src/domain/lrc";
import { tokenize, splitUnit, mergeUnits } from "../../src/domain/tokenize";
import { readBackup } from "../../src/domain/backup";
import {
  editLine,
  cleanProject,
  setUnitStart,
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
  it("keeps a line end between its own start and the next line start", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[00:01]今日\n[00:06]次"),
    };
    setLineEnd(project, 0, 6000);
    expect(project.lines[0].endMs).toBe(6000);
    expect(validate(project, false)).toEqual([]);
    expect(() => setLineEnd(project, 0, 6001)).toThrow("相邻边界");
    expect(() => setLineEnd(project, 0, 1000)).toThrow("相邻边界");
    const last = {
      ...newProject(),
      ...importLyrics("[00:01]今日"),
      audio: { name: "x", size: 1, hash: "a".repeat(64), durationMs: 4000 },
    };
    setLineEnd(last, 0, 4000);
    expect(last.lines[0].endMs).toBe(4000);
    expect(() => setLineEnd(last, 0, 4001)).toThrow("相邻边界");
  });
  it("moves only the line start, keeping later units and the end in place", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[00:01]<00:01>今<00:02>日<00:03>\n[00:06]次"),
    };
    setLineStartBoundary(project, 0, 1500);
    expect(project.lines[0].startMs).toBe(1500);
    expect(project.lines[0].units.map((u) => u.startMs)).toEqual([1500, 2000]);
    expect(project.lines[0].endMs).toBe(3000);
    expect(validate(project, false)).toEqual([]);
    expect(() => setLineStartBoundary(project, 0, 2000)).toThrow("相邻边界");
    expect(() => setLineStartBoundary(project, 0, -1)).toThrow("相邻边界");
    setLineStart(project, 0, 2000);
    expect(project.lines[0].units.map((u) => u.startMs)).toEqual([2000, 2500]);
    expect(project.lines[0].endMs).toBe(3500);
  });
  it("formats rollover exactly and rejects invalid time fields", () => {
    expect(formatTime(60000)).toBe("01:00.000");
    expect(parseTime("01:00.001")).toBe(60001);
    expect(parseTime("00:99.100")).toBeNull();
  });

  it("rejects splitting a combining character and preserves the first onset when splitting lines", () => {
    const project = { ...newProject(), ...importLyrics("[00:01]か\u3099今日") };
    expect(() => splitLine(project, project.lines[0].id, 1)).toThrow(
      "完整字符",
    );
    splitLine(project, project.lines[0].id, 2);
    expect(project.lines.map((line) => [line.text, line.startMs])).toEqual([
      ["か\u3099", 1000],
      ["今日", null],
    ]);
  });
  it("preserves unfinished drafts but rejects corrupt identities and incompatible backup versions", () => {
    const project = { ...newProject(), ...importLyrics("[00:01]今日") };
    project.activeLineId = project.lines[0].id;
    expect(readBackup(JSON.stringify(project)).lines[0].endMs).toBeNull();
    expect(() =>
      readBackup(JSON.stringify({ ...project, version: 99 })),
    ).toThrow();
    project.lines.push({ ...project.lines[0] });
    expect(() => readBackup(JSON.stringify(project))).toThrow();
  });
  it("reports conflicting translations, out of range offsets, newline text and missing endings", () => {
    const project = {
      ...newProject(),
      ...importLyrics("[offset:2000]\n[00:01]今日\n[00:01]translation"),
    };
    expect(
      validate(project).some((issue) => issue.message.includes("音频范围")),
    ).toBe(true);
    expect(
      validate(project).some((issue) => issue.message.includes("翻译")),
    ).toBe(true);
    project.lines[0].text = "line\nbreak";
    expect(
      validate(project).some((issue) => issue.message.includes("换行")),
    ).toBe(true);
    const invalid = importLyrics("[offset:wrong]\n[00:01]歌");
    expect(invalid.metadata.offset).toBeUndefined();
    expect(invalid.notices.join("")).toContain("已忽略");
    expect(invalid.lines[0].startMs).toBe(1000);
  });
});
