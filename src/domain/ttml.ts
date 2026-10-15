import {
  TTMLGenerator,
  TTMLParser,
  type Agent,
  type BackgroundVocal,
  type GeneratorOptions,
  type LyricBase,
  type LyricLine as TtmlLine,
  type Syllable as TtmlSyllable,
  type TTMLParserOptions,
  type TTMLResult,
  type SubLyricContent,
} from "@applemusic-like-lyrics/ttml";
import {
  newId,
  newLine,
  newPart,
  newSyllable,
  partColors,
  syllableRefs,
  validateLines,
  type LyricLine,
  type PartKind,
  type ProjectDraft,
  type TimingUnit,
  type VocalPart,
} from "./model";
import { songLines, type SongVoice } from "./song";

export interface TtmlExportOptions {
  /** Write each ruby group as plain text timed as a whole, for players without ruby. */
  foldRuby?: boolean;
  dom?: Pick<GeneratorOptions, "domImplementation" | "xmlSerializer">;
}
export interface TtmlExport {
  text: string;
  notices: string[];
}

/** Each syllable ends at its explicit end, the next start, or the line end. */
function syllableEnds(line: LyricLine): number[] {
  const refs = syllableRefs(line);
  return refs.map(
    ({ syllable }, index) =>
      syllable.endMs ?? refs[index + 1]?.syllable.startMs ?? line.endMs!,
  );
}

function words(line: LyricLine, foldRuby: boolean): TtmlSyllable[] {
  const ends = syllableEnds(line);
  let index = 0;
  const result: TtmlSyllable[] = [];
  for (const unit of line.units) {
    const own = unit.syllables.map((syllable) => ({
      text: syllable.text,
      startTime: syllable.startMs!,
      endTime: ends[index++],
    }));
    // Spaces are never inside a TTML word: they become endsWithSpace.
    if (/^\s/.test(unit.text) && result.length)
      result[result.length - 1].endsWithSpace = true;
    const text = unit.text.trim();
    const word: TtmlSyllable = {
      text,
      startTime: own[0].startTime,
      endTime: own.at(-1)!.endTime,
    };
    if (unit.ruby && !foldRuby) word.ruby = own;
    if (/\s$/.test(unit.text)) word.endsWithSpace = true;
    if (text) result.push(word);
  }
  return result;
}

function romanWords(line: LyricLine): TtmlSyllable[] | undefined {
  const sounded = line.units.filter((unit) => /[\p{L}\p{N}]/u.test(unit.text));
  if (!sounded.length || sounded.some((unit) => !unit.roman)) return undefined;
  const timed = words(line, true);
  let position = 0;
  return line.units.flatMap((unit) => {
    if (!unit.text.trim()) return [];
    const word = timed[position++];
    return unit.roman
      ? [{ ...word, text: unit.roman, endsWithSpace: true, ruby: undefined }]
      : [];
  });
}

/**
 * Word romanization replaces the line text in TTML, so take its spacing from
 * the line text where the words can be found there in order.
 */
function spaceLike(timed: TtmlSyllable[], text: string) {
  let rest = text.trim();
  const fits = timed.every((word) => {
    rest = rest.trimStart();
    if (!rest.startsWith(word.text)) return false;
    rest = rest.slice(word.text.length);
    word.endsWithSpace = /^\s/.test(rest);
    return true;
  });
  if (!fits || !text.trim())
    timed.forEach((word) => (word.endsWithSpace = true));
  timed.at(-1)!.endsWithSpace = false;
}

function content(
  line: LyricLine,
  project: ProjectDraft,
  foldRuby: boolean,
): BackgroundVocal {
  const result: LyricBase = {
    text: line.text.trim(),
    startTime: line.startMs!,
    endTime: line.endMs!,
    words: words(line, foldRuby),
  };
  if (line.translation.trim())
    result.translations = [
      {
        language: project.translationLang || undefined,
        text: line.translation.trim(),
      },
    ];
  if (line.roman.trim() || romanWords(line)) {
    const roman: SubLyricContent = {
      language: project.romanLang || undefined,
      text: line.roman.trim(),
    };
    const timed = romanWords(line);
    if (timed) {
      spaceLike(timed, line.roman);
      roman.words = timed;
      roman.text ||= timed.map((word) => word.text).join(" ");
    }
    result.romanizations = [roman];
  }
  return result;
}

/** Lines of one background part riding on the same main line become one x-bg. */
function mergeBackground(
  voices: SongVoice[],
  project: ProjectDraft,
  foldRuby: boolean,
): BackgroundVocal {
  const parts = voices.map((voice) => content(voice.line, project, foldRuby));
  if (parts.length === 1) return parts[0];
  const join = (
    pick: (item: BackgroundVocal) => SubLyricContent | undefined,
  ) => {
    const items = parts.map(pick).filter((item) => item?.text);
    return items.length
      ? [
          {
            ...items[0]!,
            text: items.map((item) => item!.text).join(" "),
            words: undefined,
          },
        ]
      : undefined;
  };
  return {
    text: parts.map((item) => item.text).join(" "),
    startTime: parts[0].startTime,
    endTime: parts.at(-1)!.endTime,
    words: parts.flatMap((item, index) =>
      (item.words ?? []).map((word, w, all) =>
        w === all.length - 1 && index < parts.length - 1
          ? { ...word, endsWithSpace: true }
          : word,
      ),
    ),
    translations: join((item) => item.translations?.[0]),
    romanizations: join((item) => item.romanizations?.[0]),
  };
}

function language(project: ProjectDraft): string | undefined {
  const text = project.parts
    .flatMap((part) => part.lines.map((l) => l.text))
    .join("");
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja";
  if (/\p{Script=Han}/u.test(text)) return "zh";
  if (/\p{Script=Hangul}/u.test(text)) return "ko";
  if (/\p{Script=Latin}/u.test(text)) return "en";
  return undefined;
}

/**
 * All parts in the AMLL dialect: singers become agents (groups v1000 on),
 * background parts become x-bg on the main line they overlap most.
 */
export function exportTtml(
  project: ProjectDraft,
  options: TtmlExportOptions = {},
): TtmlExport {
  const foldRuby = !!options.foldRuby;
  const duration = project.audio?.durationMs ?? Infinity;
  const parts = project.parts.filter((part) => part.lines.length);
  if (!parts.length) throw new Error("请先导入歌词。");
  for (const part of parts) {
    const issue = validateLines(part.lines, duration)[0];
    if (issue)
      throw new Error(`无法导出 TTML：声部「${part.name}」${issue.message}`);
  }
  const notices: string[] = [];
  const agents: Record<string, Agent> = {};
  const agentOf = new Map<string, string>();
  let people = 0,
    groups = 0;
  for (const part of parts.filter((item) => !item.background)) {
    const id = part.kind === "group" ? `v${1000 + groups++}` : `v${++people}`;
    agents[id] = { id, name: part.name, type: part.kind };
    agentOf.set(part.id, id);
  }
  const song = songLines({ ...project, parts });
  if (!agentOf.size) throw new Error("TTML 需要至少一个非和声声部承载和声。");
  let merged = 0;
  const lines: TtmlLine[] = song.map((entry) => {
    const line: TtmlLine = {
      ...content(entry.line, project, foldRuby),
      agentId: agentOf.get(entry.part.id),
    };
    if (entry.line.songPart) line.songPart = entry.line.songPart;
    if (entry.backgrounds.length) {
      const from = new Set(entry.backgrounds.map((voice) => voice.part.id));
      if (from.size > 1)
        throw new Error(
          `无法导出 TTML：「${entry.line.text}」同时挂了 ${[...from].map((id) => `「${parts.find((p) => p.id === id)!.name}」`).join("")} 的和声，TTML 每行只能有一个和声。请调整其中一个声部的时间。`,
        );
      const voices = [...entry.backgrounds].sort(
        (a, b) => a.line.startMs! - b.line.startMs!,
      );
      if (voices.length > 1) merged += voices.length - 1;
      const bg = mergeBackground(voices, project, foldRuby);
      line.backgroundVocal = bg;
      line.startTime = Math.min(line.startTime, bg.startTime);
      line.endTime = Math.max(line.endTime, bg.endTime);
    }
    return line;
  });
  if (merged)
    notices.push(`有 ${merged} 行和声与同一主行重叠，已合并进该行的和声。`);
  const result: TTMLResult = {
    metadata: {
      language: language(project),
      timingMode: "Word",
      agents,
      title: [project.metadata.ti || project.name].filter(Boolean),
      artist: project.metadata.ar ? [project.metadata.ar] : undefined,
      album: project.metadata.al ? [project.metadata.al] : undefined,
    },
    lines,
  };
  return {
    text: TTMLGenerator.generate(result, options.dom ?? {}),
    notices,
  };
}

export interface TtmlImport {
  parts: VocalPart[];
  metadata: Record<string, string>;
  name: string | null;
  translationLang: string;
  romanLang: string;
  notices: string[];
}

const kindOf = (type?: string): PartKind =>
  type === "group" ? "group" : type === "other" ? "other" : "person";

/** TTML words back into units: a gap before the next word is a pause. */
function toLine(
  source: LyricBase,
  notices: Set<string>,
  lineTimed = false,
): LyricLine {
  // A line-timed file gets one made-up word per line: split it here instead.
  const timed = lineTimed ? [] : (source.words ?? []);
  if (!timed.length) {
    const line = newLine(source.text, source.startTime);
    line.endMs = source.endTime;
    return line;
  }
  const units: TimingUnit[] = timed.map((word) => {
    const text = word.text + (word.endsWithSpace ? " " : "");
    if (word.obscene || word.emptyBeat !== undefined)
      notices.add("已忽略 obscene／emptyBeat 标记。");
    if (word.ruby?.length)
      return {
        id: newId(),
        text,
        ruby: true,
        syllables: word.ruby.map((tag) => ({
          ...newSyllable(tag.text, tag.startTime),
          endMs: tag.endTime,
        })),
      };
    return {
      id: newId(),
      text,
      ruby: false,
      syllables: [
        { ...newSyllable(text, word.startTime), endMs: word.endTime },
      ],
    };
  });
  const line: LyricLine = {
    ...newLine(units.map((unit) => unit.text).join("")),
    units,
  };
  const syllables = units.flatMap((unit) => unit.syllables);
  line.startMs = syllables[0].startMs;
  line.endMs = syllables.at(-1)!.endMs;
  // An end that meets the next start is the shared boundary, not a pause.
  syllables.forEach((syllable, index) => {
    const next = syllables[index + 1];
    if (!next || syllable.endMs! >= next.startMs!) syllable.endMs = null;
  });
  return line;
}

function attachSubs(
  line: LyricLine,
  source: LyricBase,
  langs: { translation?: string; roman?: string },
  notices: Set<string>,
) {
  const translation = source.translations?.[0];
  if ((source.translations?.length ?? 0) > 1)
    notices.add("文件有多种翻译，只保留第一种。");
  if (translation) {
    line.translation = translation.text;
    langs.translation ??= translation.language;
  }
  const roman = source.romanizations?.[0];
  if ((source.romanizations?.length ?? 0) > 1)
    notices.add("文件有多种音译，只保留第一种。");
  if (roman) {
    line.roman = roman.text;
    langs.roman ??= roman.language;
    for (const word of roman.words ?? []) {
      const unit = line.units.find(
        (item) => item.syllables[0].startMs === word.startTime,
      );
      if (unit) unit.roman = word.text;
    }
  }
}

export interface TtmlImportOptions extends TTMLParserOptions {
  xmlSerializer?: { serializeToString(node: never): string };
}
const ITUNES = "http://music.apple.com/lyric-ttml-internal";

/** The parser skips lines without itunes:key, which many files lack: number them. */
function keyLines(text: string, options: TtmlImportOptions): string {
  const parser = options.domParser ?? new DOMParser();
  const doc = parser.parseFromString(text, "application/xml") as Document;
  if (!doc.documentElement || doc.getElementsByTagName("parsererror").length)
    throw new Error("XML 格式无效");
  let changed = false,
    n = 0;
  for (const p of Array.from(doc.getElementsByTagName("p"))) {
    n++;
    if (p.getAttributeNS(ITUNES, "key") || p.getAttribute("itunes:key"))
      continue;
    p.setAttributeNS(ITUNES, "itunes:key", `mako-L${n}`);
    changed = true;
  }
  if (!changed) return text;
  const serializer = options.xmlSerializer ?? new XMLSerializer();
  return serializer.serializeToString(doc as never);
}

export function importTtml(
  text: string,
  options: TtmlImportOptions = {},
): TtmlImport {
  let result: TTMLResult;
  try {
    result = TTMLParser.parse(keyLines(text, options), options);
  } catch (error) {
    throw new Error(`TTML 无法解析：${(error as Error).message}`);
  }
  const notices = new Set<string>();
  const langs: { translation?: string; roman?: string } = {};
  const byAgent = new Map<string, VocalPart>();
  let background: VocalPart | null = null;
  const agents = result.metadata.agents ?? {};
  const lineTimed = result.metadata.timingMode === "Line";
  for (const source of result.lines) {
    const agentId = source.agentId ?? "v1";
    let part = byAgent.get(agentId);
    if (!part) {
      const agent = agents[agentId];
      const kind = kindOf(
        agent?.type ?? (agentId === "v1000" ? "group" : "person"),
      );
      const name =
        agent?.name?.trim() ||
        (kind === "group"
          ? "合唱"
          : byAgent.size
            ? `演唱者 ${byAgent.size + 1}`
            : "主唱");
      part = newPart(name, [], partColors[byAgent.size % partColors.length]);
      part.kind = kind;
      byAgent.set(agentId, part);
    }
    const line = toLine(source, notices, lineTimed);
    if (source.songPart) line.songPart = source.songPart;
    attachSubs(line, source, langs, notices);
    part.lines.push(line);
    if (source.backgroundVocal) {
      background ??= {
        ...newPart(
          "和声",
          [],
          partColors[(byAgent.size + 1) % partColors.length],
        ),
        background: true,
      };
      const bg = source.backgroundVocal;
      // Apple's x-bg may have no times of its own: take them from its words.
      const bgLine = toLine(
        {
          ...bg,
          startTime:
            bg.startTime || bg.words?.[0]?.startTime || source.startTime,
          endTime: bg.endTime || bg.words?.at(-1)?.endTime || source.endTime,
        },
        notices,
        lineTimed,
      );
      attachSubs(bgLine, bg, langs, notices);
      background.lines.push(bgLine);
    }
  }
  const parts = [...byAgent.values()];
  if (background) parts.push(background);
  if (!parts.length) throw new Error("TTML 里没有歌词行。");
  for (const part of parts) {
    part.lines.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    // Names must be unique for the part list and for ASS styles.
    const same = parts.filter((other) => other.name === part.name);
    if (same.length > 1)
      same.forEach((other, i) => i && (other.name += ` ${i + 1}`));
  }
  const conflicts = parts.reduce(
    (count, part) =>
      count +
      validateLines(part.lines, Infinity, false).filter(
        (issue) => issue.kind === "conflict",
      ).length,
    0,
  );
  if (conflicts)
    notices.add(`有 ${conflicts} 处时间冲突（同一声部的行重叠等），请检查。`);
  const metadata: Record<string, string> = {};
  const meta = result.metadata;
  if (meta.title?.[0]) metadata.ti = meta.title[0];
  if (meta.artist?.length) metadata.ar = meta.artist.join(" / ");
  if (meta.album?.[0]) metadata.al = meta.album[0];
  return {
    parts,
    metadata,
    name: meta.title?.[0] ?? null,
    translationLang: langs.translation ?? "",
    romanLang: langs.roman ?? "",
    notices: [...notices],
  };
}

export const looksLikeTtml = (text: string): boolean =>
  /^\s*(<\?xml[^>]*>\s*)?<tt[\s>]/.test(text.replace(/^﻿/, ""));
