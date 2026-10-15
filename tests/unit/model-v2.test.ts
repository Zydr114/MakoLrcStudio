import { describe, expect, it } from "vitest";
import { readBackup } from "../../src/domain/backup";
import { exportLyrics } from "../../src/domain/lrc";
import {
  activeLines,
  newLine,
  newPart,
  newSyllable,
  syllableRefs,
  validate,
  validateLines,
  type ProjectDraft,
  type TimingUnit,
} from "../../src/domain/model";
import {
  setSyllableStart,
  setLineEnd,
  shiftAll,
  splitLine,
} from "../../src/domain/edit";
import { sampleLineTiming, tokenIntervals } from "../../src/domain/timing";
import { createEditor } from "../../src/state/editor";
import { fromLyrics } from "./helpers";

const enhanced =
  "[ti:test]\n[00:12.340]<00:12.340>今日 <00:12.800>も<00:13.410>\n[00:15.000]<00:15.000>君<00:16.000>\n";
/** The draft shape the v1 editor stored and wrote to backups. */
function v1Backup() {
  let n = 0;
  const id = () => `id-${++n}`;
  return {
    version: 1,
    name: "test",
    metadata: { ti: "test" },
    audio: null,
    lines: [
      {
        id: id(),
        text: "今日 も",
        startMs: 12340,
        endMs: 13410,
        units: [
          { id: id(), text: "今日 ", startMs: 12340 },
          { id: id(), text: "も", startMs: 12800 },
        ],
      },
      {
        id: id(),
        text: "君",
        startMs: 15000,
        endMs: 16000,
        units: [{ id: id(), text: "君", startMs: 15000 }],
      },
    ],
    stage: 3,
    unlockedStage: 3,
    activeLineId: "id-1",
    playheadMs: 0,
  };
}
const ruby = (text: string, reading: string[]): TimingUnit => ({
  id: crypto.randomUUID(),
  text,
  ruby: true,
  syllables: reading.map((kana) => newSyllable(kana)),
});

describe("project v2 migration", () => {
  it("turns a v1 backup into one main part and exports the same LRC bytes", () => {
    const project = readBackup(JSON.stringify(v1Backup()));
    expect(project.version).toBe(2);
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0]).toMatchObject({
      name: "主唱",
      kind: "person",
      background: false,
    });
    expect(project.mainPartId).toBe(project.parts[0].id);
    expect(project.activePartId).toBe(project.parts[0].id);
    expect(project.activeLineId).toBe("id-1");
    const line = activeLines(project)[0];
    expect(line).toMatchObject({ translation: "", roman: "" });
    expect(line.units.map((unit) => unit.id)).toEqual(["id-2", "id-3"]);
    expect(
      line.units.map((unit) => [unit.ruby, unit.syllables.length]),
    ).toEqual([
      [false, 1],
      [false, 1],
    ]);
    expect(line.units[0].syllables[0]).toMatchObject({
      text: "今日 ",
      startMs: 12340,
      endMs: null,
    });
    expect(exportLyrics(project)).toBe(enhanced);
    // A migrated draft is stored as v2 and reads back unchanged.
    expect(readBackup(JSON.stringify(project))).toEqual(project);
  });
  it("rejects broken v2 structure instead of guessing", () => {
    const project = fromLyrics(enhanced);
    const broken = (change: (draft: ProjectDraft) => void) => {
      const draft = structuredClone(project);
      change(draft);
      return () => readBackup(JSON.stringify(draft));
    };
    expect(
      broken((d) => (activeLines(d)[0].units[0].syllables[0].text = "x")),
    ).toThrow();
    expect(
      broken((d) => {
        const unit = activeLines(d)[0].units[0];
        unit.syllables.push(newSyllable("y"));
      }),
    ).toThrow();
    expect(
      broken((d) => {
        const units = activeLines(d)[0].units;
        units[1].syllables[0].id = units[0].syllables[0].id;
      }),
    ).toThrow();
    expect(broken((d) => (d.mainPartId = "missing"))).toThrow();
    expect(broken((d) => (d.parts = []))).toThrow();
    expect(broken((d) => (d.parts[0].kind = "duet" as never))).toThrow();
  });
});

describe("parts are separate timelines", () => {
  it("validates only inside a part and exports the main part to LRC", () => {
    const project = fromLyrics(enhanced);
    const harmony = newPart("和声", [
      { ...newLine("今日", 12340), endMs: 13000 },
    ]);
    project.parts.push(harmony);
    project.activePartId = harmony.id;
    // The same start as the main part's first line is not a conflict across parts.
    expect(validate(project, false)).toEqual([]);
    expect(validate(project).some((i) => i.kind === "conflict")).toBe(false);
    expect(exportLyrics(project)).toBe(enhanced);
  });
  it("moves every part together with the whole-song offset", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>");
    project.parts.push(
      newPart("和声", [{ ...newLine("あ", 1500), endMs: 1800 }]),
    );
    shiftAll(project, 100);
    expect(project.parts.map((part) => part.lines[0].startMs)).toEqual([
      1100, 1600,
    ]);
    expect(project.parts[0].lines[0].units[0].syllables[0].startMs).toBe(1100);
  });
});

describe("syllables inside a ruby unit", () => {
  function rubyProject() {
    const project = fromLyrics(
      "[00:01]<00:01>詮<00:03>な<00:04>\n[00:06]<00:06>次<00:07>",
    );
    const line = activeLines(project)[0];
    line.units[0] = ruby("詮", ["せ", "ん"]);
    line.units[0].syllables[0].startMs = 1000;
    return project;
  }
  it("times each reading syllable in Enter order and keeps the base for LRC", () => {
    const project = rubyProject();
    const line = activeLines(project)[0];
    expect(syllableRefs(line).map((ref) => [ref.unitIndex, ref.index])).toEqual(
      [
        [0, 0],
        [0, 1],
        [1, 2],
      ],
    );
    expect(validate(project).map((issue) => issue.message)).toEqual([
      "「詮・ん」尚未记录起点",
    ]);
    expect(() => setSyllableStart(project, 0, 1, 3000)).toThrow("相邻边界");
    setSyllableStart(project, 0, 1, 1500);
    expect(validate(project)).toEqual([]);
    expect(
      tokenIntervals(line).map((i) => [i.text, i.startMs, i.endMs]),
    ).toEqual([
      ["せ", 1000, 1500],
      ["ん", 1500, 3000],
      ["な", 3000, 4000],
    ]);
    expect(sampleLineTiming(line, 1600)).toMatchObject({
      index: 1,
      unitIndex: 0,
      unitId: line.units[0].id,
    });
    project.metadata = {};
    expect(exportLyrics(project)).toBe(
      "[00:01.000]<00:01.000>詮<00:03.000>な<00:04.000>\n" +
        "[00:06.000]<00:06.000>次<00:07.000>\n",
    );
  });
  it("treats an explicit syllable end as a pause that later starts must respect", () => {
    const project = rubyProject();
    const line = activeLines(project)[0];
    setSyllableStart(project, 0, 1, 1500);
    line.units[0].syllables[1].endMs = 2500;
    expect(validate(project)).toEqual([]);
    expect(tokenIntervals(line)[1]).toMatchObject({
      startMs: 1500,
      endMs: 2500,
      kind: "confirmed",
    });
    expect(sampleLineTiming(line, 2700).status).toBe("gap");
    expect(sampleLineTiming(line, 3100).index).toBe(2);
    line.units[1].syllables[0].startMs = 2400;
    expect(
      validate(project).some((issue) => issue.message.includes("终点")),
    ).toBe(true);
    line.units[1].syllables[0].startMs = 3000;
    line.units[1].syllables[0].endMs = 3500;
    expect(
      validateLines([line]).some((issue) => issue.message.includes("终点")),
    ).toBe(true);
  });
  it("ends the first half at a pause when a line is split after it", () => {
    const project = rubyProject();
    const line = activeLines(project)[0];
    setSyllableStart(project, 0, 1, 1500);
    line.units[0].syllables[1].endMs = 2500;
    splitLine(project, line.id, 1);
    const [first, second] = activeLines(project);
    expect([first.text, first.endMs]).toEqual(["詮", 2500]);
    expect(first.units[0].syllables[1].endMs).toBeNull();
    expect(first.units[0].ruby).toBe(true);
    expect([second.text, second.startMs, second.endMs]).toEqual([
      "な",
      3000,
      4000,
    ]);
    expect(() => setLineEnd(project, 0, 1400)).toThrow();
  });
});

describe("editor on the active part", () => {
  it("exposes the active part's lines and undoes in the part that was edited", () => {
    const editor = createEditor(undefined, false);
    editor.importText("今日\n次");
    const main = editor.project.activePartId;
    const harmony = newPart("和声", [newLine("あ")]);
    editor.command("添加声部", (draft) => draft.parts.push(harmony));
    editor.view({
      activePartId: harmony.id,
      activeLineId: harmony.lines[0].id,
    });
    expect(editor.lines.map((line) => line.text)).toEqual(["あ"]);
    expect(editor.line?.text).toBe("あ");
    editor.command("改和声", (draft) => {
      activeLines(draft)[0].text = "ああ";
    });
    editor.view({
      activePartId: main,
      activeLineId: editor.project.parts[0].lines[0].id,
    });
    expect(editor.line?.text).toBe("今日");
    editor.undo();
    expect(editor.project.activePartId).toBe(harmony.id);
    expect(editor.line?.text).toBe("あ");
    expect(editor.lineTotal).toBe(3);
  });
});
