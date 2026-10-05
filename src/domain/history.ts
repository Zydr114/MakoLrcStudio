import { copyProject, type ProjectDraft } from "./model";

export interface PointChange {
  lineId: string;
  index: number;
  timeMs: number;
}
export interface HistoryEntry {
  before: ProjectDraft;
  after: ProjectDraft;
  label: string;
  point?: PointChange;
}

export class ProjectHistory {
  past: HistoryEntry[] = [];
  future: HistoryEntry[] = [];
  push(
    before: ProjectDraft,
    after: ProjectDraft,
    label: string,
    point?: PointChange,
  ): void {
    this.past.push({
      before: copyProject(before),
      after: copyProject(after),
      label,
      point,
    });
    if (this.past.length > 150) this.past.shift();
    this.future = [];
  }
  undo(): HistoryEntry | undefined {
    const item = this.past.pop();
    if (item) this.future.push(item);
    return item;
  }
  redo(): HistoryEntry | undefined {
    const item = this.future.pop();
    if (item) this.past.push(item);
    return item;
  }
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
