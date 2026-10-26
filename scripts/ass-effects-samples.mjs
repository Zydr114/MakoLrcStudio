/** Generate actual browser-measured ASS samples; audio/lyrics stay local. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const dir = resolve(process.argv[2] || "/tmp/mako-ass-effects");
await mkdir(dir, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const samples = await page.evaluate(async () => {
    const { newProject, newPart } = await import("/src/domain/model.ts");
    const { importLyrics } = await import("/src/domain/lrc.ts");
    const { setRuby } = await import("/src/domain/ruby.ts");
    const { exportAss } = await import("/src/domain/ass.ts");
    const { defaultAssStyle, assEffectPresets } =
      await import("/src/domain/assStyle.ts");
    const { fontMetrics } = await import("/src/state/assFont.ts");
    const project = newProject(
      importLyrics(
        "[00:01]<00:01>君<00:01.70>と<00:02.30>歌<00:03.10>う<00:03.80>\n[00:04.20]<00:04.20>Hello <00:05.10>world<00:06.30>\n[00:07]<00:07>星<00:07.70>の<00:08.20>光<00:09.20>",
      ).lines,
    );
    project.parts[0].name = "A";
    const first = project.parts[0].lines[0];
    setRuby(first, 0, ["き", "み"]);
    first.units[0].syllables[1].startMs = 1350;
    first.translation = "与你一起歌唱";
    first.roman = "kimi to utau";
    const other = newPart(
      "B",
      importLyrics("[00:02]<00:02>一<00:02.70>緒<00:03.50>").lines,
      "#d6457f",
    );
    project.parts.push(other);
    const bg = newPart(
      "和声",
      importLyrics("[00:01.80]<00:01.80>あ<00:03.30>").lines,
      "#2f9c5a",
    );
    bg.background = true;
    project.parts.push(bg);
    const metrics = await fontMetrics(defaultAssStyle.font);
    const result = [];
    for (const preset of assEffectPresets.slice(0, 4)) {
      const start = performance.now();
      const out = exportAss(project, {
        style: {
          ...defaultAssStyle,
          effects: { preset: preset.id, intensity: "medium", color: null },
        },
        width: 1920,
        height: 1080,
        fill: "kf",
        leadInMs: 800,
        introHintMs: 0,
        ...metrics,
      });
      result.push({
        name: preset.id,
        ...out,
        exportMs: performance.now() - start,
      });
    }
    return result;
  });
  for (const sample of samples)
    await writeFile(resolve(dir, `${sample.name}.ass`), "\ufeff" + sample.text);
  await writeFile(
    resolve(dir, "manifest.json"),
    JSON.stringify(
      samples.map(({ text, ...s }) => ({
        ...s,
        bytes: Buffer.byteLength(text),
        events: text.split("\n").filter((l) => l.startsWith("Dialogue:"))
          .length,
      })),
      null,
      2,
    ),
  );
  console.log(`Generated ${samples.length} samples in ${dir}`);
} finally {
  await browser?.close();
  await server.close();
}
