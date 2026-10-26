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
