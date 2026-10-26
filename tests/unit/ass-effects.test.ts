import { describe, expect, it } from "vitest";
import { exportAss, importAss } from "../../src/domain/ass";
import {
  defaultAssStyle,
  type AssEffectPreset,
} from "../../src/domain/assStyle";
import { fromLyrics } from "./helpers";

const sample = () => {
  const project = fromLyrics("[00:02]<00:02>君<00:02.60>と<00:03.40>");
  project.parts[0].lines[0].translation = "With you";
  project.parts[0].lines[0].roman = "kimi to";
  return project;
};
const options = (preset: AssEffectPreset) => ({
  style: {
    ...defaultAssStyle,
    effects: { preset, intensity: "medium" as const, color: "#ff8800" },
  },
  width: 1920,
  height: 1080,
  fill: "kf" as const,
  leadInMs: 800,
  introHintMs: 0,
  measure: (text: string, em: number) => [...text].length * em,
  emRatio: 1.448,
});

describe("ASS effect presets", () => {
  it.each(["soft", "neon", "outline"] as const)(
    "%s preserves source timing and subline cardinality",
    (preset) => {
      const project = sample();
      const original = exportAss(project, options("none")).text;
      const output = exportAss(project, options(preset)).text;
      const sources = (text: string) =>
        text.split("\n").filter((l) => l.startsWith("Comment:"));
      expect(sources(output)).toEqual(sources(original));
      expect(output).toContain("\\1a&HFF&\\2a&HFF&");
      expect(output).toContain("\\3c&H0088ff&");
      const back = importAss(output);
      expect(back.parts).toHaveLength(1);
      expect(back.parts[0].lines).toHaveLength(1);
      expect(back.parts[0].lines[0]).toMatchObject({
        text: "君と",
        startMs: 2000,
        endMs: 3400,
        translation: "With you",
        roman: "kimi to",
      });
      expect(back.assStyle?.effects).toEqual(options(preset).style.effects);
      expect(
        output
          .split("\n")
          .filter(
            (l) =>
              l.startsWith("Dialogue:") &&
              l.includes(",Mako-Translation,") &&
              !l.includes(",fx,"),
          ),
      ).toHaveLength(1);
    },
  );

  it("lights neon only at the true singing start and scales glow", () => {
    const opts = options("neon");
    expect(exportAss(sample(), opts).text).toContain("\\t(800,1040,\\3a&H30&");
    const small = exportAss(sample(), {
      ...opts,
      height: 720,
      width: 1280,
    }).text;
    expect(small).toContain("\\blur8");
    expect(small).toContain("\\bord4");
  });
});

import {
  applyAssEffects,
  ASS_EFFECT_EVENT_LIMIT,
  ASS_PARTICLE_LIMIT,
} from "../../src/domain/assEffects";
import type { AssOutputEvent } from "../../src/domain/assEvents";
import { setRuby } from "../../src/domain/ruby";
const visualEvent = (start = 1000): AssOutputEvent => ({
  layer: 1,
  start: 200,
  end: 4000,
  style: "Mako-A",
  actor: "A",
  effect: "fx",
  kind: "Dialogue",
  text: "{\\an1\\pos(120,960)\\fad(150,150)}{\\k80}{\\kf60}君",
  visual: {
    role: "main",
    x: 120,
    y: 960,
    width: 60,
    size: 64,
    outline: 3,
    color: "#ffffff",
    partColor: "#0b84d8",
    singStart: start,
    accents: [
      { text: "君", x: 120, y: 960, width: 60, start, end: start + 600 },
    ],
  },
});

describe("ASS animation and budgets", () => {
  it.each(["float", "bounce", "sweep", "particles"] as const)(
    "%s preserves timing and exports deterministically",
    (preset) => {
      const p = sample();
      const opts = options(preset);
      const out = exportAss(p, opts);
      expect(out).toEqual(exportAss(p, opts));
      const back = importAss(out.text);
      expect(back.parts[0].lines[0]).toMatchObject({
        text: "君と",
        startMs: 2000,
        endMs: 3400,
        translation: "With you",
        roman: "kimi to",
      });
      expect(out.notices).toEqual([]);
    },
  );

  it("moves sublines with a floating line and uses only one position tag", () => {
    const out = exportAss(sample(), options("float")).text;
    const rendered = out.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(
      rendered.every((l) => l.includes("\\move(") && !l.includes("\\pos(")),
    ).toBe(true);
  });

  it("keeps a ruby group paired with its base rather than bouncing every syllable", () => {
    const p = sample();
    const line = p.parts[0].lines[0];
    setRuby(line, 0, ["き", "み"]);
    line.units[0].syllables[1].startMs = 2300;
    const out = exportAss(p, options("bounce")).text;
    const accents = out.split("\n").filter((l) => /^Dialogue: 3[12],/.test(l));
    expect(accents.every((l) => l.includes("\\1a&HFF&\\2a&HFF&"))).toBe(true);
    expect(accents).toHaveLength(6); // 2 main units + 1 whole ruby, rise and fall
    expect(
      accents
        .filter((l) => l.includes("-Ruby,"))
        .every((l) => l.endsWith("きみ")),
    ).toBe(true);
    expect(accents.filter((l) => l.endsWith("きみ"))[0]).toContain(
      "0:00:02.00,0:00:02.15",
    );
    expect(accents.filter((l) => l.endsWith("君"))[0]).toContain(
      "0:00:02.00,0:00:02.15",
    );
  });

  it("does not trigger singing accents in an intro, next-line preview or pause", () => {
    const p = fromLyrics(
      "[00:10]<00:10>君<00:10.60>と<00:11.40>\n[00:15]<00:15>星<00:16>",
    );
    p.parts[0].lines[0].units[0].syllables[0].endMs = 10100;
    const opts = options("bounce");
    opts.style = { ...opts.style, layout: "diagonal", diagonalPreview: true };
    opts.introHintMs = 3000;
    const out = exportAss(p, opts).text;
    const accents = out
      .split("\n")
      .filter((l) => l.startsWith("Dialogue: 31,"));
    expect(accents[0]).toContain("0:00:10.00,0:00:10.05");
    expect(accents[1]).toContain("0:00:10.05,0:00:10.10");
    expect(accents.filter((l) => l.endsWith("星"))[0]).toContain("0:00:15.00,");
  });

  it("caps particles globally even for many simultaneous voices and staggered starts", () => {
    const events = Array.from({ length: 90 }, (_, i) =>
      visualEvent(1000 + i * 10),
    );
    const out = applyAssEffects(
      events,
      { preset: "particles", intensity: "high", color: null },
      1,
    );
    const particles = out.events.filter((e) => e.layer === 40);
    const edges = particles
      .flatMap((e) => [
        [e.start, 1],
        [e.end, -1],
      ])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let count = 0,
      max = 0;
    for (const [, delta] of edges) {
      count += delta;
      max = Math.max(max, count);
    }
    expect(max).toBe(ASS_PARTICLE_LIMIT);
    expect(particles.length).toBeLessThan(events.length * 3);
    expect(out).toEqual(
      applyAssEffects(
        events,
        { preset: "particles", intensity: "high", color: null },
        1,
      ),
    );
  });

  it("falls back for the whole export without changing sources or losing the readable base", () => {
    const event = visualEvent();
    event.visual!.accents = Array.from(
      { length: 16000 },
      () => event.visual!.accents[0],
    );
    const source = {
      ...visualEvent(),
      kind: "Comment",
      effect: "karaoke",
      visual: undefined,
    };
    const out = applyAssEffects(
      [event, source],
      { preset: "bounce", intensity: "high", color: null },
      1,
    );
    expect(out.notices[0]).toContain("整体改用柔光");
    expect(out.events).toHaveLength(3);
    expect(out.events).toContain(source);
    expect(out.events.some((e) => e.text.includes("\\move("))).toBe(false);
    const many = Array.from({ length: ASS_EFFECT_EVENT_LIMIT + 2 }, () =>
      visualEvent(),
    );
    const capped = applyAssEffects(
      many,
      { preset: "soft", intensity: "medium", color: null },
      1,
    );
    expect(capped.events).toHaveLength(many.length + ASS_EFFECT_EVENT_LIMIT);
    expect(capped.notices[0]).toContain("剩余歌词保留清晰正文");
  });

  it("skips sub-centisecond accents instead of writing zero-duration events", () => {
    const e = visualEvent();
    e.visual!.accents[0].end = 1002;
    const out = applyAssEffects(
      [e],
      { preset: "bounce", intensity: "high", color: null },
      1,
    );
    expect(out.events.filter((e) => e.layer >= 30)).toHaveLength(0);
  });
});

it("warns about overlong lines and ignores decorative sublines on import", () => {
  const p = fromLyrics("[00:01]<00:01>" + "星".repeat(100) + "<00:02>");
  p.parts[0].lines[0].translation = "Original";
  const out = exportAss(p, options("particles"));
  expect(out.notices.some((n) => n.includes("超出字幕可用宽度"))).toBe(true);
  const decorated =
    out.text +
    "Dialogue: 40,0:00:01.00,0:00:02.00,Mako-Translation,主唱,0,0,0,fx,{\\p1}m 0 0 l 1 1{\\p0}\n";
  expect(importAss(decorated).parts[0].lines[0].translation).toBe("Original");
});

it("stops spawning particles at the unit end and keeps their paths within the frame", () => {
  const event = visualEvent();
  event.visual!.accents[0] = {
    ...event.visual!.accents[0],
    end: 1020,
    x: 1278,
    y: 715,
    width: 90,
  };
  const out = applyAssEffects(
    [event],
    { preset: "particles", intensity: "high", color: null },
    2 / 3,
    1280,
    720,
  );
  const particles = out.events.filter((e) => e.layer === 40);
  expect(particles).toHaveLength(1);
  expect(particles[0].start).toBe(1000);
  const path = /\\move\(([^)]*)\)/
    .exec(particles[0].text)![1]
    .split(",")
    .map(Number);
  expect(path[0]).toBeLessThan(1280);
  expect(path[2]).toBeLessThan(1280);
  expect(path[1]).toBeGreaterThan(0);
  expect(path[3]).toBeGreaterThan(0);
  expect(path[1]).toBeLessThan(720);
  expect(path[3]).toBeLessThan(720);
});
