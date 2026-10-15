import { importLyrics } from "../../src/domain/lrc";
import { newProject, unitStart, type LyricLine } from "../../src/domain/model";

/** A single-part project built from LRC text, the way an import creates it. */
export function fromLyrics(text: string) {
  const imported = importLyrics(text);
  return { ...newProject(imported.lines), metadata: imported.metadata };
}
export const starts = (line: LyricLine) => line.units.map(unitStart);
export const texts = (line: LyricLine) => line.units.map((unit) => unit.text);
