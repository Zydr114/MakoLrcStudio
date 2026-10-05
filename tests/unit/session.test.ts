import { describe, expect, it } from "vitest";
import { createEditor, type TransportPort } from "../../src/state/editor";
import type { AudioAsset } from "../../src/audio/transport";

class FakeTransport implements TransportPort {
  asset = {
    info: {
      name: "test.wav",
      size: 100,
      hash: "a".repeat(64),
      durationMs: 20000,
    },
    peaks: new Float32Array(),
    buffer: {} as AudioBuffer,
  } satisfies AudioAsset;
  playing = false;
  rate = 1;
  volume = 0.8;
  position = 0;
  until = 20000;
  onEnded: (() => void) | null = null;
  async load() {
    return this.asset;
  }
  async play(from = 0, until = 20000) {
    this.position = from;
    this.until = until;
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  seek(ms: number) {
    this.position = Math.max(0, Math.min(20000, ms));
  }
  setRate(rate: number) {
    this.rate = rate;
  }
  setVolume(volume: number) {
    this.volume = volume;
  }
  reset() {
    this.position = 0;
  }
  captureMs() {
    return this.playing ? this.position : null;
  }
  nowMs() {
    return this.position;
  }
  end() {
    this.position = this.until;
    this.playing = false;
    this.onEnded?.();
  }
}
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
    expect(editor.project.lines.map((l) => l.startMs)).toEqual([1300, 7000]);
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
    expect(editor.line?.endMs).toBeNull();
    expect(editor.playing).toBe(true);
    audio.position = 2600;
    await editor.enter();
    expect(editor.line?.endMs).toBe(2600);
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
    expect(editor.line?.endMs).toBeNull();
    expect(editor.positionMs).toBe(1400);
    await editor.enter();
    expect(editor.line?.endMs).toBeNull();
    audio.position = 2500;
    await editor.enter();
    expect(editor.line?.endMs).toBe(2500);
  });
  it("stops at next sentence and allows an explicit Enter for its terminal", async () => {
    const { audio, editor } = await session("[00:01]君\n[00:04]次");
    editor.confirmLines();
    await editor.enter();
    audio.position = 1200;
    await editor.enter();
    audio.end();
    expect(editor.mode).toBe("ended");
    await editor.enter();
    expect(editor.line?.endMs).toBe(4000);
    expect(editor.isComplete).toBe(true);
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
    expect(editor.line?.units.map((u) => u.startMs)).toEqual([1000, null]);
    expect(editor.line?.endMs).toBeNull();
    editor.undo();
    expect(editor.line?.units.map((u) => u.startMs)).toEqual([1000, 2000]);
    expect(editor.line?.endMs).toBe(3000);
    editor.redo();
    expect(editor.line?.units.map((u) => u.startMs)).toEqual([1000, null]);
  });
});
