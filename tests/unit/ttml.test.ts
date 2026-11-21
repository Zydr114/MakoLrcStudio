import { describe, expect, it } from "vitest";
import {
  DOMImplementation,
  DOMParser,
  XMLSerializer,
  type Element as XmlElement,
} from "@xmldom/xmldom";
import { TTMLGenerator, TTMLParser } from "@applemusic-like-lyrics/ttml";
import { exportTtml, importTtml, looksLikeTtml } from "../../src/domain/ttml";
import {
  newLine,
  newPart,
  newProject,
  syllablesOf,
  validateLines,
  type ProjectDraft,
} from "../../src/domain/model";
import { readBackup } from "../../src/domain/backup";
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
  it("writes each romanization once when only one of main and x-bg is word-timed", () => {
    const project = duet();
    const bg = project.parts[3];
    bg.lines = [bg.lines[0]];
    bg.lines[0].roman = "a";
    // Main word-timed, background line-timed.
    let line = TTMLParser.parse(exportTtml(project, { dom }).text, parser)
      .lines[0];
    expect(line.romanizations?.map((r) => r.text)).toEqual(["sen nai"]);
    expect(line.backgroundVocal?.romanizations?.map((r) => r.text)).toEqual([
      "a",
    ]);
    // Main line-timed, background word-timed.
    project.parts[0].lines[0].units.forEach((unit) => delete unit.roman);
    bg.lines[0].units[0].roman = "a";
    const { text } = exportTtml(project, { dom });
    line = TTMLParser.parse(text, parser).lines[0];
    expect(line.romanizations?.map((r) => r.text)).toEqual(["sen nai"]);
    expect(line.backgroundVocal?.romanizations?.map((r) => r.text)).toEqual([
      "a",
    ]);
    expect(importTtml(text, parser).notices).toEqual([]);
  });
  it("spells word romanization like the line romanization", () => {
    const project = duet();
    const first = project.parts[0].lines[0];
    first.roman = "Sen, nai!";
    let out = exportTtml(project, { dom });
    let roman = TTMLParser.parse(out.text, parser).lines[0].romanizations![0];
    expect(roman.text).toBe("Sen, nai!");
    expect(roman.words?.map((w) => w.text)).toEqual(["Sen,", "na", "i!"]);
    expect(out.notices.join("")).not.toContain("罗马音");
    // Letters no unit covers: the line romanization wins, untimed.
    first.roman = "sen wa nai";
    out = exportTtml(project, { dom });
    roman = TTMLParser.parse(out.text, parser).lines[0].romanizations![0];
    expect(roman.text).toBe("sen wa nai");
    expect(roman.words).toBeUndefined();
    expect(out.notices.join("")).toContain(
      "1 行的逐字罗马音与整行罗马音对不上",
    );
  });
  it("folds ruby for players without it and refuses unfinished parts", () => {
    const project = duet();
    expect(exportTtml(project, { dom, rubyMode: "fold" }).text).not.toContain(
      "tts:ruby",
    );
    expect(exportTtml(project, { dom, foldRuby: true }).text).not.toContain(
      "tts:ruby",
    );
    project.parts[1].lines[0].endMs = null;
    expect(() => exportTtml(project, { dom })).toThrow("声部「B」");
  });
  it("writes W3C TTML2 namespaces, clock-time expressions, required xml:lang and valid time containment", () => {
    const TT = "http://www.w3.org/ns/ttml";
    const ITUNES = "http://music.apple.com/lyric-ttml-internal";
    const XML = "http://www.w3.org/XML/1998/namespace";
    const CLOCK = /^\d{2,}:[0-5]\d:[0-5]\d\.\d{3}$/;

    const project = duet();
    // Add an over-1-hour line so HH:MM:SS.fff hour rollover is exercised.
    project.parts[0].lines.push(timedLine("光", [3661234], 3662500));
    const { text } = exportTtml(project, { dom });
    expect(text).not.toContain('xmlns=""');
    expect(text).toContain('begin="01:01:01.234"');
    expect(text).toContain('dur="01:01:02.500"');

    const doc = new DOMParser().parseFromString(text, "application/xml");
    expect(doc.documentElement?.namespaceURI).toBe(TT);
    expect(doc.getElementsByTagNameNS(TT, "head").length).toBe(1);
    expect(doc.getElementsByTagNameNS(TT, "body").length).toBe(1);
    expect(doc.getElementsByTagNameNS(TT, "p").length).toBe(5);
    const itunes = doc.getElementsByTagName("iTunesMetadata")[0];
    expect(itunes?.namespaceURI).toBe(ITUNES);
    expect(itunes?.getElementsByTagName("span")[0]?.namespaceURI).toBe(ITUNES);

    for (const el of Array.from(doc.getElementsByTagName("*"))) {
      for (const attr of ["begin", "end", "dur"]) {
        const value = el.getAttribute(attr);
        if (value) expect(value).toMatch(CLOCK);
      }
    }

    // Unknown script still emits required xml:lang="" and an early 0ms
    // background vocal keeps div/p temporal containment and its own begin/end.
    const edgeMain = newPart("主唱", [
      timedLine("Д", [1000], 1500),
      timedLine("М", [2000], 4000),
    ]);
    const edgeBg = {
      ...newPart("和声", [timedLine("123", [0], 4000)]),
      background: true,
    };
    const edgeProject: ProjectDraft = {
      ...newProject(),
      parts: [edgeMain, edgeBg],
      mainPartId: edgeMain.id,
      activePartId: edgeMain.id,
    };
    const edgeXml = exportTtml(edgeProject, { dom }).text;
    const edgeDoc = new DOMParser().parseFromString(edgeXml, "application/xml");
    expect(edgeDoc.documentElement?.hasAttributeNS(XML, "lang")).toBe(true);
    expect(edgeDoc.documentElement?.getAttributeNS(XML, "lang")).toBe("");
    const div = edgeDoc.getElementsByTagNameNS(TT, "div")[0];
    const ps = Array.from(edgeDoc.getElementsByTagNameNS(TT, "p"));
    expect(div.getAttribute("begin")).toBe("00:00:00.000");
    expect(div.getAttribute("end")).toBe("00:00:04.000");
    expect(ps.map((p) => p.getAttribute("begin"))).toEqual([
      "00:00:00.000",
      "00:00:01.000",
    ]);
    const bgSpan = Array.from(edgeDoc.getElementsByTagNameNS(TT, "span")).find(
      (s) => s.getAttribute("ttm:role") === "x-bg",
    );
    expect(bgSpan?.getAttribute("begin")).toBe("00:00:00.000");
    expect(bgSpan?.getAttribute("end")).toBe("00:00:04.000");
  });
  it("writes W3C TTML2 §10.2.35 compliant ruby in ttml2 mode", () => {
    const TT = "http://www.w3.org/ns/ttml";
    const TTS = "http://www.w3.org/ns/ttml#styling";
    const childElements = (el: XmlElement) =>
      Array.from(el.childNodes).filter(
        (n): n is XmlElement => n.nodeType === 1,
      );
    const project = duet();
    // Single-syllable ruby alongside multi-syllable ruby (詮 -> せ・ん) and bg ruby.
    const single = timedLine("雪", [7500], 8500);
    setRuby(single, 0, ["ゆき"]);
    project.parts[1].lines.push(single);
    setRuby(project.parts[3].lines[0], 0, ["あ", "ぁ"]);
    project.parts[3].lines[0].units[0].syllables[1].startMs = 2000;

    const { text } = exportTtml(project, { dom, rubyMode: "ttml2" });
    expect(text).not.toContain('tts:ruby="textContainer"');
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const containers = Array.from(
      doc.getElementsByTagNameNS(TT, "span"),
    ).filter((el) => el.getAttributeNS(TTS, "ruby") === "container");
    expect(containers.length).toBe(3);
    for (const container of containers) {
      expect(
        childElements(container).map((c) => c.getAttributeNS(TTS, "ruby")),
      ).toEqual(["base", "text"]);
    }
    // Multi-syllable ruby puts timings on plain inner spans inside tts:ruby="text".
    const multiText = childElements(containers[0])[1];
    const pieces = childElements(multiText);
    expect(
      pieces.map((p) => [
        p.hasAttributeNS(TTS, "ruby"),
        p.getAttribute("begin"),
        p.getAttribute("end"),
        p.textContent,
      ]),
    ).toEqual([
      [false, "00:00:01.000", "00:00:02.000", "せ"],
      [false, "00:00:02.000", "00:00:03.000", "ん"],
    ]);
    // Single-syllable ruby puts timing directly on tts:ruby="text".
    const singleText = childElements(containers[2])[1];
    expect([
      singleText.getAttribute("begin"),
      singleText.getAttribute("end"),
      singleText.textContent,
    ]).toEqual(["00:00:07.500", "00:00:08.500", "ゆき"]);
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
  it("puts romanized words on the units they overlap", () => {
    const text = new TTMLGenerator(dom).generate({
      metadata: { agents: { v1: { id: "v1", type: "person" } } },
      lines: [
        {
          text: "君と歌う",
          startTime: 1000,
          endTime: 3000,
          agentId: "v1",
          words: [
            { text: "君と", startTime: 1000, endTime: 2000 },
            { text: "歌う", startTime: 2000, endTime: 3000 },
          ],
          romanizations: [
            {
              language: "ja-Latn",
              text: "kimi to utau",
              words: [
                {
                  text: "kimi",
                  startTime: 1000,
                  endTime: 1500,
                  endsWithSpace: true,
                },
                {
                  text: "to",
                  startTime: 1500,
                  endTime: 2000,
                  endsWithSpace: true,
                },
                { text: "utau", startTime: 2001, endTime: 3000 },
              ],
            },
          ],
        },
      ],
    });
    const line = importTtml(text, parser).parts[0].lines[0];
    expect(line.roman).toBe("kimi to utau");
    expect(line.units.map((unit) => unit.roman)).toEqual(["kimi to", "utau"]);
  });
  it("keeps the head metadata and follows edited title and artists", () => {
    const source = new TTMLGenerator(dom).generate({
      metadata: {
        agents: { v1: { id: "v1", type: "person" } },
        title: ["歌", "Song"],
        artist: ["A", "B"],
        album: ["Album"],
        isrc: ["JPXX01234567"],
        songwriters: ["W"],
        authorIds: ["42"],
        authorNames: ["mako"],
        platformIds: { ncmMusicId: ["1001"] },
        rawProperties: { custom: ["x", "y"] },
      },
      lines: [
        {
          text: "one",
          startTime: 1000,
          endTime: 2000,
          agentId: "v1",
          words: [{ text: "one", startTime: 1000, endTime: 2000 }],
        },
      ],
    });
    const back = importTtml(source, parser);
    expect(back.metadata).toEqual({ ti: "歌", ar: "A / B", al: "Album" });
    const project: ProjectDraft = {
      ...newProject(),
      parts: back.parts,
      mainPartId: back.parts[0].id,
      activePartId: back.parts[0].id,
      name: back.name!,
      metadata: back.metadata,
      ttmlMetadata: readBackup(
        JSON.stringify({ ...newProject(), ttmlMetadata: back.ttmlMetadata }),
      ).ttmlMetadata,
    };
    const meta = () =>
      TTMLParser.parse(exportTtml(project, { dom }).text, parser).metadata;
    expect(meta()).toMatchObject({
      title: ["歌", "Song"],
      artist: ["A", "B"],
      album: ["Album"],
      isrc: ["JPXX01234567"],
      songwriters: ["W"],
      authorIds: ["42"],
      authorNames: ["mako"],
      platformIds: { ncmMusicId: ["1001"] },
      rawProperties: { custom: ["x", "y"] },
    });
    project.metadata = { ti: "新歌", ar: "C / D" };
    expect(meta()).toMatchObject({
      title: ["新歌", "Song"],
      artist: ["C", "D"],
      album: [],
    });
    // The placeholder project name is not a title.
    const fresh = { ...newProject(), parts: back.parts };
    fresh.mainPartId = fresh.activePartId = back.parts[0].id;
    expect(
      TTMLParser.parse(exportTtml(fresh, { dom }).text, parser).metadata.title,
    ).toEqual([]);
    // Backups drop malformed lists instead of failing.
    expect(
      readBackup(
        JSON.stringify({
          ...newProject(),
          ttmlMetadata: { isrc: ["", 3, "I"], bad: "x" },
        }),
      ).ttmlMetadata,
    ).toEqual({ isrc: ["I"] });
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
  it("names the parts whose lines overlap, as Apple Music files allow", () => {
    const text = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:03.000" ttm:agent="v1">one</p><p begin="00:02.000" end="00:04.000" ttm:agent="v1">two</p></div></body></tt>`;
    const [notice] = importTtml(text, parser).notices;
    expect(notice).toContain("「主唱」1 行与相邻行重叠");
    expect(notice).toContain("Apple Music");
  });
});
