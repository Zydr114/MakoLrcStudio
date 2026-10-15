import { importLyrics } from "../../src/domain/lrc";
import { newProject, unitStart, type LyricLine } from "../../src/domain/model";
import type { TransportPort } from "../../src/state/editor";
import type { AudioAsset } from "../../src/audio/transport";

/** A single-part project built from LRC text, the way an import creates it. */
export function fromLyrics(text: string) {
  const imported = importLyrics(text);
  return { ...newProject(imported.lines), metadata: imported.metadata };
}
export const starts = (line: LyricLine) => line.units.map(unitStart);
export const texts = (line: LyricLine) => line.units.map((unit) => unit.text);

/** A 20 s clip whose position the test sets by hand. */
export class FakeTransport implements TransportPort {
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
