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
        rubySize: 999,
        outline: -3,
        outlineColor: "#FF0000",
        colorMode: "solid",
        solidColor: "#00FF00",
      }),
    ).toEqual({
      layout: "diagonal",
      font: "Noto Serif CJK JP",
      mainSize: 72,
      rubySize: assStyleRanges.rubySize[1],
      outline: 0,
      outlineColor: "#ff0000",
      colorMode: "solid",
      solidColor: "#00ff00",
    });
    expect(normalizeAssStyle({ mainSize: 1 }).mainSize).toBe(40);
    expect(normalizeAssStyle({ outlineColor: "red" }).outlineColor).toBe(
      defaultAssStyle.outlineColor,
    );
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
