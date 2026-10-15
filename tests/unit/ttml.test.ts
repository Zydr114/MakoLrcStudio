import { describe, expect, it } from "vitest";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { TTMLParser } from "@applemusic-like-lyrics/ttml";
import { exportTtml, importTtml, looksLikeTtml } from "../../src/domain/ttml";
import {
  newLine,
  newPart,
  syllablesOf,
  validateLines,
  type ProjectDraft,
} from "../../src/domain/model";
import { setRuby } from "../../src/domain/ruby";
import { tokenize } from "../../src/domain/tokenize";
import { fromLyrics } from "./helpers";

const dom = {
  domImplementation: new DOMImplementation() as never,
  xmlSerializer: new XMLSerializer() as never,
};
const parser = {
  domParser: new DOMParser() as never,
  xmlSerializer: new XMLSerializer() as never,
};

/** A line whose units each start at the given times, ending at `end`. */
function timedLine(text: string, starts: number[], end: number) {
  const line = newLine(text, starts[0]);
  line.units = tokenize(text);
  line.units.forEach((unit, i) => (unit.syllables[0].startMs = starts[i]));
  line.endMs = end;
  return line;
}

function duet(): ProjectDraft {
  const project = fromLyrics(
    "[ti:Song]\n[ar:Singer]\n[00:01]<00:01>詮<00:03>な<00:04>い<00:05>\n[00:09]<00:09>Hello <00:10>world<00:11>",
  );
  const main = project.parts[0];
  main.name = "A";
  const first = main.lines[0];
  setRuby(first, 0, ["せ", "ん"]);
  first.units[0].syllables[1].startMs = 2000;
  first.units[1].syllables[0].endMs = 3500; // な pauses before い
  first.translation = "pointless";
  first.roman = "sen nai";
  first.units[0].roman = "sen";
  first.units[1].roman = "na";
  first.units[2].roman = "i";
  project.translationLang = "en";
  project.romanLang = "ja-Latn";
  const b = newPart("B", [timedLine("君と", [5000, 6000], 7000)], "#d6457f");
  const all = {
    ...newPart("合唱", [timedLine("みんな", [12000, 12300, 12600], 13000)]),
    kind: "group" as const,
  };
  const bg = {
    ...newPart("和声", [
      timedLine("あ", [1500], 2500),
      timedLine("う", [2600], 2900),
    ]),
    background: true,
  };
  project.parts.push(b, all, bg);
  return project;
}

describe("TTML export", () => {
  it("writes agents, x-bg, timed ruby, pauses, translation and word romanization", () => {
    const { text, notices } = exportTtml(duet(), { dom });
    expect(looksLikeTtml(text)).toBe(true);
    expect(text).toContain('ttm:agent="v1"');
    expect(text).toContain('ttm:agent="v2"');
    expect(text).toContain('ttm:agent="v1000"');
    expect(text).toContain('tts:ruby="container"');
    expect(notices.join("")).toContain("合并");
    const parsed = TTMLParser.parse(text, parser);
    expect(parsed.metadata.agents).toMatchObject({
      v1: { name: "A", type: "person" },
      v2: { name: "B", type: "person" },
      v1000: { name: "合唱", type: "group" },
    });
    expect(parsed.metadata.title).toEqual(["Song"]);
    const [first, second, third, fourth] = parsed.lines;
    expect(parsed.lines.map((line) => line.agentId)).toEqual([
      "v1",
      "v2",
      "v1",
      "v1000",
    ]);
    // The line widens to hold its background vocal (1500 → 2900).
    expect([first.startTime, first.endTime]).toEqual([1000, 5000]);
    expect(first.words?.map((w) => [w.text, w.startTime, w.endTime])).toEqual([
      ["詮", 1000, 3000],
      ["な", 3000, 3500],
      ["い", 4000, 5000],
    ]);
    expect(first.words?.[0].ruby).toEqual([
      { text: "せ", startTime: 1000, endTime: 2000 },
      { text: "ん", startTime: 2000, endTime: 3000 },
    ]);
    expect(first.translations).toMatchObject([
      { language: "en", text: "pointless" },
    ]);
    expect(first.romanizations?.[0]).toMatchObject({ language: "ja-Latn" });
    expect(first.romanizations?.[0].words?.map((w) => w.text)).toEqual([
      "sen",
      "na",
      "i",
    ]);
    expect(first.backgroundVocal?.words?.map((w) => w.text)).toEqual([
      "あ",
      "う",
    ]);
    expect(second.words?.map((w) => w.text)).toEqual(["君", "と"]);
    expect(third.words?.map((w) => [w.text, w.endsWithSpace])).toEqual([
      ["Hello", true],
      ["world", false],
    ]);
    expect(fourth.text).toBe("みんな");
  });
  it("folds ruby for players without it and refuses unfinished parts", () => {
    const project = duet();
    const { text } = exportTtml(project, { dom, foldRuby: true });
    expect(text).not.toContain("tts:ruby");
    project.parts[1].lines[0].endMs = null;
    expect(() => exportTtml(project, { dom })).toThrow("声部「B」");
  });
  it("rejects two background parts on one main line", () => {
    const project = duet();
    project.parts.push({
      ...newPart("和声 2", [timedLine("お", [3000], 3200)]),
      background: true,
    });
    expect(() => exportTtml(project, { dom })).toThrow("每行只能有一个和声");
  });
});

describe("TTML import", () => {
  it("round-trips parts, ruby, pauses, translation and word romanization", () => {
    const original = duet();
    const back = importTtml(exportTtml(original, { dom }).text, parser);
    expect(
      back.parts.map((part) => [part.name, part.kind, part.background]),
    ).toEqual([
      ["A", "person", false],
      ["B", "person", false],
      ["合唱", "group", false],
      ["和声", "person", true],
    ]);
    expect(back.metadata).toEqual({ ti: "Song", ar: "Singer" });
    expect([back.translationLang, back.romanLang]).toEqual(["en", "ja-Latn"]);
    const [a, b, group, bg] = back.parts;
    const first = a.lines[0];
    expect(first.text).toBe("詮ない");
    expect([first.startMs, first.endMs]).toEqual([1000, 5000]);
    expect(first.units[0]).toMatchObject({ text: "詮", ruby: true });
    expect(syllablesOf(first).map((s) => [s.text, s.startMs, s.endMs])).toEqual(
      [
        ["せ", 1000, null],
        ["ん", 2000, null],
        ["な", 3000, 3500],
        ["い", 4000, null],
      ],
    );
    expect(first.translation).toBe("pointless");
    expect(first.roman).toBe("sen nai");
    expect(first.units.map((unit) => unit.roman)).toEqual(["sen", "na", "i"]);
    expect(a.lines[1].text).toBe("Hello world");
    expect(b.lines[0].text).toBe("君と");
    expect(group.lines[0].text).toBe("みんな");
    // Two background lines on one main line come back as one.
    expect(bg.lines.map((line) => line.text)).toEqual(["あ う"]);
    for (const part of back.parts)
      expect(validateLines(part.lines)).toEqual([]);
    expect(back.notices).toEqual([]);
  });
  it("names unnamed AMLL agents and reads line-timed files", () => {
    const text = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal"><head><metadata><ttm:agent type="person" xml:id="v1"/><ttm:agent type="person" xml:id="v2"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1">one</p><p begin="00:03.000" end="00:04.000" ttm:agent="v2">two</p></div></body></tt>`;
    const back = importTtml(text, parser);
    expect(back.parts.map((part) => part.name)).toEqual(["主唱", "演唱者 2"]);
    expect(back.parts[1].lines[0]).toMatchObject({
      text: "two",
      startMs: 3000,
      endMs: 4000,
      units: [],
    });
    expect(() => importTtml("<tt><body>", parser)).toThrow("TTML");
  });
});
