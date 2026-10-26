import type { AssOutputEvent, AssAccent } from "./assEvents";
import type { AssEffects } from "./assStyle";

/** Tags go after layout tags, before karaoke, so no source text is interpreted. */
function tags(text: string, extra: string): string {
  return text.replace("}", `${extra}}`);
}
const n = (value: number) => Math.round(value * 100) / 100;
const cs = (value: number) => Math.round(value / 10) * 10;
const c = (hex: string) =>
  `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`;
const shine = (hex: string) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.3 + 255 * 0.7)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const alpha = (value: number) =>
  `&H${Math.round(value).toString(16).padStart(2, "0")}&`;
export const effectStrength = (effects: AssEffects) =>
  effects.intensity === "low" ? 0.65 : effects.intensity === "high" ? 1.35 : 1;
export const ASS_EFFECT_EVENT_LIMIT = 30_000;
export const ASS_PARTICLE_LIMIT = 48;

/** Stable pseudo-randomness, deliberately independent of generated project IDs. */
function random(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed)
    state = Math.imul(state ^ char.codePointAt(0)!, 16777619);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function estimate(events: AssOutputEvent[], effects: AssEffects): number {
  let count = 0;
  for (const e of events) {
    if (!e.visual || e.visual.role === "sub") continue;
    count += effects.preset === "neon" ? 2 : 1;
    if (effects.preset === "bounce") count += e.visual.accents.length * 2;
    if (effects.preset === "sweep") count += e.visual.accents.length;
    if (effects.preset === "particles" && e.visual.role === "main")
      count +=
        e.visual.accents.length *
        (effects.intensity === "low"
          ? 1
          : effects.intensity === "high"
            ? 3
            : 2);
  }
  return count;
}

export function applyAssEffects(
  events: AssOutputEvent[],
  effects: AssEffects,
  scale: number,
  width = 1920,
  height = 1080,
): { events: AssOutputEvent[]; notices: string[] } {
  if (effects.preset === "none") return { events, notices: [] };
  if (
    effects.preset !== "soft" &&
    estimate(events, effects) > ASS_EFFECT_EVENT_LIMIT
  ) {
    const fallback = applyAssEffects(
      events,
      { ...effects, preset: "soft" },
      scale,
      width,
      height,
    );
    return {
      events: fallback.events,
      notices: [
        "特效事件超过 30,000 条，本次导出已整体改用柔光；工程设置保留。",
        ...fallback.notices,
      ],
    };
  }
  const result: AssOutputEvent[] = [];
  const extra: AssOutputEvent[] = [];
  const notices: string[] = [];
  const strength = effectStrength(effects);
  const particleRequests: {
    event: AssOutputEvent;
    accent: AssAccent;
    index: number;
  }[] = [];
  const add = (e: AssOutputEvent) => {
    if (extra.length < ASS_EFFECT_EVENT_LIMIT && cs(e.end) > cs(e.start))
      extra.push(e);
  };
  for (const event of events) {
    const v = event.visual;
    if (!v || event.kind !== "Dialogue") {
      result.push(event);
      continue;
    }
    let base = { ...event, layer: 20 + event.layer };
    // Move every band by the same offset on entry, including readable sublines.
    if (effects.preset === "float") {
      const duration = Math.min(320, cs(event.end) - cs(event.start));
      const dy = Math.min(
        12 * strength * scale,
        Math.max(0, height - v.y - 8 * scale),
      );
      base = {
        ...base,
        text: base.text.replace(
          /\\pos\([^)]*\)/,
          `\\move(${n(v.x)},${n(v.y + dy)},${n(v.x)},${n(v.y)},0,${duration})`,
        ),
      };
    }
    result.push(base);
    if (v.role === "sub") continue;
    const color = effects.color ?? v.partColor;
    const amount = strength * (v.role === "main" ? 1 : 0.55);
    const clone = (extraTags: string, layer = 10) => ({
      ...base,
      effect: "fx",
      layer,
      text: tags(base.text, extraTags),
    });
    if (effects.preset === "outline") {
      add(
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
        const start = Math.max(0, cs(v.singStart) - cs(event.start));
        const end = Math.max(
          start,
          Math.min(start + 240, cs(event.end) - cs(event.start)),
        );
        glow += `\\t(${start},${end},\\3a&H30&\\blur${n(broad * 0.75)})`;
      }
      add(clone(glow));
      if (neon)
        add(
          clone(
            `\\1a&HFF&\\2a&HFF&\\shad0\\3c${c(color)}\\3a&H70&` +
              `\\bord${n(v.outline + 1.5 * amount * scale)}\\blur${n(2 * amount * scale)}`,
            11,
          ),
        );
    }
    if (v.role === "background") continue;
    for (const [index, a] of v.accents.entries()) {
      const start = Math.max(cs(a.start), cs(event.start));
      const end = Math.min(cs(a.end), cs(event.end));
      if (!a.text.trim() || end - start < 20) continue;
      if (effects.preset === "bounce") {
        // Same displacement/duration on ruby and its base; no per-syllable re-bounce.
        const duration = Math.min(300, end - start);
        const half = Math.floor(duration / 20) * 10;
        const up = Math.min(
          7 * strength * scale,
          Math.max(0, a.y - v.size - 4 * scale),
        );
        const zoom = 100 + 8 * strength;
        const x = a.x + a.width / 2;
        // An outline accent leaves the underlying syllable fill visible;
        // especially ruby must not appear sung ahead of its own timing.
        const common = `\\an2\\1a&HFF&\\2a&HFF&\\3c${c(color)}\\3a&H60&\\bord${n(1.4 * scale)}\\blur${n(0.4 * scale)}\\shad0`;
        add({
          ...base,
          layer: 30 + event.layer,
          effect: "fx",
          start,
          end: start + half,
          text: `{${common}\\move(${n(x)},${n(a.y)},${n(x)},${n(a.y - up)},0,${half})\\fscx100\\fscy100\\t(0,${half},\\fscx${n(zoom)}\\fscy${n(zoom)})}${a.text}`,
        });
        add({
          ...base,
          layer: 30 + event.layer,
          effect: "fx",
          start: start + half,
          end: start + duration,
          text: `{${common}\\move(${n(x)},${n(a.y - up)},${n(x)},${n(a.y)},0,${duration - half})\\fscx${n(zoom)}\\fscy${n(zoom)}\\t(0,${duration - half},\\fscx100\\fscy100)\\fad(0,${Math.min(70, duration - half)})}${a.text}`,
        });
      } else if (effects.preset === "sweep") {
        // Rectangle shrinks to zero at the edges, so it never lights adjacent words.
        const duration = Math.min(800, end - start);
        const band = Math.min(a.width, 14 * strength * scale);
        const top = Math.max(0, a.y - v.size - 3 * scale),
          bottom = Math.min(height, a.y + 3 * scale);
        const rect = (l: number, r: number) =>
          `\\clip(${n(l)},${n(top)},${n(r)},${n(bottom)})`;
        const mid = Math.max(10, Math.floor(duration / 20) * 10);
        add({
          ...base,
          layer: 30 + event.layer,
          effect: "fx",
          start,
          end: start + duration,
          text: tags(
            base.text.replace(/\\fad\([^)]*\)/, ""),
            `\\1c${c(shine(color))}\\2c${c(shine(color))}\\1a&H00&\\2a&H00&\\3a&HFF&\\shad0` +
              rect(a.x, a.x) +
              `\\t(0,${mid},${rect(a.x + (a.width - band) / 2, a.x + (a.width + band) / 2)})` +
              `\\t(${mid},${duration},${rect(a.x + a.width, a.x + a.width)})`,
          ),
        });
      } else if (effects.preset === "particles" && v.role === "main") {
        particleRequests.push({ event: base, accent: a, index });
      }
    }
  }
  // Schedule individual particles, including staggered starts, in time order.
  let active: number[] = [];
  const count =
    effects.intensity === "low" ? 1 : effects.intensity === "high" ? 3 : 2;
  const candidates = particleRequests.flatMap((request) =>
    Array.from({ length: count }, (_, i) => ({
      ...request,
      i,
      time: cs(request.accent.start + i * 30),
    })),
  );
  candidates.sort((a, b) => a.time - b.time);
  for (const { event, accent: a, index, i, time } of candidates) {
    if (time >= Math.min(cs(a.end), cs(event.end))) continue;
    const v = event.visual!;
    const rand = random(`${event.actor}|${a.text}|${a.start}|${index}`);
    for (let skip = 0; skip < i * 5; skip++) rand();
    const start = time,
      end = Math.min(start + 450, cs(event.end));
    active = active.filter((t) => t > start);
    if (active.length >= ASS_PARTICLE_LIMIT || end - start < 20) continue;
    active.push(end);
    const inset = 5 * scale;
    const clampX = (x: number) => Math.max(inset, Math.min(width - inset, x));
    const clampY = (y: number) => Math.max(inset, Math.min(height - inset, y));
    const x = clampX(a.x + a.width * rand()),
      y = clampY(a.y - v.size * (0.25 + 0.5 * rand()));
    const toX = clampX(x + (rand() - 0.5) * 42 * strength * scale);
    const toY = clampY(y - (12 + rand() * 20) * strength * scale);
    const radius = (1.2 + rand() * 1.2) * scale;
    add({
      ...event,
      layer: 40,
      effect: "fx",
      start,
      end,
      text:
        `{\\an5\\p1\\bord0\\shad0\\1c${c(effects.color ?? v.partColor)}\\1a&H10&\\blur${n(scale * 0.6)}\\fad(30,180)\\move(${n(x)},${n(y)},${n(toX)},${n(toY)})}` +
        `m 0 ${n(-radius)} l ${n(radius)} 0 0 ${n(radius)} ${n(-radius)} 0{\\p0}`,
    });
  }
  if (
    effects.preset === "soft" &&
    estimate(events, effects) > ASS_EFFECT_EVENT_LIMIT
  )
    notices.push("柔光已达到 30,000 条装饰事件上限，剩余歌词保留清晰正文。");
  return { events: [...extra, ...result], notices };
}
