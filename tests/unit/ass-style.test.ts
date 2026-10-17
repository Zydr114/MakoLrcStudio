import { describe, expect, it } from "vitest";
import { readBackup } from "../../src/domain/backup";
import {
  assStyleOf,
  assStyleRanges,
  defaultAssStyle,
  normalizeAssStyle,
} from "../../src/domain/assStyle";
import { fromLyrics } from "./helpers";

describe("ASS style", () => {
  it("falls back to the current defaults for old or malformed values", () => {
    expect(assStyleOf({})).toEqual(defaultAssStyle);
    expect(normalizeAssStyle(undefined)).toEqual(defaultAssStyle);
    expect(normalizeAssStyle("nonsense")).toEqual(defaultAssStyle);
    expect(normalizeAssStyle({ layout: "other", font: " " })).toMatchObject({
      layout: "classic",
      font: defaultAssStyle.font,
    });
  });

  it("keeps valid values and clamps numbers and colors", () => {
    expect(
      normalizeAssStyle({
        layout: "diagonal",
        font: "  Noto Serif CJK JP ",
        mainSize: "72",
        mainBold: true,
        rubySize: 999,
        rubyBold: true,
        rubyColor: "#ABCDEF",
        romanSize: 999,
        romanBold: true,
        romanColor: "#123456",
        includeRoman: false,
        diagonalPreview: true,
        outline: -3,
        outlineColor: "#FF0000",
        colorMode: "solid",
        solidColor: "#00FF00",
        unsungColor: "#654321",
      }),
    ).toEqual({
      layout: "diagonal",
      font: "Noto Serif CJK JP",
      mainSize: 72,
      mainBold: true,
      rubySize: assStyleRanges.rubySize[1],
      rubyBold: true,
      rubyColor: "#abcdef",
      romanSize: assStyleRanges.romanSize[1],
      romanBold: true,
      romanColor: "#123456",
      includeRoman: false,
      diagonalPreview: true,
      outline: 0,
      outlineColor: "#ff0000",
      colorMode: "solid",
      solidColor: "#00ff00",
      unsungColor: "#654321",
    });
    expect(normalizeAssStyle({ mainSize: 1 }).mainSize).toBe(40);
    expect(normalizeAssStyle({ outlineColor: "red" }).outlineColor).toBe(
      defaultAssStyle.outlineColor,
    );
    expect(normalizeAssStyle({ rubyColor: "red" }).rubyColor).toBeNull();
  });

  it("derives the old roman size and keeps per-layer values independent", () => {
    const old = normalizeAssStyle({
      mainSize: 80,
      rubySize: 40,
      outline: 6,
      outlineColor: "#ff0000",
      colorMode: "solid",
      solidColor: "#00ff00",
    });
    expect(old.romanSize).toBe(40);
    expect(old).toMatchObject({
      mainBold: false,
      rubyBold: false,
      rubyColor: null,
      romanBold: false,
      romanColor: defaultAssStyle.romanColor,
      includeRoman: true,
      diagonalPreview: false,
      unsungColor: defaultAssStyle.unsungColor,
    });
    expect(normalizeAssStyle({ mainSize: 80, romanSize: 24 })).toMatchObject({
      mainSize: 80,
      romanSize: 24,
    });
  });

  it("adds the default style to old projects and backups", () => {
    const project = fromLyrics("[00:01]今日");
    delete (project as { assStyle?: unknown }).assStyle;
    expect(assStyleOf(project)).toEqual(defaultAssStyle);
    const raw = JSON.parse(JSON.stringify(project));
    delete raw.assStyle;
    expect(readBackup(JSON.stringify(raw)).assStyle).toEqual(defaultAssStyle);
  });

  it("keeps a custom style through a backup", () => {
    const project = fromLyrics("[00:01]今日");
    project.assStyle = {
      ...defaultAssStyle,
      layout: "diagonal",
      diagonalPreview: true,
      mainSize: 80,
      rubySize: 40,
      outline: 6,
      outlineColor: "#ff0000",
      colorMode: "solid",
      solidColor: "#00ff00",
    };
    expect(readBackup(JSON.stringify(project)).assStyle).toEqual(
      project.assStyle,
    );
  });
});
