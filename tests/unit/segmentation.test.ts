import { describe, it, expect } from "vitest";
import { importLyrics } from "../../src/domain/lrc";
import {
  characterGaps,
  unitCuts,
  resegmentLine,
  segmentationSummary,
} from "../../src/domain/segmentation";
describe("text-position segmentation", () => {
  it("merges and splits without inventing timing, preserving terminal and neighboring anchors", () => {
    const line = importLyrics("[00:01]<00:01>今<00:02>日<00:03>も<00:04>")
      .lines[0];
    const ids = line.units.map((unit) => unit.id);
    line.units = resegmentLine(line, [2]);
    expect(line.units.map((unit) => [unit.text, unit.startMs])).toEqual([
      ["今日", 1000],
      ["も", 3000],
    ]);
    expect(line.units.map((unit) => unit.id)).toEqual([ids[0], ids[2]]);
    line.units = resegmentLine(line, [1, 2]);
    expect(line.units.map((unit) => unit.startMs)).toEqual([1000, null, 3000]);
    expect(line.endMs).toBe(4000);
    expect(segmentationSummary(line, [2])).toEqual({
      count: 2,
      retained: 2,
      addedMissing: 0,
    });
  });
  it("moves one divider and preserves times only at unchanged text origins", () => {
    const line = importLyrics("[00:01]<00:01>今<00:02>日も<00:03>君<00:04>")
      .lines[0];
    expect(unitCuts(line)).toEqual([1, 3]);
    expect(segmentationSummary(line, [2, 3])).toEqual({
      count: 3,
      retained: 2,
      addedMissing: 1,
    });
    expect(
      resegmentLine(line, [2, 3]).map((unit) => [unit.text, unit.startMs]),
    ).toEqual([
      ["今日", 1000],
      ["も", null],
      ["君", 3000],
    ]);
  });
  it("does not confuse repeated characters and respects grapheme, emoji and whitespace boundaries", () => {
    const line = importLyrics("[00:01]<00:01>ら<00:02>ら<00:03>ら<00:04>")
      .lines[0];
    expect(resegmentLine(line, [2]).map((unit) => unit.startMs)).toEqual([
      1000, 3000,
    ]);
    expect(characterGaps("か\u3099ｶﾞ👩‍👩‍👧‍👦a")).toEqual([2, 4, 15]);
    const complex = { ...line, text: "か\u3099 今日", units: [] };
    expect(() => resegmentLine(complex, [1])).toThrow("完整字符");
    expect(() => resegmentLine(complex, [2, 3])).toThrow("空白");
    expect(() => resegmentLine(line, [2, 1])).toThrow("交叉");
  });
});
