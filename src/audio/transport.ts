import { eventToSourceMs, type ClockAnchor } from './clock';

export interface AudioInfo { name: string; size: number; hash: string; durationMs: number }
export interface AudioAsset { info: AudioInfo; peaks: Float32Array; buffer: AudioBuffer }

async function makePeaks(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * 1000);
  const peaks = new Float32Array(length);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let deadline = performance.now() + 8;
  for (let i = 0; i < length; i++) {
    const a = Math.floor(i * buffer.length / length);
    const b = Math.max(a + 1, Math.floor((i + 1) * buffer.length / length));
    let peak = 0;
    for (const channel of channels) for (let j = a; j < b; j++) {
      const value = channel[j] ?? 0;
      if (Math.abs(value) > Math.abs(peak)) peak = value;
    }
    peaks[i] = peak;
    if (i % 64 === 0 && performance.now() > deadline) {
      await new Promise(resolve => setTimeout(resolve, 0));
      deadline = performance.now() + 8;
    }
  }
  return peaks;
}

export class AudioTransport {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private anchor: ClockAnchor = { offsetMs: 0, contextStart: 0, rate: 1 };
  private positionMs = 0;
  private untilMs = 0;
  private generation = 0;
  private playGeneration = 0;
  asset: AudioAsset | null = null;
  playing = false;
  rate = 1;
  volume = 0.8;
  onEnded: (() => void) | null = null;

  private audioContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }

  async load(file: File, expectedHash?: string): Promise<AudioAsset> {
    const generation = ++this.generation;
    const data = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (expectedHash && hash !== expectedHash) throw new Error('这份音频与草稿不一致。请选择原来的音频，或新建一个项目。');
    const buffer = await this.audioContext().decodeAudioData(data);
    const peaks = await makePeaks(buffer);
    if (generation !== this.generation) throw new Error('音频加载已取消。');
    this.pause();
    this.asset = { info: { name: file.name, size: file.size, hash, durationMs: Math.floor(buffer.duration * 1000) }, buffer, peaks };
    this.positionMs = 0;
    return this.asset;
  }

  private outputTime(): { contextTime: number; performanceTime: number } {
    const ctx = this.audioContext();
    const stamp = ctx.getOutputTimestamp?.();
    if (stamp?.performanceTime && stamp.contextTime) return { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime };
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    return { contextTime: ctx.currentTime - latency, performanceTime: performance.now() };
  }

  captureMs(eventTime = performance.now()): number | null {
    if (!this.playing) return null;
    const value = eventToSourceMs(eventTime, this.outputTime(), this.anchor);
    if (value < this.anchor.offsetMs) return null;
    return Math.round(Math.min(this.untilMs, value));
  }

  nowMs(): number {
    return this.playing ? (this.captureMs() ?? this.anchor.offsetMs) : this.positionMs;
  }

  async play(fromMs = this.positionMs, untilMs = this.asset?.info.durationMs ?? 0): Promise<void> {
    if (!this.asset) throw new Error('请先导入音频。');
    this.pause();
    const ctx = this.audioContext();
    const generation = this.generation;
    const playGeneration = this.playGeneration;
    await ctx.resume();
    if (generation !== this.generation || playGeneration !== this.playGeneration) return;
    const end = Math.min(untilMs, this.asset.info.durationMs);
    const from = Math.max(0, Math.min(fromMs, end - 1));
    const source = ctx.createBufferSource();
    source.buffer = this.asset.buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.gain!);
    this.anchor = { offsetMs: from, contextStart: ctx.currentTime + 0.015, rate: this.rate };
    this.untilMs = end;
    this.source = source;
    this.playing = true;
    source.onended = () => {
      if (this.source !== source) return;
      source.disconnect();
      this.source = null;
      this.positionMs = end;
      this.playing = false;
      this.onEnded?.();
    };
    source.start(this.anchor.contextStart, from / 1000);
    source.stop(this.anchor.contextStart + (end - from) / (this.rate * 1000));
  }

  pause(): void {
    ++this.playGeneration;
    this.positionMs = this.nowMs();
    this.playing = false;
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
  }

  seek(ms: number): void {
    this.pause();
    this.positionMs = Math.max(0, Math.min(ms, this.asset?.info.durationMs ?? 0));
  }

  setRate(rate: number): void { this.pause(); this.rate = rate; }
  setVolume(volume: number): void { this.volume = volume; if (this.gain) this.gain.gain.value = volume; }
  reset(): void { ++this.generation; this.pause(); this.asset = null; this.positionMs = 0; }
  dispose(): void { this.reset(); void this.context?.close(); this.context = null; }
}
