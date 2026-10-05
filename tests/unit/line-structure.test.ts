import { describe, expect, it } from "vitest";
import { splitLine } from "../../src/domain/edit";
import { newProject, validate } from "../../src/domain/model";
import { importLyrics } from "../../src/domain/lrc";
import { splitTokenAt } from "../../src/domain/segmentation";
const project = (text: string) => ({ ...newProject(), ...importLyrics(text) });
describe("caret based structural changes", () => {
  it("splits at a measured shared boundary and retains units, ids and the old terminal", () => {
    const p = project(
      "[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]<00:06>次<00:07>",
    );
    const ids = p.lines[0].units.map((u) => u.id),
      next = structuredClone(p.lines[1]);
    splitLine(p, p.lines[0].id, 1);
    expect(p.lines.map((l) => [l.text, l.startMs, l.endMs])).toEqual([
      ["今", 1000, 2000],
      ["日も", 2000, 4000],
      ["次", 6000, 7000],
    ]);
    expect(p.lines[0].units[0].id).toBe(ids[0]);
    expect(p.lines[1].units.map((u) => u.id)).toEqual(ids.slice(1));
    expect(p.lines[2]).toEqual(next);
    expect(validate(p)).toEqual([]);
  });
  it("splits inside a repeated token without guessing onset or terminal and preserves later anchors", () => {
    const p = project("[00:01]<00:01>らら<00:03>ら<00:04>");
    const laterId = p.lines[0].units[1].id;
    splitLine(p, p.lines[0].id, 1);
    expect(p.lines[0]).toMatchObject({
      text: "ら",
      startMs: 1000,
      endMs: null,
    });
    expect(p.lines[1]).toMatchObject({
      text: "らら",
      startMs: null,
      endMs: 4000,
    });
    expect(p.lines[1].units.map((u) => u.startMs)).toEqual([null, 3000]);
    expect(p.lines[1].units[1].id).toBe(laterId);
    expect(validate(p).filter((issue) => issue.kind === "conflict")).toEqual(
      [],
    );
  });
  it("splits a grouped word at a caret and keeps all subsequent timestamps", () => {
    const p = project("[00:01]<00:01>今日<00:03>も<00:04>"),
      line = p.lines[0];
    line.units = splitTokenAt(line, 1);
    expect(line.units.map((u) => [u.text, u.startMs])).toEqual([
      ["今", 1000],
      ["日", null],
      ["も", 3000],
    ]);
    expect(line.endMs).toBe(4000);
    expect(() => splitTokenAt(line, 1)).toThrow("已有分隔线");
  });
  it("keeps Latin word timing when a caret is immediately before a separating space", () => {
    const p = project("[00:01]<00:01>hello <00:02>world<00:03>");
    const worldId = p.lines[0].units[1].id;
    splitLine(p, p.lines[0].id, 5);
    expect(p.lines.map((line) => line.text)).toEqual(["hello", " world"]);
    expect(p.lines[1].units[0]).toMatchObject({
      id: worldId,
      text: " world",
      startMs: 2000,
    });
    expect(p.lines[0].endMs).toBe(2000);
    expect(validate(p)).toEqual([]);
  });
  it("rejects grapheme interiors, whitespace-only sentences and edge offsets without changes", () => {
    const p = project("[00:01]か\u3099 今日"),
      before = structuredClone(p);
    for (const offset of [0, 1, p.lines[0].text.length])
      expect(() => splitLine(p, p.lines[0].id, offset)).toThrow();
    expect(p).toEqual(before);
    const blank = project("[00:01] 今日");
    expect(() => splitLine(blank, blank.lines[0].id, 1)).toThrow("正文");
  });
});
