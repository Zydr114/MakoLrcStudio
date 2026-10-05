import { describe, expect, it } from "vitest";
import { newProject, validate } from "../../src/domain/model";
import { importLyrics } from "../../src/domain/lrc";
import {
  lineIntervals,
  tokenIntervals,
  sampleLineTiming,
} from "../../src/domain/timing";
import {
  timeToRatio,
  ratioToTime,
  intervalGeometry,
} from "../../src/domain/viewport";
import { createEditor } from "../../src/state/editor";
import { setUnitStart } from "../../src/domain/edit";

const fixture = () => ({
  ...newProject(),
  ...importLyrics("[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]次"),
});
describe("timeline projection and shared sampling", () => {
  it("uses half-open intervals and removes highlighting at the real terminal", () => {
    const line = fixture().lines[0];
    expect(sampleLineTiming(line, 999).status).toBe("before");
    expect(sampleLineTiming(line, 1000)).toMatchObject({
      unitIndex: 0,
      progress: 0,
    });
    expect(sampleLineTiming(line, 2000).unitIndex).toBe(1);
    expect(sampleLineTiming(line, 3999).unitIndex).toBe(2);
    expect(sampleLineTiming(line, 4000)).toMatchObject({
      unitId: null,
      status: "gap",
    });
  });
  it("does not bridge a missing successor or fabricate progress in its unknown tail", () => {
    const line = fixture().lines[0];
    line.units[1].startMs = null;
    expect(tokenIntervals(line)[0]).toMatchObject({
      endMs: null,
      kind: "unknown",
    });
    expect(sampleLineTiming(line, 1500)).toMatchObject({
      unitId: null,
      progress: null,
      status: "unknown",
    });
    expect(sampleLineTiming(line, 3500).unitIndex).toBe(2);
  });
  it("distinguishes line reference extents, real silence and unknown onsets", () => {
    const project = fixture();
    project.audio = {
      name: "x",
      size: 1,
      hash: "a".repeat(64),
      durationMs: 10000,
    };
    expect(lineIntervals(project)[0]).toMatchObject({
      endMs: 4000,
      kind: "confirmed",
    });
    expect(lineIntervals(project)[1]).toMatchObject({
      endMs: 10000,
      kind: "reference",
    });
    project.lines[0].endMs = null;
    project.lines[1].startMs = null;
    expect(lineIntervals(project)[0]).toMatchObject({
      endMs: null,
      kind: "unknown",
    });
    expect(lineIntervals(project)).toHaveLength(1);
  });
  it("keeps conflicting import geometry diagnosable and avoids claiming an active syllable", () => {
    const line = fixture().lines[0];
    line.units[1].startMs = 500;
    expect(
      tokenIntervals(line).some((interval) => interval.kind === "conflict"),
    ).toBe(true);
    expect(sampleLineTiming(line, 1100).status).toBe("conflict");
  });
  it("preserves a mismatched imported first onset and diagnoses it until explicitly synchronized", () => {
    const project = fixture();
    project.lines[0].units[0].startMs = 1200;
    expect(
      validate(project).some((issue) => issue.message.includes("句首一致")),
    ).toBe(true);
    expect(sampleLineTiming(project.lines[0], 1300).status).toBe("conflict");
    expect(project.lines[0].startMs).toBe(1000);
    setUnitStart(project, 0, 0, 1200);
    expect(project.lines[0].startMs).toBe(1200);
    expect(sampleLineTiming(project.lines[0], 1300).unitIndex).toBe(0);
  });
  it("uses the same reversible transform for boundaries, cursor and clipped fills", () => {
    const view = { startMs: 1200, endMs: 4200 };
    expect(ratioToTime(timeToRatio(2317, view), view)).toBe(2317);
    expect(intervalGeometry(1000, 2000, view)).toEqual({
      left: 0,
      width: (800 / 3000) * 100,
    });
    expect(intervalGeometry(3000, 5000, view)).toEqual({ left: 60, width: 40 });
  });
  it("previews a shared boundary without persistence or an undo entry, commits once and cancels cleanly", () => {
    const editor = createEditor(undefined, false);
    editor.importText("[00:01]<00:01>今<00:02>日<00:03>");
    editor.previewCommand("boundary", (p) => setUnitStart(p, 0, 1, 2300));
    expect(editor.line?.units[1].startMs).toBe(2000);
    expect(editor.displayLine?.units[1].startMs).toBe(2300);
    editor.clearPreview();
    expect(editor.displayLine?.units[1].startMs).toBe(2000);
    editor.previewCommand("boundary", (p) => setUnitStart(p, 0, 1, 2400));
    editor.commitPreview("调整边界");
    expect(editor.line?.units[1].startMs).toBe(2400);
    editor.previewCommand("boundary", (p) => setUnitStart(p, 0, 1, 2500));
    editor.undo();
    expect(editor.line?.units[1].startMs).toBe(2000);
    expect(editor.displayLine?.units[1].startMs).toBe(2000);
    expect(editor.previewOwner).toBeNull();
    editor.redo();
    expect(editor.line?.units[1].startMs).toBe(2400);
    expect(editor.displayLine?.units[1].startMs).toBe(2400);
  });
});
