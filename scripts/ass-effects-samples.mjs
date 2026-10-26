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
        "[00:01]<00:01>君<00:01.70>と<00:02.30>歌<00:03.10>う<00:03.80>\n[00:04.80]<00:04.80>Hello <00:05.50>world<00:06.30>\n[00:07]<00:07>星<00:07.70>の<00:08.20>光<00:09.20>",
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
    function sample(
      name,
      source,
      style,
      width = 1920,
      height = 1080,
      extra = {},
    ) {
      const start = performance.now();
      const out = exportAss(source, {
        style,
        width,
        height,
        fill: "kf",
        leadInMs: 800,
        introHintMs: 0,
        ...extra,
        ...metrics,
      });
      result.push({
        name,
        width,
        height,
        ...out,
        exportMs: performance.now() - start,
      });
    }
    for (const preset of assEffectPresets) {
      const style = {
        ...defaultAssStyle,
        effects: { preset: preset.id, intensity: "medium", color: null },
      };
      sample(preset.id, project, style);
      for (const layout of ["diagonal", "single"])
        sample(`${preset.id}-${layout}`, project, {
          ...style,
          layout,
          diagonalPreview: true,
        });
      for (const height of [720, 2160]) {
        if (["neon", "bounce", "sweep", "particles"].includes(preset.id))
          sample(
            `${preset.id}-${height}`,
            project,
            style,
            (height * 16) / 9,
            height,
          );
      }
    }
    const edgeProject = newProject(
      importLyrics(
        "[00:10]<00:10>星<00:10.05>の<00:10.10>光<00:10.12>と<00:10.50>君<00:11.10>\n[00:14]<00:14>朝<00:14.60>日<00:15.50>",
      ).lines,
    );
    setRuby(edgeProject.parts[0].lines[0], 4, ["き", "み"]);
    edgeProject.parts[0].lines[0].units[4].syllables[1].startMs = 10800;
    for (const preset of ["float", "bounce", "sweep", "particles"])
      sample(
        `${preset}-edge`,
        edgeProject,
        {
          ...defaultAssStyle,
          layout: "diagonal",
          diagonalPreview: true,
          mainSize: 120,
          rubySize: 72,
          outline: 12,
          effects: { preset, intensity: "high", color: "#ff8800" },
        },
        1920,
        1080,
        { leadInMs: 0, introHintMs: 3000 },
      );
    const dense = newProject([]);
    const { newLine } = await import("/src/domain/model.ts");
    const { tokenize } = await import("/src/domain/tokenize.ts");
    for (let i = 0; i < 120; i++) {
      const line = newLine(
        "君と歌う星の光を見上げて朝まで踊ろう",
        1000 + i * 2000,
      );
      line.units = tokenize(line.text);
      line.units.forEach(
        (u, j) => (u.syllables[0].startMs = line.startMs + j * 70),
      );
      line.endMs = line.startMs + 1800;
      dense.parts[0].lines.push(line);
    }
    for (const preset of ["none", "neon", "bounce", "particles"])
      sample(`${preset}-dense`, dense, {
        ...defaultAssStyle,
        effects: { preset, intensity: "high", color: null },
      });
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
