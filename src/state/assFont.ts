import type { Measure } from "../domain/ass";

/**
 * Measure with the same font the player will use. libass sizes by the full
 * line height, so the em ratio is that height over the CSS font size.
 */
export async function fontMetrics(
  font: string,
): Promise<{ measure: Measure; emRatio: number; available: boolean }> {
  const family = `"${font.replace(/"/g, "")}"`;
  await document.fonts.load(`64px ${family}`, "あ漢A").catch(() => []);
  const available = document.fonts.check(`64px ${family}`, "あ漢A");
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = `100px ${family}, sans-serif`;
  const sample = context.measureText("あ漢Ag");
  const height =
    sample.fontBoundingBoxAscent + sample.fontBoundingBoxDescent || 144.8;
  return {
    emRatio: height / 100,
    available,
    measure: (text, emPx) => {
      context.font = `${emPx}px ${family}, sans-serif`;
      return context.measureText(text).width;
    },
  };
}
