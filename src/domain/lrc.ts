import { formatTime, newLine, newId, parseTime, validate, type LyricLine, type ProjectDraft, type TimingUnit } from './model';

const header = /^\[(\d+:[0-5]\d(?:[.:]\d{1,3})?)\]/;
const wordTags = /<(\d+:[0-5]\d(?:[.:]\d{1,3})?)>/g;
const tagTime = (value: string) => parseTime(value.replace(/^(\d+:\d\d):/, '$1.'))!;
export interface ImportResult { lines: LyricLine[]; metadata: Record<string, string>; notices: string[] }

export function importLyrics(input: string): ImportResult {
  const result: ImportResult = { lines: [], metadata: {}, notices: [] };
  let expanded = false;
  for (const raw of input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const meta = /^\[([a-zA-Z][\w-]*):(.*)\]$/.exec(raw.trim());
    if (meta) { result.metadata[meta[1].toLowerCase()] = meta[2].trim(); continue; }
    let content = raw;
    const starts: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = header.exec(content))) { starts.push(tagTime(match[1])); content = content.slice(match[0].length); }
    const tags = Array.from(content.matchAll(wordTags));
    let endMs: number | null = null;
    const units: TimingUnit[] = [];
    if (tags.length) {
      const prefix = content.slice(0, tags[0].index);
      if (prefix.trim()) units.push({ id: newId(), text: prefix, startMs: starts[0] ?? null });
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        let text = content.slice(tag.index! + tag[0].length, tags[i + 1]?.index ?? content.length);
        if (i === tags.length - 1 && !text.trim()) {
          endMs = tagTime(tag[1]);
          if (text && units.length) units[units.length - 1].text += text;
        } else {
          if (i === 0 && !prefix.trim()) text = prefix + text;
          units.push({ id: newId(), text, startMs: tagTime(tag[1]) });
        }
      }
      content = units.map(u => u.text).join('');
    }
    const instances = starts.length ? starts : [units[0]?.startMs ?? null];
    for (const start of instances) {
      const delta = start !== null && starts[0] !== undefined ? start - starts[0] : 0;
      result.lines.push({ ...newLine(content, start), endMs: endMs === null ? null : endMs + delta,
        units: units.map(u => ({ ...u, id: newId(), startMs: u.startMs === null ? null : u.startMs + delta })) });
    }
    expanded ||= starts.length > 1;
    if (/^\[\d+:/.test(raw) && !starts.length) result.notices.push('有无法识别的句首标签，正文已保留，请在整理阶段检查。');
  }
  // A final newline is a file terminator; interior blank lines remain editable.
  if (result.lines.at(-1)?.text === '' && /\n$/.test(input)) result.lines.pop();
  if (expanded) {
    result.notices.push('重复句的多个句首标签已展开为独立歌词行。');
    if (result.lines.every(l => l.startMs !== null)) result.lines.sort((a, b) => a.startMs! - b.startMs!);
  }
  if ('offset' in result.metadata) {
    const value = Number(result.metadata.offset);
    if (/^[+-]?\d+$/.test(result.metadata.offset) && Number.isSafeInteger(value)) {
      for (const line of result.lines) {
        if (line.startMs !== null) line.startMs -= value;
        if (line.endMs !== null) line.endMs -= value;
        for (const unit of line.units) if (unit.startMs !== null) unit.startMs -= value;
      }
      delete result.metadata.offset;
      result.notices.push(`已应用文件偏移：${value >= 0 ? '提前' : '延后'} ${Math.abs(value)}ms。`);
    } else result.notices.push('offset 不是有效整数，尚未应用；请检查元数据。');
  }
  return result;
}

export function exportLyrics(project: ProjectDraft): string {
  if (!project.lines.length) throw new Error('请先导入歌词。');
  const errors = validate(project);
  if (errors.length) throw new Error(`无法导出：${errors[0].message}`);
  const metadata = Object.entries(project.metadata).filter(([key]) => key !== 'offset').map(([key, value]) => `[${key}:${value.replace(/[\r\n]/g, ' ')}]`);
  const lines = project.lines.map(line => `[${formatTime(line.startMs)}]${line.units.map(u => `<${formatTime(u.startMs)}>${u.text}`).join('')}<${formatTime(line.endMs)}>`);
  return [...metadata, ...lines].join('\n') + '\n';
}
