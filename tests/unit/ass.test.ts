import { describe, expect, it } from "vitest";
import { exportAss, importAss, looksLikeAss } from "../../src/domain/ass";
import { defaultAssStyle, normalizeAssStyle } from "../../src/domain/assStyle";
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

/** Every character one em wide: positions become easy to check by hand. */
const options = {
  style: defaultAssStyle,
  width: 1920,
  height: 1080,
  fill: "kf" as const,
  leadInMs: 800,
  measure: (text: string, em: number) => [...text].length * em,
  emRatio: 1.448,
};
function timedLine(text: string, starts: number[], end: number) {
  const line = newLine(text, starts[0]);
  line.units = tokenize(text);
  line.units.forEach((unit, i) => (unit.syllables[0].startMs = starts[i]));
  line.endMs = end;
  return line;
}
function duet(): ProjectDraft {
  const project = fromLyrics(
    "[ti:Song]\n[00:01]<00:01>詮<00:02>な<00:03>い<00:04>",
  );
  const a = project.parts[0];
  a.name = "A";
  const first = a.lines[0];
  setRuby(first, 0, ["せ", "ん"]);
  first.units[0].syllables[1].startMs = 1500;
  first.units[1].syllables[0].endMs = 2500; // pause before い
  first.translation = "pointless";
  first.roman = "sen nai";
  project.translationLang = "en";
  project.romanLang = "ja-Latn";
  const b = newPart("B", [timedLine("君と", [5000, 6000], 7000)], "#d6457f");
  const all = {
    ...newPart("全员", [timedLine("みんな", [9000, 9300, 9600], 10000)]),
    kind: "group" as const,
  };
  const bg = {
    ...newPart("和声", [timedLine("あ", [1200], 1800)]),
    background: true,
  };
  project.parts.push(b, all, bg);
  return project;
}
const events = (text: string) =>
  text.split("\n").filter((line) => /^(Dialogue|Comment):/.test(line));

describe("ASS export", () => {
  it("writes the rendered layout and the karaoke source in one file", () => {
    const { text } = exportAss(duet(), options);
    expect(looksLikeAss(text)).toBe(true);
    expect(text).toContain("PlayResX: 1920");
    expect(text).toContain(
      "Style: Mako-A,Noto Sans CJK JP,64,&H00D8840B,&H00FFFFFF",
    );
    expect(text).toContain("; mako-part: 全员|group|0|");
    const all = events(text);
    // Main line: left side, 0.8 s lead-in, the ruby base filled across both syllables.
    expect(all).toContain(
      "Dialogue: 1,0:00:00.20,0:00:04.30,Mako-A,A,0,0,0,fx,{\\an1\\pos(120,894)\\fad(150,150)}{\\k80}{\\kf100}詮{\\kf50}な{\\k50}{\\kf100}い",
    );
    // The reading is centered over its base: 詮 is one em of 64/1.448 px.
    const em = 64 / 1.448;
    expect(all).toContain(
      `Dialogue: 2,0:00:00.20,0:00:04.30,Mako-A-Ruby,A,0,0,0,fx,{\\an2\\pos(${Math.round(120 + em / 2)},824)\\fad(150,150)}{\\k80}{\\kf50}せ{\\kf50}ん`,
    );
    // B sings on the right, in the upper row while A still holds the lower one.
    const bLine = all.find(
      (line) => line.includes(",Mako-B,B,") && line.includes(",fx,"),
    )!;
    const bWidth = 2 * em;
    expect(bLine).toContain(`\\pos(${Math.round(1920 - 120 - bWidth)},`);
    expect(
      all.some(
        (line) =>
          line.includes("Mako-全员,全员") &&
          line.includes("\\pos(" + Math.round((1920 - 3 * em) / 2)),
      ),
    ).toBe(true);
    expect(all).toContain(
      "Comment: 0,0:00:01.00,0:00:04.00,Mako-A,A,0,0,0,karaoke,{\\k50}詮|せ{\\k50}#|ん{\\k50}な{\\k50}{\\k100}い",
    );
    expect(
      all.some(
        (line) =>
          line.includes("Mako-Translation,A") && line.endsWith("pointless"),
      ),
    ).toBe(true);
    expect(all.some((line) => line.includes("Mako-和声-Background,和声"))).toBe(
      true,
    );
  });
  it("applies the simple style and the diagonal layout", () => {
    const style = {
      ...defaultAssStyle,
      layout: "diagonal" as const,
      mainSize: 80,
      rubySize: 40,
      outline: 6,
      outlineColor: "#ff0000",
      colorMode: "solid" as const,
      solidColor: "#00ff00",
    };
    const { text } = exportAss(duet(), { ...options, style });
    const styleComment = text
      .split("\n")
      .find((line) => line.startsWith("; mako-style: "))!;
    expect(JSON.parse(styleComment.slice("; mako-style: ".length))).toEqual(
      normalizeAssStyle(style),
    );
    expect(text).toContain(
      "Style: Mako-A,Noto Sans CJK JP,80,&H0000FF00,&H00FFFFFF,&H000000FF,&H64000000,0,0,0,0,100,100,0,0,1,6,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-A-Ruby,Noto Sans CJK JP,40,&H0000FF00,&H00FFFFFF,&H000000FF,&H64000000,0,0,0,0,100,100,0,0,1,4,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-A-Background,Noto Sans CJK JP,55,&H0000FF00,&H00FFFFFF,&H000000FF,&H64000000,0,0,0,0,100,100,0,0,1,4,0,1,0,0,0,1",
    );
    const em = 80 / 1.448;
    const all = events(text);
    const a = all.find(
      (line) => line.includes(",Mako-A,A,") && line.includes(",fx,"),
    )!;
    expect(a).toContain(`\pos(${Math.round(1920 - 120 - 3 * em)},`);
    const b = all.find(
      (line) => line.includes(",Mako-B,B,") && line.includes(",fx,"),
    )!;
    expect(b).toContain("\pos(120,");
    const group = all.find(
      (line) => line.includes(",Mako-全员,全员,") && line.includes(",fx,"),
    )!;
    expect(group).toContain(`\pos(${Math.round(1920 - 120 - 3 * em)},`);
    expect(importAss(text).assStyle).toEqual(normalizeAssStyle(style));
  });
  it("applies per-layer bold, colors, unsung color and independent roman size", () => {
    const style = {
      ...defaultAssStyle,
      mainBold: true,
      rubyBold: true,
      rubyColor: "#abcdef",
      romanSize: 40,
      romanBold: true,
      romanColor: "#123456",
      unsungColor: "#112233",
    };
    const { text } = exportAss(duet(), { ...options, style });
    expect(text).toContain(
      "Style: Mako-A,Noto Sans CJK JP,64,&H00D8840B,&H00332211,&H00202020,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-A-Ruby,Noto Sans CJK JP,30,&H00EFCDAB,&H00332211,&H00202020,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-A-Background,Noto Sans CJK JP,44,&H00D8840B,&H00332211,&H00202020,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-Romaji,Noto Sans CJK JP,40,&H00563412,&H00332211,&H00202020,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,1,0,0,0,1",
    );
    expect(text).toContain(
      "Style: Mako-Translation,Noto Sans CJK JP,36,&H00FFFFFF,&H00FFFFFF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,2,0,1,0,0,0,1",
    );
    expect(
      events(text).some(
        (line) => line.includes("Mako-Romaji,A") && line.endsWith("sen nai"),
      ),
    ).toBe(true);
  });
  it("measures every bold layer with the bold weight", () => {
    const calls: [string, boolean | undefined][] = [];
    exportAss(duet(), {
      ...options,
      style: {
        ...defaultAssStyle,
        mainBold: true,
        rubyBold: true,
        romanBold: true,
      },
      measure: (text, em, bold) => {
        calls.push([text, bold]);
        return [...text].length * em;
      },
    });
    expect(calls).toContainEqual(["詮ない", true]);
    expect(calls).toContainEqual(["sen nai", true]);
    expect(calls).toContainEqual(["pointless", false]);
  });
  it("omits the romanization row when the style asks for it", () => {
    const style = { ...defaultAssStyle, includeRoman: false };
    const { text, notices } = exportAss(duet(), { ...options, style });
    expect(text).not.toContain("Mako-Romaji");
    expect(text).not.toContain("sen nai");
    expect(notices.join(" ")).toContain("不含罗马音");
    expect(importAss(text).assStyle?.includeRoman).toBe(false);
  });
  it("centers every line in the single-row preset and warns about overlap", () => {
    const style = { ...defaultAssStyle, layout: "single" as const };
    const { text, notices } = exportAss(duet(), { ...options, style });
    const em = 64 / 1.448;
    const all = events(text);
    for (const [marker, chars] of [
      [",Mako-A,A,", 3],
      [",Mako-B,B,", 2],
      [",Mako-全员,全员,", 3],
    ] as const) {
      const line = all.find(
        (event) => event.includes(marker) && event.includes(",fx,"),
      )!;
      expect(line).toContain(`\pos(${Math.round((1920 - chars * em) / 2)},`);
    }
    expect(notices.join(" ")).toContain("单行版式下可能互相遮挡");
  });
  it("rounds karaoke from absolute times so errors never add up", () => {
    const project = fromLyrics(
      "[00:01.004]<00:01.004>あ<00:01.013>い<00:01.027>う<00:01.041>",
    );
    const { text } = exportAss(project, { ...options, leadInMs: 0 });
    const source = events(text).find((line) => line.startsWith("Comment"))!;
    // 1004→100, 1013→101, 1027→103, 1041→104 (cs): 1 + 2 + 1, not 1 + 1 + 1.
    expect(source.endsWith("{\\k1}あ{\\k2}い{\\k1}う")).toBe(true);
  });
  it("refuses an unfinished part", () => {
    const project = duet();
    project.parts[1].lines[0].endMs = null;
    expect(() => exportAss(project, options)).toThrow("声部「B」");
  });
});

describe("ASS import", () => {
  it("reads this tool's file back: parts, ruby, pauses, translation and romaji", () => {
    const original = duet();
    const back = importAss(exportAss(original, options).text);
    expect(
      back.parts.map((part) => [
        part.name,
        part.kind,
        part.background,
        part.color,
      ]),
    ).toEqual(
      original.parts.map((part) => [
        part.name,
        part.kind,
        part.background,
        part.color,
      ]),
    );
    expect(back.name).toBe("Song");
    expect([back.translationLang, back.romanLang]).toEqual(["en", "ja-Latn"]);
    const first = back.parts[0].lines[0];
    expect(first.text).toBe("詮ない");
    expect(first.units[0]).toMatchObject({ text: "詮", ruby: true });
    expect(syllablesOf(first).map((s) => [s.text, s.startMs, s.endMs])).toEqual(
      [
        ["せ", 1000, null],
        ["ん", 1500, null],
        ["な", 2000, 2500],
        ["い", 3000, null],
      ],
    );
    expect([first.startMs, first.endMs]).toEqual([1000, 4000]);
    expect(first.translation).toBe("pointless");
    expect(first.roman).toBe("sen nai");
    expect(back.parts[3].lines[0].text).toBe("あ");
    for (const part of back.parts)
      expect(validateLines(part.lines)).toEqual([]);
  });
  it("reads plain Aegisub karaoke, skips fx lines and falls back to line timing", () => {
    const aegisub = [
      "[Script Info]",
      "Title: Other",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Comment: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,karaoke,{\\k50}今|きょ{\\k50}#|う{\\k30}も {\\k70}Hello",
      "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,fx,{\\pos(1,1)}rendered",
      "Dialogue: 0,0:00:04.00,0:00:05.00,Alt,,0,0,0,,{\\k100}次",
    ].join("\n");
    const back = importAss(aegisub);
    expect(back.parts.map((part) => part.name)).toEqual(["Default", "Alt"]);
    expect(back.assStyle).toBeNull();
    const line = back.parts[0].lines[0];
    expect(line.text).toBe("今も Hello");
    expect(syllablesOf(line).map((s) => [s.text, s.startMs])).toEqual([
      ["きょ", 1000],
      ["う", 1500],
      ["も ", 2000],
      ["Hello", 2300],
    ]);
    expect(line.endMs).toBe(3000);
    const plain = importAss(
      "[Script Info]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}Hi, there",
    );
    expect(plain.parts[0].lines[0]).toMatchObject({
      text: "Hi, there",
      startMs: 1000,
      endMs: 2500,
      units: [],
    });
    expect(plain.notices.join("")).toContain("逐行");
  });
});
