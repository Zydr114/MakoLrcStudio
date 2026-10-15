import { describe, expect, it } from "vitest";
import { splitLine, mergeLines } from "../../src/domain/edit";
import { activeLines, unitStart, validate } from "../../src/domain/model";
import { fromLyrics } from "./helpers";
import { resegmentLine } from "../../src/domain/segmentation";
const project = (text: string) => fromLyrics(text);
describe("caret based structural changes", () => {
  it("splits at a measured shared boundary and retains units, ids and the old terminal", () => {
    const p = project(
      "[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]<00:06>次<00:07>",
    );
    const ids = activeLines(p)[0].units.map((u) => u.id),
      next = structuredClone(activeLines(p)[1]);
    splitLine(p, activeLines(p)[0].id, 1);
    expect(activeLines(p).map((l) => [l.text, l.startMs, l.endMs])).toEqual([
      ["今", 1000, 2000],
      ["日も", 2000, 4000],
      ["次", 6000, 7000],
    ]);
    expect(activeLines(p)[0].units[0].id).toBe(ids[0]);
    expect(activeLines(p)[1].units.map((u) => u.id)).toEqual(ids.slice(1));
    expect(activeLines(p)[2]).toEqual(next);
    expect(validate(p)).toEqual([]);
  });
  it("splits inside a repeated token without guessing onset or terminal and preserves later anchors", () => {
    const p = project("[00:01]<00:01>らら<00:03>ら<00:04>");
    const laterId = activeLines(p)[0].units[1].id;
    splitLine(p, activeLines(p)[0].id, 1);
    expect(activeLines(p)[0]).toMatchObject({
      text: "ら",
      startMs: 1000,
      endMs: null,
    });
    expect(activeLines(p)[1]).toMatchObject({
      text: "らら",
      startMs: null,
      endMs: 4000,
    });
    expect(activeLines(p)[1].units.map((u) => unitStart(u))).toEqual([
      null,
      3000,
    ]);
    expect(activeLines(p)[1].units[1].id).toBe(laterId);
    expect(validate(p).filter((issue) => issue.kind === "conflict")).toEqual(
      [],
    );
  });
  it("splits a grouped word and keeps all subsequent timestamps", () => {
    const p = project("[00:01]<00:01>今日<00:03>も<00:04>"),
      line = activeLines(p)[0];
    line.units = resegmentLine(line, [1, 2]);
    expect(line.units.map((u) => [u.text, unitStart(u)])).toEqual([
      ["今", 1000],
      ["日", null],
      ["も", 3000],
    ]);
    expect(line.endMs).toBe(4000);
  });
  it("keeps Latin word timing when a caret is immediately before a separating space", () => {
    const p = project("[00:01]<00:01>hello <00:02>world<00:03>");
    const worldId = activeLines(p)[0].units[1].id;
    splitLine(p, activeLines(p)[0].id, 5);
    expect(activeLines(p).map((line) => line.text)).toEqual([
      "hello",
      " world",
    ]);
    const world = activeLines(p)[1].units[0];
    expect([world.id, world.text, unitStart(world)]).toEqual([
      worldId,
      " world",
      2000,
    ]);
    expect(world.syllables[0].text).toBe(" world");
    expect(activeLines(p)[0].endMs).toBe(2000);
    expect(validate(p)).toEqual([]);
  });
  it("merging the selected following line keeps a valid shared selection", () => {
    const p = project("[00:01]今\n[00:02]日");
    p.activeLineId = activeLines(p)[1].id;
    mergeLines(p, activeLines(p)[0].id);
    expect(p.activeLineId).toBe(activeLines(p)[0].id);
    expect(activeLines(p)[0].text).toBe("今日");
  });
  it("rejects grapheme interiors, whitespace-only sentences and edge offsets without changes", () => {
    const p = project("[00:01]か\u3099 今日"),
      before = structuredClone(p);
    for (const offset of [0, 1, activeLines(p)[0].text.length])
      expect(() => splitLine(p, activeLines(p)[0].id, offset)).toThrow();
    expect(p).toEqual(before);
    const blank = project("[00:01] 今日");
    expect(() => splitLine(blank, activeLines(blank)[0].id, 1)).toThrow("正文");
  });
});
