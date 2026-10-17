import { describe, expect, it } from "vitest";
import { createEditor } from "../../src/state/editor";
import { FakeTransport } from "./helpers";
import { activeLines, unitStart } from "../../src/domain/model";

async function session(text: string) {
  const audio = new FakeTransport(),
    editor = createEditor(audio, false);
  await editor.initialize();
  await editor.loadAudio({} as File);
  editor.importText(text);
  editor.goStage(1);
  editor.confirmText();
  return { audio, editor };
}

describe("recording session transitions", () => {
  it("records successive lines, rewinds the last line, resumes without adding a point", async () => {
    const { audio, editor } = await session("今日\nhello world");
    await editor.enter();
    expect(editor.mode).toBe("recording");
    expect(editor.line?.startMs).toBeNull();
    audio.position = 1200;
    await editor.enter();
    expect(editor.lineIndex).toBe(1);
    expect(editor.playing).toBe(true);
    editor.backspace();
    expect(editor.lineIndex).toBe(0);
    expect(editor.line?.startMs).toBeNull();
    expect(editor.positionMs).toBe(200);
    expect(editor.mode).toBe("paused");
    await editor.enter();
    expect(editor.line?.startMs).toBeNull();
    audio.position = 1300;
    await editor.enter();
    audio.position = 7000;
    await editor.enter();
    expect(editor.lines.map((l) => l.startMs)).toEqual([1300, 7000]);
    expect(editor.playing).toBe(false);
    editor.confirmLines();
    expect(editor.project.stage).toBe(3);
  });
  it("requires N starts plus a terminal boundary, then pauses for manual advance", async () => {
    const { audio, editor } = await session("[00:01]きゃ\n[00:06]次");
    editor.confirmLines();
    expect(editor.line?.units.map((u) => u.text)).toEqual(["き", "ゃ"]);
    await editor.enter();
    audio.position = 1100;
    await editor.enter();
    audio.position = 1700;
    await editor.enter();
    expect(editor.cursor).toBe(2);
    expect(editor.line?.endMs).toBe(6000);
    expect(editor.line?.endInferred).toBe(true);
    expect(editor.playing).toBe(true);
    audio.position = 2600;
    await editor.enter();
    expect(editor.line?.endMs).toBe(2600);
    expect(editor.line?.endInferred).toBeUndefined();
    expect(editor.mode).toBe("idle");
    expect(editor.lineIndex).toBe(0);
    await editor.enter();
    expect(editor.line?.endMs).toBe(2600);
    expect(editor.playing).toBe(false);
    editor.nextLine();
    expect(editor.lineIndex).toBe(1);
    expect(editor.playing).toBe(false);
  });
  it("can undo the terminal, resume and record it again", async () => {
    const { audio, editor } = await session("[00:01]君");
    editor.confirmLines();
    await editor.enter();
    audio.position = 1100;
    await editor.enter();
    audio.position = 2400;
    await editor.enter();
    editor.backspace();
    expect(editor.line?.endMs).toBe(20000);
    expect(editor.line?.endInferred).toBe(true);
    expect(editor.positionMs).toBe(1400);
    await editor.enter();
    expect(editor.line?.endMs).toBe(20000);
    audio.position = 2500;
    await editor.enter();
    expect(editor.line?.endMs).toBe(2500);
  });
  it("completes the last line end on entering word timing and can undo it", async () => {
    const { editor } = await session("[00:01]今日\n[00:06]次");
    expect(editor.lines[1].endMs).toBeNull();
    editor.confirmLines();
    expect(editor.project.stage).toBe(3);
    expect(editor.lines[1].endMs).toBe(20000);
    expect(editor.lines[1].endInferred).toBe(true);
    editor.undo();
    expect(editor.lines[1].endMs).toBeNull();
    expect(editor.project.stage).toBe(3);
  });
  it("refuses guided word timing when a line still lacks an onset", async () => {
    const { editor } = await session("[00:06]次\n今日");
    editor.confirmLines();
    expect(editor.project.stage).toBe(2);
    expect(editor.error).toContain("句首");
    expect(editor.line?.text).toBe("今日");
  });
  it("stops at next sentence without claiming its boundary is a measured terminal", async () => {
    const { audio, editor } = await session("[00:01]君\n[00:04]次");
    editor.confirmLines();
    await editor.enter();
    audio.position = 1200;
    await editor.enter();
    audio.end();
    expect(editor.mode).toBe("ended");
    await editor.enter();
    expect(editor.line?.endMs).toBe(4000);
    expect(editor.line?.endInferred).toBe(true);
    expect(editor.isComplete).toBe(false);
  });
  it("requires valid lines, ignores input before timing stages, preserves prefix on local retime", async () => {
    const { audio, editor } = await session("今日");
    editor.confirmLines();
    expect(editor.project.stage).toBe(2);
    editor.goStage(1);
    await editor.enter();
    expect(audio.playing).toBe(false);
    editor.importText("[00:01]<00:01>今<00:02>日<00:03>");
    editor.goStage(1);
    editor.confirmText();
    editor.confirmLines();
    editor.retime(1);
    expect(editor.line?.units.map((u) => unitStart(u))).toEqual([1000, null]);
    expect(editor.line?.endMs).toBeNull();
    editor.undo();
    expect(editor.line?.units.map((u) => unitStart(u))).toEqual([1000, 2000]);
    expect(editor.line?.endMs).toBe(3000);
    editor.redo();
    expect(editor.line?.units.map((u) => unitStart(u))).toEqual([1000, null]);
  });
  it("clears the current line timing as one undoable edit", async () => {
    const { editor } = await session(
      "[00:01]<00:01>今<00:02>日<00:03>も<00:04>",
    );
    editor.confirmLines();
    expect(editor.line?.startMs).toBe(1000);
    expect(editor.line?.units.map((unit) => unitStart(unit))).toEqual([
      1000, 2000, 3000,
    ]);
    expect(editor.line?.endMs).toBe(4000);

    editor.clearLineTiming();
    expect(editor.line?.startMs).toBeNull();
    expect(editor.line?.units.map((unit) => unitStart(unit))).toEqual([
      null,
      null,
      null,
    ]);
    expect(editor.line?.endMs).toBeNull();
    expect(editor.canUndo).toBe(true);

    editor.undo();
    expect(editor.line?.startMs).toBe(1000);
    expect(editor.line?.units.map((unit) => unitStart(unit))).toEqual([
      1000, 2000, 3000,
    ]);
    expect(editor.line?.endMs).toBe(4000);
  });
});

describe("explicit playback and recording modes", () => {
  it("lets ordinary playback audition incomplete lyrics without recording", async () => {
    const { audio, editor } = await session("[00:01]今日");
    editor.confirmLines();
    await editor.togglePlayback();
    expect(editor.mode).toBe("review");
    expect(editor.recordingArmed).toBe(false);
    audio.position = 1500;
    await editor.enter();
    expect(editor.line?.units[0].syllables[0].startMs).toBeNull();
    expect(editor.mode).toBe("recording");
    audio.position = 1600;
    await editor.enter();
    expect(editor.line?.units[0].syllables[0].startMs).toBe(1600);
  });
  it("protects imported line onsets until explicitly armed for retiming", async () => {
    const { audio, editor } = await session("[00:01]今日");
    await editor.enter();
    expect(audio.playing).toBe(false);
    expect(editor.line?.startMs).toBe(1000);
    editor.retimeLine();
    await editor.enter();
    audio.position = 1300;
    await editor.enter();
    expect(editor.line?.startMs).toBe(1300);
  });
  it("re-recording a line onset keeps later units and the end where they are", async () => {
    const { audio, editor } = await session(
      "[00:01]<00:01>今<00:02>日<00:03>\n[00:06]次",
    );
    editor.retimeLine();
    await editor.enter();
    audio.position = 1500;
    await editor.enter();
    expect(editor.line?.startMs).toBe(1500);
    expect(editor.line?.units.map((u) => unitStart(u))).toEqual([1500, 2000]);
    expect(editor.line?.endMs).toBe(3000);
  });
  it("allows text preparation without an audio prerequisite but gates timing", async () => {
    const editor = createEditor(undefined, false);
    await editor.initialize();
    editor.importText("今日");
    editor.goStage(1);
    expect(editor.project.stage).toBe(1);
    editor.confirmText();
    expect(editor.project.stage).toBe(1);
    expect(editor.error).toContain("音频");
  });
});

describe("audition ranges and isolated partial timing", () => {
  it("keeps one pass fixed and loops the same target using committed boundaries", async () => {
    const { audio, editor } = await session("[00:01]<00:01>今<00:02>日<00:03>");
    editor.confirmLines();
    editor.selectedIndex = 0;
    editor.loopAudition = true;
    await editor.review("boundary");
    expect(editor.auditionRange).toEqual([600, 1600]);
    editor.previewCommand("field", (p) => {
      activeLines(p)[0].startMs = 1300;
      activeLines(p)[0].units[0].syllables[0].startMs = 1300;
    });
    expect(editor.auditionRange).toEqual([600, 1600]);
    audio.end();
    await Promise.resolve();
    expect(editor.auditionRange).toEqual([600, 1600]);
    editor.commitPreview("调整起点");
    editor.selectedIndex = 1;
    audio.end();
    await Promise.resolve();
    expect(editor.auditionRange).toEqual([900, 1900]);
    expect(editor.mode).toBe("review");
    editor.pause();
    expect(audio.playing).toBe(false);
  });
  it("fills only the missing segment and preserves later anchors and terminal", async () => {
    const { audio, editor } = await session(
      "[00:01]<00:01>今<00:02>日<00:03>も<00:04>",
    );
    editor.confirmLines();
    editor.command("缺失边界", (p) => {
      activeLines(p)[0].units[1].syllables[0].startMs = null;
    });
    await editor.enter();
    expect(audio.until).toBe(3000);
    audio.position = 2200;
    await editor.enter();
    expect(editor.line?.units.map((unit) => unitStart(unit))).toEqual([
      1000, 2200, 3000,
    ]);
    expect(editor.line?.endMs).toBe(4000);
    expect(editor.playing).toBe(false);
    expect(editor.isComplete).toBe(true);
  });
});

describe("shared editing views", () => {
  it("switches without gates, preserves selected line and position and shares text edits and history", async () => {
    const { editor } = await session(
      "[00:01]<00:01>今<00:02>日<00:03>\n[00:06]<00:06>次<00:07>",
    );
    editor.confirmLines();
    editor.selectLine(editor.lines[1].id);
    editor.seek(6300);
    editor.goStage(1);
    expect(editor.lineIndex).toBe(1);
    expect(editor.positionMs).toBe(6300);
    editor.command("修改第二行", (p) => {
      activeLines(p)[1].text = "次の歌";
      activeLines(p)[1].units = [];
      activeLines(p)[1].endMs = null;
      p.unlockedStage = 1; // Existing callers / v1 snapshots cannot lock a view.
    });
    editor.goStage(2);
    expect(editor.lineIndex).toBe(1);
    expect(editor.line?.text).toBe("次の歌");
    editor.undo();
    expect(editor.project.stage).toBe(2);
    expect(editor.line?.text).toBe("次");
    expect(editor.lines[0].endMs).toBe(3000);
    editor.redo();
    expect(editor.project.stage).toBe(2);
    expect(editor.line?.text).toBe("次の歌");
    editor.goStage(3);
    expect(editor.line?.units.map((unit) => unit.text).join("")).toBe("次の歌");
    expect(editor.positionMs).toBe(6300);
    expect(editor.recordingArmed).toBe(false);
  });
  it("does not treat a word point as a sentence point after changing views", async () => {
    const { audio, editor } = await session("[00:01]今日");
    editor.confirmLines();
    await editor.enter();
    audio.position = 1200;
    await editor.enter();
    editor.goStage(2);
    editor.backspace();
    expect(editor.lines[0].units[0].syllables[0].startMs).toBe(1200);
    expect(editor.project.stage).toBe(2);
    expect(editor.recordingArmed).toBe(false);
  });
  it("opens each editing view without audio or sentence onsets while keeping record validation", async () => {
    const editor = createEditor(undefined, false);
    editor.importText("今日\n次");
    for (const stage of [3, 1, 2, 1, 3]) {
      editor.goStage(stage);
      expect(editor.project.stage).toBe(stage);
    }
    await editor.enter();
    expect(editor.error).toContain("音频");
    expect(editor.line?.startMs).toBeNull();
  });
});
