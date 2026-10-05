import type { AudioInfo } from '../audio/transport';

export interface TimingUnit { id: string; text: string; startMs: number | null }
export interface LyricLine { id: string; text: string; startMs: number | null; endMs: number | null; units: TimingUnit[] }
export interface ProjectDraft {
  version: 1;
  name: string;
  metadata: Record<string, string>;
  audio: AudioInfo | null;
  lines: LyricLine[];
  stage: number;
  unlockedStage: number;
  activeLineId: string | null;
}
export interface Issue { lineId: string; unitId?: string; message: string }
export const newId = (): string => crypto.randomUUID();
export const newLine = (text: string, startMs: number | null = null): LyricLine => ({ id: newId(), text, startMs, endMs: null, units: [] });
export const newProject = (): ProjectDraft => ({ version: 1, name: '未命名歌词', metadata: {}, audio: null, lines: [], stage: 0, unlockedStage: 0, activeLineId: null });
export const copyProject = (project: ProjectDraft): ProjectDraft => JSON.parse(JSON.stringify(project)) as ProjectDraft;
export const completeLine = (line: LyricLine): boolean => line.units.length > 0 && line.units.every(u => u.startMs !== null) && line.endMs !== null;

export function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  const value = Math.abs(Math.round(ms));
  return `${ms < 0 ? '-' : ''}${String(Math.floor(value / 60000)).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}

export function parseTime(input: string): number | null {
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  const value = Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number((match[3] || '').padEnd(3, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

export function validate(project: ProjectDraft, full = true): Issue[] {
  const issues: Issue[] = [];
  const duration = project.audio?.durationMs ?? Infinity;
  let previousStart = -1;
  for (let i = 0; i < project.lines.length; i++) {
    const line = project.lines[i];
    const add = (message: string, unitId?: string) => issues.push({ lineId: line.id, unitId, message });
    if (!line.text.trim()) add('空行需要删除或填写歌词');
    if (line.startMs === null) add('尚未记录句首');
    else {
      if (line.startMs < 0 || line.startMs >= duration) add('句首超出音频范围');
      if (line.startMs <= previousStart) add('句首需要晚于上一句；请检查同时间的翻译行或重复行');
      previousStart = line.startMs;
    }
    const nextStart = project.lines[i + 1]?.startMs ?? duration;
    if (line.endMs !== null && (line.endMs > nextStart || line.endMs > duration || line.endMs <= (line.startMs ?? -1))) add('收尾需要晚于句首，且不超过下一句起点');
    if (!full) continue;
    if (!line.units.length) add('尚未切分和制作逐字时间');
    let previous = (line.startMs ?? 0) - 1;
    for (const unit of line.units) {
      if (unit.startMs === null) add(`「${unit.text.trim()}」尚未记录起点`, unit.id);
      else {
        if (unit.startMs <= previous || unit.startMs < (line.startMs ?? 0) || unit.startMs >= nextStart || unit.startMs >= duration) add(`「${unit.text.trim()}」起点与相邻边界冲突`, unit.id);
        previous = unit.startMs;
      }
    }
    if (line.endMs === null) add('尚未记录收尾');
    else if (line.endMs <= previous) add('收尾需要晚于最后一个单位起点');
    if (line.units.length && line.units.map(u => u.text).join('') !== line.text) add('切分文本与歌词正文不一致');
  }
  return issues;
}
