import type { AssOutputEvent } from "./assEvents";
import type { AssEffects } from "./assStyle";

/** Tags go after layout tags, before karaoke, so no source text is interpreted. */
function tags(text: string, extra: string): string {
  return text.replace("}", `${extra}}`);
}
const n = (value: number) => Math.round(value * 100) / 100;
const c = (hex: string) =>
  `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`;
const alpha = (value: number) =>
  `&H${Math.round(value).toString(16).padStart(2, "0")}&`;
export const effectStrength = (effects: AssEffects) =>
  effects.intensity === "low" ? 0.65 : effects.intensity === "high" ? 1.35 : 1;

export function applyAssEffects(
  events: AssOutputEvent[],
  effects: AssEffects,
  scale: number,
): { events: AssOutputEvent[]; notices: string[] } {
  if (effects.preset === "none") return { events, notices: [] };
  const result: AssOutputEvent[] = [];
  const strength = effectStrength(effects);
  for (const event of events) {
    const v = event.visual;
    if (!v || event.kind !== "Dialogue") {
      result.push(event);
      continue;
    }
    const base = { ...event, layer: 20 + event.layer };
    if (v.role === "sub") {
      result.push(base);
      continue;
    }
    const color = effects.color ?? v.partColor;
    const reduced = v.role === "main" ? 1 : 0.55;
    const amount = strength * reduced;
    const clone = (extra: string, layer = 10) => ({
      ...base,
      effect: "fx",
      layer,
      text: tags(base.text, extra),
    });
    if (effects.preset === "outline") {
      result.push(
        clone(
          `\\1a&HFF&\\2a&HFF&\\3c${c(color)}\\3a&H00&` +
            `\\bord${n(v.outline + 4 * amount * scale)}\\blur${n(0.5 * scale)}` +
            `\\xshad${n(3 * amount * scale)}\\yshad${n(3 * amount * scale)}\\4c&H000000&\\4a&H65&`,
        ),
      );
    } else {
      const neon = effects.preset === "neon";
      const broad = (neon ? 12 : 6) * amount * scale;
      let glow =
        `\\1a&HFF&\\2a&HFF&\\shad0\\3c${c(color)}` +
        `\\bord${n(v.outline + 3 * amount * scale)}\\blur${n(broad)}\\3a${alpha(neon ? 150 : 105)}`;
      if (neon) {
        const start = Math.max(
          0,
          Math.round((v.singStart - event.start) / 10) * 10,
        );
        const end = Math.max(
          start,
          Math.min(start + 240, event.end - event.start),
        );
        glow += `\\t(${start},${end},\\3a&H30&\\blur${n(broad * 0.75)})`;
      }
      result.push(clone(glow));
      if (neon)
        result.push(
          clone(
            `\\1a&HFF&\\2a&HFF&\\shad0\\3c${c(color)}\\3a&H70&` +
              `\\bord${n(v.outline + 1.5 * amount * scale)}\\blur${n(2 * amount * scale)}`,
            11,
          ),
        );
    }
    result.push(base);
  }
  return { events: result, notices: [] };
}
