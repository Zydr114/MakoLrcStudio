// A real, browser-decoded PCM file: audible pulses make timing transport deterministic.
export function wav(seconds = 12) {
  const rate = 16000,
    count = rate * seconds,
    data = Buffer.alloc(44 + count * 2);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    data.writeInt16LE(
      Math.round(
        Math.sin((i / rate) * Math.PI * 880) *
          12000 *
          (i % rate < rate / 8 ? 1 : 0.05),
      ),
      44 + i * 2,
    );
  return data;
}
export const audio = {
  name: "pulses.wav",
  mimeType: "audio/wav",
  buffer: wav(),
};
