import {
  newId,
  newLine,
  newPart,
  newSyllable,
  partColors,
  retextUnit,
  syllableRefs,
  validateLines,
  type LyricLine,
  type PartKind,
  type ProjectDraft,
  type Syllable,
  type TimingUnit,
  type VocalPart,
} from "./model";
import { rubyParts } from "./ruby";
import { songLines, type Side, type SongVoice } from "./song";
import { normalizeAssStyle, type AssStyle } from "./assStyle";
import { serializeAssEvent, type AssOutputEvent } from "./assEvents";

/** Text width in pixels at a font size given in CSS pixels per em; bold asks for the bold face. */
export type Measure = (text: string, emPx: number, bold?: boolean) => number;
export interface AssOptions {
  style: AssStyle;
  width: number;
  height: number;
  /** \kf fills each syllable smoothly, \k switches it at once. */
  fill: "kf" | "k";
  /** How long a line is on screen before it is sung. */
  leadInMs: number;
  /** 0 disables the intro dot; otherwise it is shown for this long. */
  introHintMs: number;
  measure: Measure;
  /**
   * libass sizes a font by its full line height: the em is the style size
   * divided by this ratio (1.448 for Noto Sans CJK).
   */
  emRatio: number;
}
export interface AssExport {
  text: string;
  notices: string[];
}

const TAIL_MS = 300;
/** &HAABBGGRR from #RRGGBB. */
const assColor = (hex: string, alpha = 0) =>
  `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
/** Text that cannot break the event line or open an override block. */
const escape = (text: string) =>
  text
    .replace(/[{}]/g, (c) => (c === "{" ? "｛" : "｝"))
    .replace(/\\/g, "＼")
    .replace(/\r?\n/g, " ");
const styleName = (name: string) => name.replace(/,/g, "，");

/** One timed piece of karaoke: text sung from `start` to `end` (ms). */
interface Piece {
  text: string;
  start: number;
  end: number;
  /** Aegisub furigana: the reading of a ruby base, `#` for a continuing base. */
  furigana?: string;
}
function syllableEnds(line: LyricLine): number[] {
  const refs = syllableRefs(line);
  return refs.map(
    ({ syllable }, index) =>
      syllable.endMs ?? refs[index + 1]?.syllable.startMs ?? line.endMs!,
  );
}
/** Base pieces: a ruby unit is one piece over all its syllables. */
function basePieces(line: LyricLine): Piece[] {
  const ends = syllableEnds(line);
  let index = 0;
  return line.units.map((unit) => {
    const start = unit.syllables[0].startMs!;
    index += unit.syllables.length;
    return { text: unit.text, start, end: ends[index - 1] };
  });
}
/** Source pieces: every syllable, ruby written the Aegisub way (詮|せ, #|ん). */
function sourcePieces(line: LyricLine): Piece[] {
  const ends = syllableEnds(line);
  return syllableRefs(line).map(({ syllable, unit, index }) => ({
    text: unit.ruby
      ? syllable === unit.syllables[0]
        ? unit.text
        : "#"
      : unit.text,
    furigana: unit.ruby ? syllable.text : undefined,
    start: syllable.startMs!,
    end: ends[index],
  }));
}
/**
 * Karaoke tags from absolute times. Durations come from rounded absolute
 * boundaries, so centisecond rounding never accumulates; gaps become empty
 * \k segments.
 */
function karaoke(pieces: Piece[], eventStart: number, tag: "kf" | "k"): string {
  // Relative to the event start as written (rounded), not as stored.
  const base = Math.round(eventStart / 10);
  const cs = (ms: number) => Math.round(ms / 10) - base;
  let cursor = 0,
    out = "";
  for (const piece of pieces) {
    const start = cs(piece.start),
      end = cs(piece.end);
    if (start > cursor) out += `{\\k${start - cursor}}`;
    const text =
      escape(piece.text) + (piece.furigana ? `|${escape(piece.furigana)}` : "");
    out += `{\\${tag}${Math.max(0, end - Math.max(start, cursor))}}${text}`;
    cursor = Math.max(cursor, end);
  }
  return out;
}

interface Block {
  entry: SongVoice & { side: Side };
  background: SongVoice | null;
  start: number;
  end: number;
  row: number;
  /** End of the previous block in this row, before this block was placed. */
  rowFreeBefore: number;
  /** Early start when the diagonal layout shows this line as the next preview. */
  previewStart?: number;
  /** Start of the intro dot, when the gap can fit the whole hint. */
  hintStart?: number;
}

export function exportAss(
  project: ProjectDraft,
  options: AssOptions,
): AssExport {
  const duration = project.audio?.durationMs ?? Infinity;
  const parts = project.parts.filter((part) => part.lines.length);
  if (!parts.length) throw new Error("请先导入歌词。");
  for (const part of parts) {
    const issue = validateLines(part.lines, duration)[0];
    if (issue)
      throw new Error(`无法导出 ASS：声部「${part.name}」${issue.message}`);
  }
  const notices: string[] = [];
  const style = normalizeAssStyle(options.style);
  const scale = options.height / 1080;
  const size = {
    main: Math.round(style.mainSize * scale),
    ruby: Math.round(style.rubySize * scale),
    // Harmony and translation keep their current proportion to the main line.
    background: Math.round(style.mainSize * (44 / 64) * scale),
    roman: Math.round(style.romanSize * scale),
    translation: Math.round(style.mainSize * (36 / 64) * scale),
  };
  const all = parts.flatMap((part) => part.lines);
  const hasRoman = all.some((line) => line.roman.trim());
  if (!style.includeRoman && hasRoman)
    notices.push("样式设置为不包含罗马音行，导出的 ASS 不含罗马音。");
  const has = {
    ruby: all.some((line) => line.units.some((unit) => unit.ruby)),
    background: parts.some((part) => part.background),
    roman: style.includeRoman && hasRoman,
    translation: all.some((line) => line.translation.trim()),
  };
  // A block is a main line with what rides on it, stacked top to bottom.
  const gap = Math.round(6 * scale);
  const bands: [keyof typeof size, number][] = [];
  if (has.ruby) bands.push(["ruby", size.ruby]);
  bands.push(["main", size.main]);
  if (has.background) bands.push(["background", size.background]);
  if (has.roman) bands.push(["roman", size.roman]);
  if (has.translation) bands.push(["translation", size.translation]);
  const blockHeight = bands.reduce((sum, [, h]) => sum + h + gap, 0);
  const bottom = options.height - Math.round(56 * scale);
  /** Bottom edge (y) of a band in a row; row 0 is the lower row. */
  const bandBottom = (row: number, band: keyof typeof size) => {
    let y = bottom - row * (blockHeight + Math.round(24 * scale));
    for (let i = bands.length - 1; i >= 0; i--) {
      if (bands[i][0] === band) return y;
      y -= bands[i][1] + gap;
    }
    return y;
  };
  const margin = Math.round(120 * scale);
  const em = (styleSize: number) => styleSize / options.emRatio;
  const width = (text: string, styleSize: number, bold = false) =>
    options.measure(text, em(styleSize), bold);

  // Two rows: each block takes the lower row unless it is still busy.
  const song = songLines({ ...project, parts });
  const rowsFree = [-Infinity, -Infinity];
  const blocks: Block[] = song.map((entry, index) => {
    const background = entry.backgrounds.length
      ? entry.backgrounds.reduce((a, b) =>
          a.line.startMs! <= b.line.startMs! ? a : b,
        )
      : null;
    if (entry.backgrounds.length > 1)
      notices.push(
        `「${entry.line.text}」下有多行和声，ASS 只显示最早的一行。`,
      );
    const start =
      Math.min(entry.line.startMs!, background?.line.startMs ?? Infinity) -
      options.leadInMs;
    const end = Math.max(entry.endMs, background?.endMs ?? 0) + TAIL_MS;
    let row: number;
    if (style.layout === "single") {
      row = 0;
      if (rowsFree[0] > start)
        notices.push(
          `「${entry.line.text}」与上一句重叠，单行版式下可能互相遮挡。`,
        );
    } else if (style.layout === "diagonal") {
      // The first line takes the upper-left slot, then lines alternate with
      // the lower-right one. If the preferred slot is still busy, use the
      // other rather than showing a third overlapping line.
      row = 1 - (index % 2);
      if (rowsFree[row] > start) {
        const other = 1 - row;
        if (rowsFree[other] <= start) row = other;
        else {
          row = rowsFree[0] <= rowsFree[1] ? 0 : 1;
          notices.push(
            `「${entry.line.text}」开始时两行都被占用，可能与前一句重叠显示。`,
          );
        }
      }
    } else {
      row = rowsFree.findIndex((free) => free <= start);
      if (row < 0) {
        row = rowsFree[0] <= rowsFree[1] ? 0 : 1;
        notices.push(
          `「${entry.line.text}」开始时两行都被占用，可能与前一句重叠显示。`,
        );
      }
    }
    const rowFreeBefore = rowsFree[row];
    rowsFree[row] = end;
    return {
      entry,
      background,
      start: Math.max(0, start),
      end,
      row,
      rowFreeBefore,
    };
  });

  // Diagonal can show the next line in the other slot from the moment the
  // previous line starts singing. The event starts early in unsung color; its
  // karaoke pieces still begin at the real line start, so the fill waits.
  if (style.layout === "diagonal" && style.diagonalPreview) {
    for (let index = 1; index < blocks.length; index++) {
      const block = blocks[index],
        previous = blocks[index - 1],
        ownStart = block.entry.line.startMs!,
        desired = previous.entry.line.startMs!;
      if (desired >= ownStart) continue;
      // A long line in this slot (for example a duet) may still be visible;
      // wait for it rather than drawing two lines on the same row.
      const previewStart = Math.max(0, desired, block.rowFreeBefore);
      if (previewStart >= ownStart || previewStart >= block.start) continue;
      block.previewStart = previewStart;
    }
  }

  const hintMs = Number.isFinite(options.introHintMs)
    ? Math.max(0, Math.round(options.introHintMs))
    : 0;
  if (hintMs > 0) {
    for (const block of blocks) {
      // A diagonally previewed line is already on screen; the dot would start
      // a second copy of it, so keep the intro cue for ordinary starts only.
      if (block.previewStart !== undefined) continue;
      const start = block.start - hintMs;
      if (start < 0) continue;
      // Only a genuinely free gap gets a cue: no other lyric event may still
      // be on screen during it, including a longer duet line.
      const covered = blocks.some(
        (other) =>
          other !== block && other.start < block.start && other.end > start,
      );
      if (!covered) block.hintStart = start;
    }
  }
  const blockSide = (block: Block): Side => {
    if (style.layout === "diagonal") return block.row === 0 ? "right" : "left";
    if (style.layout === "single") return "center";
    return block.entry.side;
  };
  const partStyle = (part: VocalPart) => `Mako-${styleName(part.name)}`;
  const events: AssOutputEvent[] = [];
  const dialogue = (
    layer: number,
    start: number,
    end: number,
    style: string,
    actor: string,
    effect: string,
    text: string,
    kind = "Dialogue",
  ) => events.push({ layer, start, end, style, actor, effect, text, kind });
  const x = (side: Side, textWidth: number) =>
    side === "right"
      ? options.width - margin - textWidth
      : side === "center"
        ? (options.width - textWidth) / 2
        : margin;
  const round = (value: number) => Math.round(value);
  for (const block of blocks) {
    const { line, part } = block.entry;
    const side = blockSide(block);
    const hint = block.hintStart !== undefined;
    const eventStart = block.hintStart ?? block.previewStart ?? block.start;
    const prefix = hint ? "● " : "";
    const mainWidth = width(prefix + line.text, size.main, style.mainBold);
    const left = x(side, mainWidth);
    const lineStyle = partStyle(part);
    // The dot is the first karaoke character: it fills during the hint, then
    // the ordinary lyric syllables fill at their own times.
    const pieces = hint
      ? [
          { text: "● ", start: eventStart, end: block.start },
          ...basePieces(line),
        ]
      : basePieces(line);
    dialogue(
      1,
      eventStart,
      block.end,
      lineStyle,
      part.name,
      "fx",
      `{\\an1\\pos(${round(left)},${round(bandBottom(block.row, "main"))})\\fad(150,150)}` +
        karaoke(pieces, eventStart, options.fill),
    );
    // Each reading sits centered over its base and fills syllable by syllable.
    let before = prefix;
    const ends = syllableEnds(line);
    let index = 0;
    for (const unit of line.units) {
      const parts_ = rubyParts(unit.text);
      if (unit.ruby) {
        const center =
          left +
          width(before + parts_.before, size.main, style.mainBold) +
          width(parts_.base, size.main, style.mainBold) / 2;
        const pieces = unit.syllables.map((syllable, i) => ({
          text: syllable.text,
          start: syllable.startMs!,
          end: ends[index + i],
        }));
        dialogue(
          2,
          eventStart,
          block.end,
          `${lineStyle}-Ruby`,
          part.name,
          "fx",
          `{\\an2\\pos(${round(center)},${round(bandBottom(block.row, "ruby"))})\\fad(150,150)}` +
            karaoke(pieces, eventStart, options.fill),
        );
      }
      index += unit.syllables.length;
      before += unit.text;
    }
    const sub = (
      band: "roman" | "translation",
      text: string,
      subStyle: string,
      bold = false,
    ) => {
      const textWidth = width(text, size[band], bold);
      dialogue(
        0,
        eventStart,
        block.end,
        subStyle,
        part.name,
        "",
        `{\\an1\\pos(${round(x(side, textWidth))},${round(bandBottom(block.row, band))})\\fad(150,150)}${escape(text)}`,
      );
    };
    if (block.background) {
      const bg = block.background;
      const bgWidth = width(bg.line.text, size.background, style.mainBold);
      dialogue(
        1,
        eventStart,
        block.end,
        `${partStyle(bg.part)}-Background`,
        bg.part.name,
        "fx",
        `{\\an1\\pos(${round(x(side, bgWidth))},${round(bandBottom(block.row, "background"))})\\fad(150,150)}` +
          karaoke(basePieces(bg.line), eventStart, options.fill),
      );
    }
    if (style.includeRoman && line.roman.trim())
      sub("roman", line.roman.trim(), "Mako-Romaji", style.romanBold);
    if (line.translation.trim())
      sub("translation", line.translation.trim(), "Mako-Translation");
  }
  // The karaoke source: every line of every part, as Aegisub keeps it.
  for (const part of parts)
    for (const line of part.lines)
      dialogue(
        0,
        line.startMs!,
        line.endMs!,
        partStyle(part),
        part.name,
        "karaoke",
        karaoke(sourcePieces(line), line.startMs!, "k"),
        "Comment",
      );

  const font = style.font.replace(/,/g, " ");
  const outlineColor = assColor(style.outlineColor);
  const outlineMain = Math.round(style.outline * scale);
  const outlineSmall =
    style.outline === 0
      ? 0
      : Math.max(1, Math.round(style.outline * (2 / 3) * scale));
  const solid = assColor(style.solidColor);
  const lyricColor = (part: VocalPart) =>
    style.colorMode === "solid" ? solid : assColor(part.color);
  const styleLine = (
    name: string,
    fontSize: number,
    primary: string,
    secondary: string,
    outline: number,
    bold: boolean,
  ) =>
    `Style: ${name},${font},${fontSize},${primary},${secondary},${outlineColor},&H64000000,${bold ? -1 : 0},0,0,0,100,100,0,0,1,${outline},0,1,0,0,0,1`;
  const white = "&H00FFFFFF";
  const unsung = assColor(style.unsungColor);
  const roman = assColor(style.romanColor);
  const styles = [
    ...parts.flatMap((part) => {
      const name = partStyle(part);
      const color = lyricColor(part);
      const ruby = style.rubyColor ? assColor(style.rubyColor) : color;
      return [
        styleLine(name, size.main, color, unsung, outlineMain, style.mainBold),
        styleLine(
          `${name}-Ruby`,
          size.ruby,
          ruby,
          unsung,
          outlineSmall,
          style.rubyBold,
        ),
        styleLine(
          `${name}-Background`,
          size.background,
          color,
          unsung,
          outlineSmall,
          style.mainBold,
        ),
      ];
    }),
    ...(style.includeRoman
      ? [
          styleLine(
            "Mako-Romaji",
            size.roman,
            roman,
            unsung,
            outlineSmall,
            style.romanBold,
          ),
        ]
      : []),
    styleLine(
      "Mako-Translation",
      size.translation,
      white,
      white,
      outlineSmall,
      false,
    ),
  ];
  const partInfo = parts.map(
    (part) =>
      `; mako-part: ${[part.name, part.kind, part.background ? 1 : 0, part.color, part.id === project.mainPartId ? 1 : 0].map((v) => String(v).replace(/[|\r\n]/g, " ")).join("|")}`,
  );
  const text = [
    "[Script Info]",
    "; Mako LRC Studio: Dialogue lines with Effect fx are the rendered layout; Comment lines with Effect karaoke are the timing source.",
    ...partInfo,
    `; mako-languages: ${project.translationLang}|${project.romanLang}`,
    `; mako-style: ${JSON.stringify(style)}`,
    `Title: ${escape(project.metadata.ti || project.name)}`,
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    `PlayResX: ${options.width}`,
    `PlayResY: ${options.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events.map(serializeAssEvent),
    "",
  ].join("\n");
  return { text, notices: [...new Set(notices)] };
}

export interface AssImport {
  parts: VocalPart[];
  mainIndex: number;
  metadata: Record<string, string>;
  name: string | null;
  translationLang: string;
  romanLang: string;
  /** Present only when the file carries this tool's ; mako-style comment. */
  assStyle: AssStyle | null;
  notices: string[];
}

const parseAssTime = (value: string) => {
  const match = /^(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})$/.exec(value.trim());
  if (!match) return null;
  const fraction = Number(match[4].padEnd(2, "0").slice(0, 2));
  return (
    ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) *
      1000 +
    fraction * 10
  );
};
/** Override blocks other than karaoke carry no lyric. */
const stripTags = (text: string) =>
  text
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\[Nn]/g, " ")
    .replace(/\\h/g, " ");
const hasKaraoke = (text: string) => /\{[^}]*\\(k|kf|K|ko)\d/.test(text);

interface Record_ {
  text: string;
  reading?: string;
  start: number;
  end: number;
}
/** {\k} segments with absolute times; `|` carries furigana, `#` continues a base. */
function karaokeRecords(text: string, start: number): Record_[] {
  const records: Record_[] = [];
  let time = start;
  let current: Record_ | null = null;
  const pattern = /\{([^}]*)\}|([^{]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match[1] !== undefined) {
      const tags = [...match[1].matchAll(/\\(?:kf|ko|k|K)(\d+)/g)];
      for (const tag of tags) {
        current = { text: "", start: time, end: time + Number(tag[1]) * 10 };
        time = current.end;
        records.push(current);
      }
    } else if (current)
      current.text += match[2].replace(/\\[Nn]/g, " ").replace(/\\h/g, " ");
    else records.push((current = { text: match[2], start: time, end: time }));
  }
  return records.map((record) => {
    const bar = record.text.indexOf("|");
    return bar < 0
      ? record
      : {
          ...record,
          text: record.text.slice(0, bar),
          reading: record.text.slice(bar + 1),
        };
  });
}

/** Karaoke records into units: furigana makes ruby, silence makes a pause. */
function karaokeLine(records: Record_[]): LyricLine | null {
  const units: TimingUnit[] = [];
  let lastSyllable: Syllable | null = null;
  for (const record of records) {
    const reading = record.reading?.trim();
    const continuing = record.text === "#";
    if (continuing && units.at(-1)?.ruby && reading) {
      const syllable = {
        ...newSyllable(reading, record.start),
        endMs: record.end,
      };
      units.at(-1)!.syllables.push(syllable);
      lastSyllable = syllable;
      continue;
    }
    if (continuing) {
      // A bare # lengthens the syllable before it.
      if (lastSyllable) lastSyllable.endMs = record.end;
      continue;
    }
    if (!record.text.trim()) {
      // Silence or a lone space: the space joins the word before it.
      if (units.length && record.text) {
        const unit = units.pop()!;
        units.push(retextUnit(unit, unit.text + record.text));
      }
      continue;
    }
    const syllable = reading
      ? { ...newSyllable(reading, record.start), endMs: record.end }
      : { ...newSyllable(record.text, record.start), endMs: record.end };
    units.push({
      id: newId(),
      text: record.text,
      ruby: !!reading,
      syllables: [syllable],
    });
    lastSyllable = syllable;
  }
  if (!units.length) return null;
  const line = { ...newLine(units.map((unit) => unit.text).join("")), units };
  const syllables = units.flatMap((unit) => unit.syllables);
  line.startMs = syllables[0].startMs;
  line.endMs = syllables.at(-1)!.endMs;
  syllables.forEach((syllable, index) => {
    const next = syllables[index + 1];
    if (!next || syllable.endMs! >= next.startMs!) syllable.endMs = null;
  });
  return line;
}

interface AssEvent {
  kind: string;
  start: number;
  end: number;
  style: string;
  actor: string;
  effect: string;
  text: string;
}

/**
 * Karaoke lines (Comment or Dialogue) become parts by actor, else by style;
 * rendered fx lines are skipped, and this tool's translation and romaji
 * styles go back onto the line they were shown with.
 */
export function importAss(text: string): AssImport {
  const notices = new Set<string>();
  let section = "",
    title: string | null = null,
    languages = ["", ""],
    assStyle: AssStyle | null = null;
  const info: {
    name: string;
    kind: string;
    background: boolean;
    color: string;
    main: boolean;
  }[] = [];
  let format: string[] = [];
  const events: AssEvent[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) {
      section = line.toLowerCase();
      continue;
    }
    if (section === "[script info]") {
      const styled = /^; mako-style:\s*(.*)$/.exec(line);
      if (styled) {
        try {
          const parsed = JSON.parse(styled[1]);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("样式不是对象");
          assStyle = normalizeAssStyle(parsed);
        } catch {
          notices.add("ASS 样式注释无法解析，已忽略。");
        }
      }
      const part = /^; mako-part: (.*)$/.exec(line);
      if (part) {
        const [name, kind, background, color, main] = part[1].split("|");
        info.push({
          name,
          kind,
          background: background === "1",
          color,
          main: main === "1",
        });
      }
      const langs = /^; mako-languages: (.*)\|(.*)$/.exec(line);
      if (langs) languages = [langs[1].trim(), langs[2].trim()];
      const titled = /^Title:\s*(.*)$/i.exec(line);
      if (titled && titled[1].trim()) title = titled[1].trim();
      continue;
    }
    if (section !== "[events]") continue;
    if (/^Format:/i.test(line)) {
      format = line
        .slice(7)
        .split(",")
        .map((field) => field.trim().toLowerCase());
      continue;
    }
    const event = /^(Dialogue|Comment):\s*(.*)$/i.exec(line);
    if (!event || !format.length) continue;
    const fields = event[2].split(",");
    const values = [
      ...fields.slice(0, format.length - 1),
      fields.slice(format.length - 1).join(","),
    ];
    const get = (name: string) => values[format.indexOf(name)]?.trim() ?? "";
    const start = parseAssTime(get("start")),
      end = parseAssTime(get("end"));
    if (start === null || end === null) continue;
    events.push({
      kind: event[1].toLowerCase(),
      start,
      end,
      style: get("style"),
      actor: get("name") || get("actor"),
      effect: get("effect").toLowerCase(),
      text: values[format.indexOf("text")] ?? "",
    });
  }
  if (!events.length) throw new Error("ASS 文件里没有字幕事件。");
  const isSub = (event: AssEvent) =>
    event.style === "Mako-Translation" || event.style === "Mako-Romaji";
  const karaoke = events.filter(
    (event) =>
      !isSub(event) &&
      event.effect !== "fx" &&
      (event.effect === "karaoke" || hasKaraoke(event.text)),
  );
  // Without karaoke, plain dialogue is still line timing.
  const sources = karaoke.length
    ? karaoke
    : events.filter(
        (event) =>
          event.kind === "dialogue" && event.effect !== "fx" && !isSub(event),
      );
  if (!karaoke.length) notices.add("文件没有卡拉 OK 计时，只导入了逐行时间。");
  const byKey = new Map<string, VocalPart>();
  const keyOf = (event: AssEvent) =>
    event.actor || event.style.replace(/^Mako-/, "") || "主唱";
  for (const event of sources) {
    const key = keyOf(event);
    let part = byKey.get(key);
    if (!part) {
      const meta = info.find((item) => item.name === key);
      part = newPart(
        key,
        [],
        meta && /^#[0-9a-f]{6}$/i.test(meta.color)
          ? meta.color
          : partColors[byKey.size % partColors.length],
      );
      if (meta) {
        part.kind = (["person", "group", "other"] as PartKind[]).includes(
          meta.kind as PartKind,
        )
          ? (meta.kind as PartKind)
          : "person";
        part.background = meta.background;
      }
      byKey.set(key, part);
    }
    const line = karaoke.length
      ? karaokeLine(karaokeRecords(event.text, event.start))
      : {
          ...newLine(stripTags(event.text).trim(), event.start),
          endMs: event.end,
        };
    if (line?.text.trim()) part.lines.push(line);
  }
  const parts = [...byKey.values()].filter((part) => part.lines.length);
  if (!parts.length) throw new Error("ASS 文件里没有可导入的歌词行。");
  for (const part of parts) part.lines.sort((a, b) => a.startMs! - b.startMs!);
  for (const event of events.filter(isSub)) {
    const part = byKey.get(keyOf(event));
    const field = event.style === "Mako-Translation" ? "translation" : "roman";
    let best: LyricLine | null = null,
      shared = 0;
    for (const line of part?.lines ?? []) {
      const overlap =
        Math.min(event.end, line.endMs ?? line.startMs!) -
        Math.max(event.start, line.startMs!);
      if (overlap > shared) [best, shared] = [line, overlap];
    }
    if (best) best[field] = stripTags(event.text).trim();
  }
  const conflicts = parts.reduce(
    (count, part) =>
      count +
      validateLines(part.lines, Infinity, false).filter(
        (i) => i.kind === "conflict",
      ).length,
    0,
  );
  if (conflicts)
    notices.add(`有 ${conflicts} 处时间冲突（同一声部的行重叠等），请检查。`);
  const main = parts.findIndex(
    (part) => info.find((item) => item.name === part.name)?.main,
  );
  return {
    parts,
    mainIndex: Math.max(0, main),
    metadata: title ? { ti: title } : {},
    name: title,
    translationLang: languages[0],
    romanLang: languages[1],
    assStyle,
    notices: [...notices],
  };
}

export const looksLikeAss = (text: string): boolean =>
  /^\s*\[Script Info\]/i.test(text.replace(/^﻿/, ""));
