/** The three simple ways this tool lays out its two bottom rows. */
export type AssLayout = "classic" | "diagonal" | "single";
/** How the sung text color is chosen. */
export type AssColorMode = "part" | "solid";

/**
 * A deliberately small ASS style: a layout preset and the few appearance
 * controls exposed in the export dialog. Sizes are in pixels at PlayResY 1080
 * and are scaled with the chosen resolution on export.
 */
export interface AssStyle {
  layout: AssLayout;
  font: string;
  mainSize: number;
  mainBold: boolean;
  rubySize: number;
  rubyBold: boolean;
  /** null follows the lyric color (part color or the solid choice). */
  rubyColor: string | null;
  romanSize: number;
  romanBold: boolean;
  romanColor: string;
  /** When false the romanization row is not written to the ASS file. */
  includeRoman: boolean;
  outline: number;
  outlineColor: string;
  colorMode: AssColorMode;
  /** Used when colorMode is solid; part colors are ignored for lyrics. */
  solidColor: string;
  /** Secondary color of all karaoke lyric layers: main, ruby and harmony. */
  unsungColor: string;
}

export const defaultAssStyle: AssStyle = {
  layout: "classic",
  font: "Noto Sans CJK JP",
  mainSize: 64,
  mainBold: false,
  rubySize: 30,
  rubyBold: false,
  rubyColor: null,
  romanSize: 32,
  romanBold: false,
  romanColor: "#e0e0e0",
  includeRoman: true,
  outline: 3,
  outlineColor: "#202020",
  colorMode: "part",
  solidColor: "#ffffff",
  unsungColor: "#ffffff",
};

export const assStyleRanges = {
  mainSize: [40, 120],
  rubySize: [12, 72],
  romanSize: [12, 72],
  outline: [0, 12],
} as const;

const HEX = /^#[0-9a-f]{6}$/i;
const layouts: AssLayout[] = ["classic", "diagonal", "single"];

const numeric = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
};
const integer = (
  value: unknown,
  range: readonly [number, number],
  fallback: number,
) => {
  const parsed = numeric(value);
  return Number.isFinite(parsed)
    ? Math.min(range[1], Math.max(range[0], Math.round(parsed)))
    : fallback;
};
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
const colorOrNull = (value: unknown) =>
  typeof value === "string" && HEX.test(value) ? value.toLowerCase() : null;
const font = (value: unknown) => {
  if (typeof value !== "string") return defaultAssStyle.font;
  const cleaned = value
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || defaultAssStyle.font;
};

/** Fill missing fields with defaults and keep every value inside its range. */
export function normalizeAssStyle(value: unknown): AssStyle {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AssStyle>)
      : {};
  const mainSize = integer(
    raw.mainSize,
    assStyleRanges.mainSize,
    defaultAssStyle.mainSize,
  );
  return {
    layout: layouts.includes(raw.layout as AssLayout)
      ? (raw.layout as AssLayout)
      : defaultAssStyle.layout,
    font: font(raw.font),
    mainSize,
    mainBold: raw.mainBold === true,
    rubySize: integer(
      raw.rubySize,
      assStyleRanges.rubySize,
      defaultAssStyle.rubySize,
    ),
    rubyBold: raw.rubyBold === true,
    rubyColor: colorOrNull(raw.rubyColor),
    // Old styles only had a ratio; derive it so their output keeps its size.
    romanSize: integer(
      raw.romanSize,
      assStyleRanges.romanSize,
      Math.round(mainSize / 2),
    ),
    romanBold: raw.romanBold === true,
    romanColor: color(raw.romanColor, defaultAssStyle.romanColor),
    includeRoman: raw.includeRoman !== false,
    outline: integer(
      raw.outline,
      assStyleRanges.outline,
      defaultAssStyle.outline,
    ),
    outlineColor: color(raw.outlineColor, defaultAssStyle.outlineColor),
    colorMode: raw.colorMode === "solid" ? "solid" : "part",
    solidColor: color(raw.solidColor, defaultAssStyle.solidColor),
    unsungColor: color(raw.unsungColor, defaultAssStyle.unsungColor),
  };
}

/** The project style, or the current defaults for old drafts without one. */
export function assStyleOf(project: { assStyle?: AssStyle }): AssStyle {
  return normalizeAssStyle(project.assStyle);
}
