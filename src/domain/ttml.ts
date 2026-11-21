import {
  TTMLParser,
  type Agent,
  type BackgroundVocal,
  type GeneratorOptions,
  type LyricBase,
  type LyricLine as TtmlLine,
  type PlatformId,
  type Syllable as TtmlSyllable,
  type TTMLMetadata,
  type TTMLParserOptions,
  type TTMLResult,
  type SubLyricContent,
} from "@applemusic-like-lyrics/ttml";
import {
  newId,
  newLine,
  newPart,
  newSyllable,
  normalizeTtmlMetadata,
  partColors,
  syllableRefs,
  untitledName,
  validateLines,
  type LyricLine,
  type PartKind,
  type ProjectDraft,
  type TimingUnit,
  type VocalPart,
} from "./model";
import { songLines, type SongVoice } from "./song";

const NS = {
  TT: "http://www.w3.org/ns/ttml",
  TTM: "http://www.w3.org/ns/ttml#metadata",
  TTS: "http://www.w3.org/ns/ttml#styling",
  ITUNES: "http://music.apple.com/lyric-ttml-internal",
  AMLL: "http://www.example.com/ns/amll",
  XML: "http://www.w3.org/XML/1998/namespace",
  XMLNS: "http://www.w3.org/2000/xmlns/",
} as const;

export type TtmlRubyMode = "amll" | "ttml2" | "fold";

export interface TtmlExportOptions {
  /**
   * How ruby annotations are written:
   * - "amll" (default): AMLL timed ruby (base + textContainer > timed text*)
   * - "ttml2": W3C TTML2 §10.2.35 ruby (base + text with timed inner spans)
   * - "fold": plain base text timed as a whole, for players without ruby
   */
  rubyMode?: TtmlRubyMode;
  /** @deprecated Use rubyMode: "fold" instead. */
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

/** Each sounded unit's romanization, timed with the unit; none if one is missing. */
function romanWords(line: LyricLine): TtmlSyllable[] | undefined {
  const sounded = line.units.filter((unit) => /[\p{L}\p{N}]/u.test(unit.text));
  if (!sounded.length || sounded.some((unit) => !unit.roman)) return undefined;
  const timed = words(line, true);
  let position = 0;
  return line.units.flatMap((unit) => {
    if (!unit.text.trim()) return [];
    const word = timed[position++];
    return unit.roman
      ? [{ ...word, text: unit.roman, endsWithSpace: false, ruby: undefined }]
      : [];
  });
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasLetters = (text: string) => /[\p{L}\p{N}]/u.test(text);

/**
 * Word romanization replaces the line romanization in TTML. Spell the words
 * the way the line does (case, punctuation, spaces), so the line reads the
 * same; null when the line has letters that no unit romanization covers.
 */
function spell(timed: TtmlSyllable[], text: string): TtmlSyllable[] | null {
  const result: TtmlSyllable[] = [];
  let at = 0;
  for (const word of timed) {
    const pattern = new RegExp(escapeRegExp(word.text), "giu");
    pattern.lastIndex = at;
    const found = pattern.exec(text);
    if (!found) return null;
    const gap = text.slice(at, found.index);
    if (hasLetters(gap)) return null;
    let prefix = gap;
    const previous = result.at(-1);
    if (previous) {
      // Marks before a space close the previous word, the rest opens this one.
      const [, close, space, open] = /^(\S*)(\s*)([\s\S]*)$/.exec(gap)!;
      previous.text += close;
      previous.endsWithSpace = !!space;
      prefix = open;
    }
    result.push({
      ...word,
      text: prefix.replace(/\s+/g, "") + found[0],
      endsWithSpace: false,
    });
    at = found.index + found[0].length;
  }
  const rest = text.slice(at);
  if (hasLetters(rest)) return null;
  result.at(-1)!.text += rest.replace(/\s+/g, "");
  return result;
}

interface ExportNotes {
  /** Lines whose word romanization does not spell their line romanization. */
  romanMismatch: number;
}

function content(
  line: LyricLine,
  project: ProjectDraft,
  foldRuby: boolean,
  notes: ExportNotes,
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
  const text = line.roman.trim();
  const timed = romanWords(line);
  if (text || timed) {
    const roman: SubLyricContent = {
      language: project.romanLang || undefined,
      text,
    };
    if (timed && !text) {
      timed.forEach((word, i) => (word.endsWithSpace = i < timed.length - 1));
      roman.words = timed;
      roman.text = timed.map((word) => word.text).join(" ");
    } else if (timed) {
      const spelled = spell(timed, text);
      // The line romanization is what the user reads; keep it whole.
      if (spelled) roman.words = spelled;
      else notes.romanMismatch++;
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
  notes: ExportNotes,
): BackgroundVocal {
  const parts = voices.map((voice) =>
    content(voice.line, project, foldRuby, notes),
  );
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

/**
 * W3C TTML2 §12.3.1 clock-time: HH:MM:SS.fff (minutes and seconds in 00..59,
 * hours at least two digits). Parsed cleanly by both W3C and AMLL parsers.
 */
function formatTtmlTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor(total / 60000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  const millis = total % 1000;
  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}.` +
    `${String(millis).padStart(3, "0")}`
  );
}

/**
 * Translations or romanizations that belong in <iTunesMetadata> (head): any
 * entry with word timings, plus its same-language main/x-bg counterpart on the
 * same line so a pair is never written both in the head and inline.
 */
function headOnly(lines: TtmlLine[]): Set<SubLyricContent> {
  const result = new Set<SubLyricContent>();
  for (const line of lines)
    for (const key of ["translations", "romanizations"] as const) {
      const all = [
        ...(line[key] ?? []),
        ...(line.backgroundVocal?.[key] ?? []),
      ];
      for (const item of all)
        if (item.words?.length)
          for (const other of all)
            if (other.language === item.language) result.add(other);
    }
  return result;
}

function pairSubContents(
  mainList?: SubLyricContent[],
  bgList?: SubLyricContent[],
): { lang?: string; main?: SubLyricContent; bg?: SubLyricContent }[] {
  const map = new Map<
    string | undefined,
    { lang?: string; main?: SubLyricContent; bg?: SubLyricContent }
  >();
  const get = (lang?: string) => {
    let entry = map.get(lang);
    if (!entry) map.set(lang, (entry = { lang }));
    return entry;
  };
  mainList?.forEach((item) => {
    get(item.language).main = item;
  });
  bgList?.forEach((item) => {
    get(item.language).bg = item;
  });
  return [...map.values()];
}

/**
 * Serialize a TTMLResult using explicit XML namespaces (`createElementNS`) so
 * browsers never emit `xmlns=""` or drop `<iTunesMetadata>`'s namespace, with
 * W3C TTML2 clock-time expressions, required `xml:lang`, and valid containment.
 */
function serializeTtml(
  result: TTMLResult,
  rubyMode: TtmlRubyMode,
  dom: TtmlExportOptions["dom"] = {},
): string {
  const domImpl = (dom.domImplementation ??
    (typeof document !== "undefined"
      ? document.implementation
      : null)) as DOMImplementation | null;
  if (!domImpl) throw new Error("缺少 DOMImplementation，无法生成 TTML。");
  const serializer = (dom.xmlSerializer ??
    (typeof XMLSerializer !== "undefined"
      ? new XMLSerializer()
      : null)) as XMLSerializer | null;
  if (!serializer) throw new Error("缺少 XMLSerializer，无法序列化 TTML。");

  const doc = domImpl.createDocument(NS.TT, "tt", null);
  const root = doc.documentElement;
  root.setAttributeNS(NS.XMLNS, "xmlns:amll", NS.AMLL);
  root.setAttributeNS(NS.XMLNS, "xmlns:itunes", NS.ITUNES);
  root.setAttributeNS(NS.XMLNS, "xmlns:ttm", NS.TTM);
  root.setAttributeNS(NS.XMLNS, "xmlns:tts", NS.TTS);
  // W3C TTML2 §8.1.1: xml:lang is required on <tt>; empty means unspecified.
  root.setAttributeNS(NS.XML, "xml:lang", result.metadata.language ?? "");
  root.setAttributeNS(
    NS.ITUNES,
    "itunes:timing",
    result.metadata.timingMode ?? "Word",
  );

  const lines = result.lines.map((line, index) => ({
    ...line,
    id: line.id?.trim() || `L${index + 1}`,
    agentId: line.agentId || "v1",
  }));
  const inHead = headOnly(lines);

  const ttEl = (tag: string) => doc.createElementNS(NS.TT, tag);
  const itunesEl = (tag: string) => doc.createElementNS(NS.ITUNES, tag);

  const appendRuby = (
    parent: Element,
    syllable: TtmlSyllable,
    baseText: string,
    ns: string,
  ) => {
    const mkSpan = () => doc.createElementNS(ns, "span");
    const container = mkSpan();
    container.setAttributeNS(NS.TTS, "tts:ruby", "container");
    const base = mkSpan();
    base.setAttributeNS(NS.TTS, "tts:ruby", "base");
    base.textContent = baseText;
    container.appendChild(base);
    const tags = syllable.ruby!;
    if (rubyMode === "ttml2") {
      // W3C TTML2 §10.2.35: container -> base + text (1:1); multi-syllable
      // timings live on plain inner spans without tts:ruby.
      const textEl = mkSpan();
      textEl.setAttributeNS(NS.TTS, "tts:ruby", "text");
      if (tags.length === 1) {
        textEl.setAttribute("begin", formatTtmlTime(tags[0].startTime));
        textEl.setAttribute("end", formatTtmlTime(tags[0].endTime));
        textEl.textContent = tags[0].text;
      } else {
        for (const rt of tags) {
          const piece = mkSpan();
          piece.setAttribute("begin", formatTtmlTime(rt.startTime));
          piece.setAttribute("end", formatTtmlTime(rt.endTime));
          piece.textContent = rt.text;
          textEl.appendChild(piece);
        }
      }
      container.appendChild(textEl);
    } else {
      // AMLL dialect: base + textContainer > timed text*
      const textContainer = mkSpan();
      textContainer.setAttributeNS(NS.TTS, "tts:ruby", "textContainer");
      for (const rt of tags) {
        const rtSpan = mkSpan();
        rtSpan.setAttributeNS(NS.TTS, "tts:ruby", "text");
        rtSpan.setAttribute("begin", formatTtmlTime(rt.startTime));
        rtSpan.setAttribute("end", formatTtmlTime(rt.endTime));
        rtSpan.textContent = rt.text;
        textContainer.appendChild(rtSpan);
      }
      container.appendChild(textContainer);
    }
    parent.appendChild(container);
  };

  const appendWords = (
    parent: Element,
    list: TtmlSyllable[],
    isBackground: boolean,
    ns: string,
  ) => {
    list.forEach((syllable, index) => {
      let text = syllable.text;
      if (isBackground) {
        if (index === 0) text = `(${text}`;
        if (index === list.length - 1) text = `${text})`;
      }
      if (syllable.ruby?.length && rubyMode !== "fold") {
        appendRuby(parent, syllable, text, ns);
      } else {
        const span = doc.createElementNS(ns, "span");
        span.setAttribute("begin", formatTtmlTime(syllable.startTime));
        span.setAttribute("end", formatTtmlTime(syllable.endTime));
        span.textContent = text;
        parent.appendChild(span);
      }
      if (syllable.endsWithSpace) parent.appendChild(doc.createTextNode(" "));
    });
  };

  const appendSubContent = (
    parent: Element,
    item: SubLyricContent,
    isBackground: boolean,
    ns: string,
  ) => {
    if (item.words?.length) appendWords(parent, item.words, isBackground, ns);
    else parent.textContent = isBackground ? `(${item.text})` : item.text;
  };

  const appendBackground = (
    parent: Element,
    bg: BackgroundVocal | SubLyricContent,
    ns: string,
  ) => {
    const bgSpan = doc.createElementNS(ns, "span");
    bgSpan.setAttributeNS(NS.TTM, "ttm:role", "x-bg");
    if ("startTime" in bg) {
      if (bg.startTime >= 0 && bg.endTime > bg.startTime) {
        bgSpan.setAttribute("begin", formatTtmlTime(bg.startTime));
        bgSpan.setAttribute("end", formatTtmlTime(bg.endTime));
      }
      appendSubContent(bgSpan, bg, true, ns);
      appendInlineSubs(bgSpan, bg, ns);
    } else {
      appendSubContent(bgSpan, bg, true, ns);
    }
    parent.appendChild(bgSpan);
  };

  const appendInlineSubs = (parent: Element, item: LyricBase, ns: string) => {
    for (const trans of item.translations ?? []) {
      if (inHead.has(trans)) continue;
      const span = doc.createElementNS(ns, "span");
      span.setAttributeNS(NS.TTM, "ttm:role", "x-translation");
      if (trans.language)
        span.setAttributeNS(NS.XML, "xml:lang", trans.language);
      appendSubContent(span, trans, false, ns);
      parent.appendChild(span);
    }
    for (const roman of item.romanizations ?? []) {
      if (inHead.has(roman)) continue;
      const span = doc.createElementNS(ns, "span");
      span.setAttributeNS(NS.TTM, "ttm:role", "x-roman");
      if (roman.language)
        span.setAttributeNS(NS.XML, "xml:lang", roman.language);
      appendSubContent(span, roman, false, ns);
      parent.appendChild(span);
    }
  };

  // <head>
  const head = ttEl("head");
  const metadata = ttEl("metadata");
  const meta = result.metadata;
  const agents: Agent[] =
    meta.agents && Object.keys(meta.agents).length
      ? Object.values(meta.agents)
      : [...new Set(lines.map((line) => line.agentId))].map((id) => ({
          id,
          type: id === "v1000" ? "group" : "person",
        }));
  for (const agent of agents) {
    const agentEl = doc.createElementNS(NS.TTM, "ttm:agent");
    agentEl.setAttribute(
      "type",
      agent.type || (agent.id === "v1000" ? "group" : "person"),
    );
    agentEl.setAttributeNS(NS.XML, "xml:id", agent.id);
    if (agent.name) {
      const nameEl = doc.createElementNS(NS.TTM, "ttm:name");
      nameEl.setAttribute("type", "full");
      nameEl.textContent = agent.name;
      agentEl.appendChild(nameEl);
    }
    metadata.appendChild(agentEl);
  }

  // <iTunesMetadata> for word-timed translations / romanizations and songwriters
  const translationsMap = new Map<
    string | undefined,
    { id: string; main?: SubLyricContent; bg?: SubLyricContent }[]
  >();
  const romansMap = new Map<
    string | undefined,
    { id: string; main?: SubLyricContent; bg?: SubLyricContent }[]
  >();
  for (const line of lines) {
    for (const pair of pairSubContents(
      line.translations,
      line.backgroundVocal?.translations,
    ))
      if (
        (pair.main && inHead.has(pair.main)) ||
        (pair.bg && inHead.has(pair.bg))
      ) {
        let list = translationsMap.get(pair.lang);
        if (!list) translationsMap.set(pair.lang, (list = []));
        list.push({ id: line.id, main: pair.main, bg: pair.bg });
      }
    for (const pair of pairSubContents(
      line.romanizations,
      line.backgroundVocal?.romanizations,
    ))
      if (
        (pair.main && inHead.has(pair.main)) ||
        (pair.bg && inHead.has(pair.bg))
      ) {
        let list = romansMap.get(pair.lang);
        if (!list) romansMap.set(pair.lang, (list = []));
        list.push({ id: line.id, main: pair.main, bg: pair.bg });
      }
  }
  const hasItunes =
    translationsMap.size > 0 ||
    romansMap.size > 0 ||
    (meta.songwriters?.length ?? 0) > 0;
  if (hasItunes) {
    const itunesMeta = itunesEl("iTunesMetadata");
    itunesMeta.setAttributeNS(NS.XMLNS, "xmlns", NS.ITUNES);
    const appendSidecarGroup = (
      containerTag: string,
      itemTag: string,
      map: Map<
        string | undefined,
        { id: string; main?: SubLyricContent; bg?: SubLyricContent }[]
      >,
    ) => {
      if (!map.size) return;
      const container = itunesEl(containerTag);
      for (const [lang, items] of map) {
        const groupEl = itunesEl(itemTag);
        if (lang) groupEl.setAttributeNS(NS.XML, "xml:lang", lang);
        for (const item of items) {
          const textEl = itunesEl("text");
          textEl.setAttribute("for", item.id);
          if (item.main) appendSubContent(textEl, item.main, false, NS.ITUNES);
          if (item.bg) appendBackground(textEl, item.bg, NS.ITUNES);
          groupEl.appendChild(textEl);
        }
        container.appendChild(groupEl);
      }
      itunesMeta.appendChild(container);
    };
    appendSidecarGroup("translations", "translation", translationsMap);
    appendSidecarGroup("transliterations", "transliteration", romansMap);
    if (meta.songwriters?.length) {
      const container = itunesEl("songwriters");
      for (const writer of meta.songwriters) {
        const sw = itunesEl("songwriter");
        sw.textContent = writer;
        container.appendChild(sw);
      }
      itunesMeta.appendChild(container);
    }
    metadata.appendChild(itunesMeta);
  }

  const addAmllMeta = (key: string, value: string) => {
    const el = doc.createElementNS(NS.AMLL, "amll:meta");
    el.setAttribute("key", key);
    el.setAttribute("value", value);
    metadata.appendChild(el);
  };
  meta.title?.forEach((v) => addAmllMeta("musicName", v));
  meta.artist?.forEach((v) => addAmllMeta("artists", v));
  meta.album?.forEach((v) => addAmllMeta("album", v));
  if (meta.platformIds)
    for (const [key, values] of Object.entries(meta.platformIds))
      values?.forEach((v) => addAmllMeta(key, v));
  meta.isrc?.forEach((v) => addAmllMeta("isrc", v));
  meta.authorIds?.forEach((v) => addAmllMeta("ttmlAuthorGithub", v));
  meta.authorNames?.forEach((v) => addAmllMeta("ttmlAuthorGithubLogin", v));
  if (meta.rawProperties)
    for (const [key, values] of Object.entries(meta.rawProperties))
      values?.forEach((v) => addAmllMeta(key, v));

  head.appendChild(metadata);
  root.appendChild(head);

  // <body>
  const body = ttEl("body");
  const lastTime = lines.length
    ? Math.max(...lines.map((line) => line.endTime))
    : 0;
  body.setAttribute("dur", formatTtmlTime(lastTime));

  const sections: { songPart?: string; lines: typeof lines }[] = [];
  for (const line of lines) {
    const current = sections.at(-1);
    if (!current || current.songPart !== line.songPart)
      sections.push({ songPart: line.songPart, lines: [line] });
    else current.lines.push(line);
  }
  for (const section of sections) {
    const div = ttEl("div");
    const divBegin = Math.min(...section.lines.map((line) => line.startTime));
    const divEnd = Math.max(...section.lines.map((line) => line.endTime));
    div.setAttribute("begin", formatTtmlTime(divBegin));
    div.setAttribute("end", formatTtmlTime(divEnd));
    if (section.songPart)
      div.setAttributeNS(NS.ITUNES, "itunes:songPart", section.songPart);
    for (const line of section.lines) {
      const p = ttEl("p");
      p.setAttribute("begin", formatTtmlTime(line.startTime));
      p.setAttribute("end", formatTtmlTime(line.endTime));
      p.setAttributeNS(NS.ITUNES, "itunes:key", line.id);
      p.setAttributeNS(NS.TTM, "ttm:agent", line.agentId);
      appendSubContent(p, line, false, NS.TT);
      appendInlineSubs(p, line, NS.TT);
      if (line.backgroundVocal)
        appendBackground(p, line.backgroundVocal, NS.TT);
      div.appendChild(p);
    }
    body.appendChild(div);
  }
  root.appendChild(body);
  return serializer.serializeToString(doc);
}

/** Parser metadata lists by the AMLL meta key each comes from. */
const metaKeys = {
  title: "musicName",
  artist: "artists",
  album: "album",
  isrc: "isrc",
  songwriters: "songwriters",
  authorIds: "ttmlAuthorGithub",
  authorNames: "ttmlAuthorGithubLogin",
} as const;
type MetaField = keyof typeof metaKeys;

function storedMetadata(meta: TTMLMetadata) {
  const lists = new Map<string, string[]>();
  const add = (key: string, items: string[] = []) =>
    lists.set(key, [...(lists.get(key) ?? []), ...items]);
  for (const [field, key] of Object.entries(metaKeys))
    add(key, meta[field as MetaField]);
  for (const [key, items] of Object.entries(meta.platformIds ?? {}))
    add(key, items);
  for (const [key, items] of Object.entries(meta.rawProperties ?? {}))
    add(key, items);
  return normalizeTtmlMetadata(Object.fromEntries(lists));
}

/**
 * The stored TTML metadata, with title, artists and album following the
 * project's ti／ar／al: kept as stored while they agree, replaced otherwise
 * (a changed title keeps the alternative titles after it).
 */
function headMetadata(project: ProjectDraft): Partial<TTMLMetadata> {
  const rest = { ...project.ttmlMetadata };
  const take = (key: string) => {
    const items = rest[key] ?? [];
    delete rest[key];
    return items;
  };
  const lead = (items: string[], value: string) =>
    value ? [...new Set([value, ...items.slice(1)])] : [];
  const title =
    project.metadata.ti ||
    (project.name === untitledName ? "" : project.name.trim());
  const ar = project.metadata.ar?.trim() ?? "";
  const artists = take(metaKeys.artist);
  const result: Partial<TTMLMetadata> = {
    title: lead(take(metaKeys.title), title),
    artist:
      artists.join(" / ") === ar
        ? artists
        : ar
            .split(" / ")
            .map((item) => item.trim())
            .filter(Boolean),
    album: lead(take(metaKeys.album), project.metadata.al?.trim() ?? ""),
  };
  for (const field of [
    "isrc",
    "songwriters",
    "authorIds",
    "authorNames",
  ] as const) {
    const items = take(metaKeys[field]);
    if (items.length) result[field] = items;
  }
  const platforms = ["ncmMusicId", "qqMusicId", "spotifyId", "appleMusicId"];
  for (const key of platforms)
    if (rest[key]) (result.platformIds ??= {})[key as PlatformId] = take(key);
  if (Object.keys(rest).length) result.rawProperties = rest;
  return result;
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
  const rubyMode: TtmlRubyMode =
    options.rubyMode ?? (options.foldRuby ? "fold" : "amll");
  const foldRuby = rubyMode === "fold";
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
  const notes: ExportNotes = { romanMismatch: 0 };
  const lines: TtmlLine[] = song.map((entry) => {
    const line: TtmlLine = {
      ...content(entry.line, project, foldRuby, notes),
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
      const bg = mergeBackground(voices, project, foldRuby, notes);
      line.backgroundVocal = bg;
      line.startTime = Math.min(line.startTime, bg.startTime);
      line.endTime = Math.max(line.endTime, bg.endTime);
    }
    return line;
  });
  // Keep lines ordered after an early background vocal widens a line's start.
  lines.sort((a, b) => a.startTime - b.startTime);
  if (merged)
    notices.push(`有 ${merged} 行和声与同一主行重叠，已合并进该行的和声。`);
  if (notes.romanMismatch)
    notices.push(
      `有 ${notes.romanMismatch} 行的逐字罗马音与整行罗马音对不上，这些行只导出整行罗马音。`,
    );
  const result: TTMLResult = {
    metadata: {
      language: language(project),
      timingMode: "Word",
      agents,
      ...headMetadata(project),
    },
    lines,
  };
  return { text: serializeTtml(result, rubyMode, options.dom), notices };
}

export interface TtmlImport {
  parts: VocalPart[];
  metadata: Record<string, string>;
  /** Everything in the head by AMLL meta key, for writing it back. */
  ttmlMetadata?: Record<string, string[]>;
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
    if (roman.words?.length) alignRoman(line, roman.words);
  }
}

/**
 * Romanized words onto the units they are sung with: the unit starting at the
 * same time, else the one overlapping most (as AMLL does). A unit may take
 * several words ("kimi to" for 君と).
 */
function alignRoman(line: LyricLine, timed: TtmlSyllable[]) {
  if (!line.units.length) return;
  const ends = syllableEnds(line);
  let index = 0;
  const spans = line.units.map((unit) => {
    index += unit.syllables.length;
    return [unit.syllables[0].startMs!, ends[index - 1]] as const;
  });
  const picked = line.units.map(() => [] as TtmlSyllable[]);
  for (const word of timed) {
    let best = spans.findIndex(
      ([start]) => Math.abs(start - word.startTime) <= 2,
    );
    if (best < 0) {
      let score = 0;
      spans.forEach(([start, end], i) => {
        const overlap =
          Math.min(end, word.endTime) - Math.max(start, word.startTime);
        const union =
          Math.max(end, word.endTime) - Math.min(start, word.startTime);
        const iou = union > 0 ? overlap / union : 0;
        if (iou > score) [score, best] = [iou, i];
      });
      if (score < 0.1) continue;
    }
    picked[best].push(word);
  }
  line.units.forEach((unit, i) => {
    const text = picked[i]
      .map((word, w, all) =>
        w < all.length - 1 && word.endsWithSpace ? `${word.text} ` : word.text,
      )
      .join("")
      .trim();
    if (text) unit.roman = text;
  });
}

export interface TtmlImportOptions extends TTMLParserOptions {
  xmlSerializer?: { serializeToString(node: never): string };
}

function directElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === 1,
  );
}

function attrNS(
  el: Element,
  ns: string,
  local: string,
  fallback?: string,
): string | null {
  return (
    el.getAttributeNS(ns, local) ||
    (fallback ? el.getAttribute(fallback) : null) ||
    null
  );
}

const rubyRole = (el: Element): string | null =>
  attrNS(el, NS.TTS, "ruby", "tts:ruby");

interface TimedRubyPiece {
  text: string;
  begin: string;
  end: string;
}

function rubyPieces(
  textEl: Element,
  fallbackBegin: string | null,
  fallbackEnd: string | null,
): TimedRubyPiece[] {
  const timedChildren = directElements(textEl)
    .map((child) => ({
      text: (child.textContent ?? "").replace(/\s+/g, " ").trim(),
      begin: child.getAttribute("begin"),
      end: child.getAttribute("end"),
    }))
    .filter(
      (item): item is TimedRubyPiece =>
        !!item.text && !!item.begin && !!item.end,
    );
  if (timedChildren.length) return timedChildren;
  const text = (textEl.textContent ?? "").replace(/\s+/g, " ").trim();
  const begin = textEl.getAttribute("begin") || fallbackBegin;
  const end = textEl.getAttribute("end") || fallbackEnd;
  return text && begin && end ? [{ text, begin, end }] : [];
}

function isAmllRuby(container: Element): boolean {
  const kids = directElements(container);
  if (kids.length !== 2) return false;
  if (rubyRole(kids[0]) !== "base" || rubyRole(kids[1]) !== "textContainer")
    return false;
  const texts = directElements(kids[1]);
  return (
    texts.length > 0 &&
    texts.every(
      (el) =>
        rubyRole(el) === "text" &&
        directElements(el).length === 0 &&
        !!el.getAttribute("begin") &&
        !!el.getAttribute("end"),
    )
  );
}

/**
 * Rewrite W3C TTML2 ruby containers (shorthand `base + text` or full
 * `baseContainer + textContainer`, with timed inner spans or delimiters) into
 * the `base + textContainer > timed text*` shape that TTMLParser reads.
 */
function normalizeRubyContainers(doc: Document): boolean {
  const containers = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => rubyRole(el) === "container",
  );
  let changed = false;
  for (const container of containers) {
    if (isAmllRuby(container) || !container.parentNode) continue;
    const kids = directElements(container);
    const baseContainer = kids.find((el) => rubyRole(el) === "baseContainer");
    const bases = (baseContainer ? directElements(baseContainer) : kids).filter(
      (el) => rubyRole(el) === "base",
    );
    const textContainer = kids.find((el) => rubyRole(el) === "textContainer");
    const texts = (textContainer ? directElements(textContainer) : kids).filter(
      (el) => rubyRole(el) === "text",
    );
    if (!bases.length || !texts.length) continue;

    const cBegin = container.getAttribute("begin");
    const cEnd = container.getAttribute("end");
    const groups: { baseText: string; pieces: TimedRubyPiece[] }[] = [];
    if (bases.length === 1) {
      const bBegin = bases[0].getAttribute("begin") || cBegin;
      const bEnd = bases[0].getAttribute("end") || cEnd;
      const pieces = texts.flatMap((t) => rubyPieces(t, bBegin, bEnd));
      if (pieces.length)
        groups.push({ baseText: bases[0].textContent ?? "", pieces });
    } else if (bases.length === texts.length) {
      const paired = bases.map((baseEl, i) => ({
        baseText: baseEl.textContent ?? "",
        pieces: rubyPieces(
          texts[i],
          baseEl.getAttribute("begin") || cBegin,
          baseEl.getAttribute("end") || cEnd,
        ),
      }));
      if (paired.every((item) => item.pieces.length > 0))
        groups.push(...paired);
    }
    if (!groups.length) continue;

    const spanNs = container.namespaceURI || NS.TT;
    const obscene = attrNS(container, NS.AMLL, "obscene", "amll:obscene");
    const emptyBeat = attrNS(
      container,
      NS.AMLL,
      "empty-beat",
      "amll:empty-beat",
    );
    for (const group of groups) {
      const next = doc.createElementNS(spanNs, "span");
      next.setAttributeNS(NS.TTS, "tts:ruby", "container");
      if (obscene) next.setAttributeNS(NS.AMLL, "amll:obscene", obscene);
      if (emptyBeat) next.setAttributeNS(NS.AMLL, "amll:empty-beat", emptyBeat);
      const base = doc.createElementNS(spanNs, "span");
      base.setAttributeNS(NS.TTS, "tts:ruby", "base");
      base.textContent = group.baseText;
      next.appendChild(base);
      const tc = doc.createElementNS(spanNs, "span");
      tc.setAttributeNS(NS.TTS, "tts:ruby", "textContainer");
      for (const piece of group.pieces) {
        const rt = doc.createElementNS(spanNs, "span");
        rt.setAttributeNS(NS.TTS, "tts:ruby", "text");
        rt.setAttribute("begin", piece.begin);
        rt.setAttribute("end", piece.end);
        rt.textContent = piece.text;
        tc.appendChild(rt);
      }
      next.appendChild(tc);
      container.parentNode.insertBefore(next, container);
    }
    container.parentNode.removeChild(container);
    changed = true;
  }
  if (changed && !doc.documentElement.getAttributeNS(NS.XMLNS, "tts"))
    doc.documentElement.setAttributeNS(NS.XMLNS, "xmlns:tts", NS.TTS);
  return changed;
}

/**
 * Prepare incoming TTML for TTMLParser: add missing itunes:key attributes and
 * normalize W3C TTML2 ruby markup alongside AMLL ruby.
 */
function prepareImportXml(text: string, options: TtmlImportOptions): string {
  const parser = options.domParser ?? new DOMParser();
  const doc = parser.parseFromString(text, "application/xml") as Document;
  if (!doc.documentElement || doc.getElementsByTagName("parsererror").length)
    throw new Error("XML 格式无效");
  let changed = false,
    n = 0;
  for (const p of Array.from(doc.getElementsByTagName("p"))) {
    n++;
    if (p.getAttributeNS(NS.ITUNES, "key") || p.getAttribute("itunes:key"))
      continue;
    p.setAttributeNS(NS.ITUNES, "itunes:key", `mako-L${n}`);
    changed = true;
  }
  if (normalizeRubyContainers(doc)) changed = true;
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
    result = TTMLParser.parse(prepareImportXml(text, options), options);
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
  // Apple Music and other tools let one singer's lines (or the x-bg of
  // neighbouring lines) overlap; here a part is one non-overlapping track.
  const conflicts = parts.flatMap((part) => {
    const lines = new Set(
      validateLines(part.lines, Infinity, false)
        .filter((issue) => issue.kind === "conflict")
        .map((issue) => issue.lineId),
    );
    return lines.size ? [`「${part.name}」${lines.size} 行`] : [];
  });
  if (conflicts.length)
    notices.add(
      `时间冲突：${conflicts.join("、")}与相邻行重叠。原文件允许同一演唱者的行（或相邻行的和声）互相重叠，常见于 Apple Music 的 TTML；本工具要求同一声部内的行先后排开，导出前请在逐行打轴中调整这些行的句首或收尾。`,
    );
  const metadata: Record<string, string> = {};
  const meta = result.metadata;
  if (meta.title?.[0]) metadata.ti = meta.title[0];
  if (meta.artist?.length) metadata.ar = meta.artist.join(" / ");
  if (meta.album?.[0]) metadata.al = meta.album[0];
  return {
    parts,
    metadata,
    ttmlMetadata: storedMetadata(meta),
    name: meta.title?.[0] ?? null,
    translationLang: langs.translation ?? "",
    romanLang: langs.roman ?? "",
    notices: [...notices],
  };
}

export const looksLikeTtml = (text: string): boolean =>
  /^\s*(<\?xml[^>]*>\s*)?<tt[\s>]/.test(text.replace(/^﻿/, ""));
