import type { LyricLine, ProjectDraft, VocalPart } from "./model";

export type Side = "left" | "right" | "center";
export interface SongVoice {
  line: LyricLine;
  part: VocalPart;
  /** Where this line's last syllable may extend to: the next line of its part. */
  limitMs: number;
  endMs: number;
}
export interface SongLine extends SongVoice {
  side: Side;
  backgrounds: SongVoice[];
}

function voices(part: VocalPart, duration: number): SongVoice[] {
  return part.lines.flatMap((line, index) => {
    if (line.startMs === null) return [];
    const limitMs = Math.min(
      duration,
      part.lines.slice(index + 1).find((next) => next.startMs !== null)
        ?.startMs ?? duration,
    );
    return [{ line, part, limitMs, endMs: line.endMs ?? limitMs }];
  });
}

const overlap = (a: SongVoice, b: SongVoice) =>
  Math.min(a.endMs, b.endMs) - Math.max(a.line.startMs!, b.line.startMs!);

/**
 * The whole song across parts, in the AMLL layout: a duet changes side whenever
 * the singer changes, a group sings in the middle, and each background line
 * rides under the main line it overlaps most, else the main line before it.
 */
export function songLines(project: ProjectDraft): SongLine[] {
  const duration = project.audio?.durationMs ?? Infinity;
  const main = project.parts.filter((part) => !part.background);
  const lead = main.length ? main : project.parts;
  const entries = lead
    .flatMap((part) => voices(part, duration))
    .sort((a, b) => a.line.startMs! - b.line.startMs!);
  let side: Side = "left",
    singer: string | null = null;
  const result: SongLine[] = entries.map((voice) => {
    if (voice.part.kind === "group")
      return { ...voice, side: "center", backgrounds: [] };
    if (singer !== null && singer !== voice.part.id)
      side = side === "left" ? "right" : "left";
    singer = voice.part.id;
    return { ...voice, side, backgrounds: [] };
  });
  if (!main.length || !result.length) return result;
  for (const part of project.parts.filter((item) => item.background))
    for (const voice of voices(part, duration)) {
      let host: SongLine | undefined,
        best = 0;
      for (const entry of result) {
        const shared = overlap(entry, voice);
        if (shared > best) [host, best] = [entry, shared];
      }
      host ??=
        result
          .filter((entry) => entry.line.startMs! <= voice.line.startMs!)
          .at(-1) ?? result[0];
      host.backgrounds.push(voice);
    }
  return result;
}
