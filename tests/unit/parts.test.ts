import { describe, expect, it } from "vitest";
import {
  addPart,
  lrcLosses,
  movePart,
  removePart,
  transferLines,
  updatePart,
} from "../../src/domain/parts";
import { songLines } from "../../src/domain/song";
import {
  activeLines,
  newLine,
  newPart,
  syllablesOf,
  type ProjectDraft,
} from "../../src/domain/model";
import { createEditor } from "../../src/state/editor";
import { FakeTransport, fromLyrics } from "./helpers";

const options = {
  name: "B",
  kind: "person" as const,
  background: false,
  copyText: false,
};
const timed = (text: string, start: number, end: number) => ({
  ...newLine(text, start),
  endMs: end,
});

describe("part editing", () => {
  it("adds parts with unique names and colors and copies text without timing", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>\n[00:03]日");
    const copy = addPart(project, { ...options, copyText: true });
    expect(copy.lines.map((line) => [line.text, line.startMs])).toEqual([
      ["今", null],
      ["日", null],
    ]);
    expect(copy.lines[0].units).toEqual([]);
    expect(copy.color).not.toBe(project.parts[0].color);
    expect(() => addPart(project, options)).toThrow("已有");
    expect(() => addPart(project, { ...options, name: " " })).toThrow(
      "不能为空",
    );
    expect(() => updatePart(project, copy.id, { name: "主唱" })).toThrow(
      "已有",
    );
    updatePart(project, copy.id, {
      name: "和声",
      background: true,
      kind: "group",
    });
    expect(copy).toMatchObject({
      name: "和声",
      background: true,
      kind: "group",
    });
  });
  it("keeps one part, a valid main part and a valid active line when removing", () => {
    const project = fromLyrics("今日");
    const b = addPart(project, options);
    project.mainPartId = b.id;
    project.activePartId = b.id;
    movePart(project, b.id, -1);
    expect(project.parts[0].id).toBe(b.id);
    removePart(project, b.id);
    expect(project.mainPartId).toBe(project.parts[0].id);
    expect(project.activePartId).toBe(project.parts[0].id);
    expect(project.activeLineId).toBe(activeLines(project)[0].id);
    expect(() => removePart(project, project.parts[0].id)).toThrow("至少");
  });
});

describe("moving lines between parts", () => {
  function duet(): ProjectDraft {
    const project = fromLyrics(
      "[00:01]<00:01>A<00:02>\n[00:03]<00:03>B<00:04>\n[00:05]<00:05>C<00:06>",
    );
    project.activeLineId = activeLines(project)[1].id;
    return project;
  }
  it("moves timed lines into place by start and keeps their timing", () => {
    const project = duet();
    const b = addPart(project, options);
    b.lines.push(timed("X", 4000, 4500));
    const ids = [activeLines(project)[1].id];
    expect(transferLines(project, ids, b.id, false)).toEqual({
      appended: false,
    });
    expect(b.lines.map((line) => line.text)).toEqual(["B", "X"]);
    expect(b.lines[0].id).toBe(ids[0]);
    expect(syllablesOf(b.lines[0])[0].startMs).toBe(3000);
    expect(activeLines(project).map((line) => line.text)).toEqual(["A", "C"]);
    expect(project.activeLineId).toBe(activeLines(project)[1].id);
  });
  it("copies with fresh ids and appends when timing cannot order the lines", () => {
    const project = duet();
    const b = addPart(project, options);
    b.lines.push(newLine("untimed"));
    const source = activeLines(project)[0];
    expect(transferLines(project, [source.id], b.id, true)).toEqual({
      appended: true,
    });
    const copy = b.lines[1];
    expect(copy.text).toBe("A");
    expect(copy.id).not.toBe(source.id);
    expect(copy.units[0].id).not.toBe(source.units[0].id);
    expect(syllablesOf(copy)[0].id).not.toBe(syllablesOf(source)[0].id);
    expect(activeLines(project)).toHaveLength(3);
    expect(() =>
      transferLines(project, [source.id], project.parts[0].id, false),
    ).toThrow();
  });
});

describe("LRC compatibility notice", () => {
  it("lists what the main part export drops", () => {
    const project = fromLyrics("[00:01]<00:01>今<00:02>");
    expect(lrcLosses(project)).toEqual([]);
    project.parts.push(newPart("和声"));
    const line = activeLines(project)[0];
    line.translation = "today";
    line.units[0].ruby = true;
    line.units[0].syllables[0].endMs = 1500;
    expect(lrcLosses(project)).toEqual([
      "其他 1 个声部",
      "注音",
      "翻译",
      "音节停顿",
    ]);
  });
});

describe("whole-song layout", () => {
  it("alternates duet sides, centers groups and hangs background lines on the best host", () => {
    const project = fromLyrics(
      "[00:01]<00:01>A1<00:03>\n[00:09]<00:09>A2<00:10>",
    );
    const b = newPart("B", [timed("B1", 4000, 6000)]);
    const all = {
      ...newPart("合", [timed("ALL", 7000, 8000)]),
      kind: "group" as const,
    };
    const bg = {
      ...newPart("bg", [timed("bg1", 2500, 4500), timed("bg2", 8500, 8800)]),
      background: true,
    };
    project.parts.push(b, all, bg);
    const song = songLines(project);
    expect(song.map((entry) => [entry.line.text, entry.side])).toEqual([
      ["A1", "left"],
      ["B1", "right"],
      ["ALL", "center"],
      ["A2", "left"],
    ]);
    // bg1 overlaps B1 by 500ms and A1 by 500ms: the first best host wins.
    expect(song[0].backgrounds.map((voice) => voice.line.text)).toEqual([
      "bg1",
    ]);
    // bg2 overlaps nothing: it rides under the main line before it.
    expect(song[2].backgrounds.map((voice) => voice.line.text)).toEqual([
      "bg2",
    ]);
  });
});

describe("switching parts in the editor", () => {
  it("returns to the remembered line, or the line at the playhead, without an undo entry", async () => {
    const audio = new FakeTransport();
    const editor = createEditor(audio, false);
    await editor.loadAudio({} as File);
    editor.importText("[00:01]A\n[00:05]B");
    const main = editor.project.activePartId;
    let id = "";
    editor.command("新增声部", (draft) => {
      const part = addPart(draft, options);
      part.lines.push(timed("x", 1000, 2000), timed("y", 4000, 4500));
      id = part.id;
    });
    editor.selectLine(editor.lines[1].id);
    editor.seek(4200);
    editor.switchPart(id);
    expect(editor.part.id).toBe(id);
    expect(editor.line?.text).toBe("y");
    editor.selectLine(editor.lines[0].id);
    editor.switchPart(main);
    expect(editor.line?.text).toBe("B");
    editor.switchPart(id);
    expect(editor.line?.text).toBe("x");
    editor.undo();
    expect(editor.project.parts).toHaveLength(1);
    expect(editor.part.id).toBe(main);
  });
  it("imports more lyrics as a new part instead of replacing the project", () => {
    const editor = createEditor(undefined, false);
    editor.importText("今日");
    editor.importText("[00:02]あ", "harmony.lrc", true);
    expect(editor.project.parts.map((part) => part.name)).toEqual([
      "主唱",
      "harmony",
    ]);
    expect(editor.part.name).toBe("harmony");
    expect(editor.line?.startMs).toBe(2000);
    expect(editor.message).toContain("harmony");
  });
});
