import { test, expect } from "@playwright/test";
import { choose, exportAs, setChecked } from "./controls";
let n = 0;
const id = () => `p-${++n}`;
type S = [string, number];
/** units: [text, reading syllables with starts | null, start] */
function line(
  spec: [string, S[] | null, number][],
  end: number,
  extra: object = {},
) {
  const units = spec.map(([text, reading, start]) =>
    reading
      ? {
          id: id(),
          text,
          ruby: true,
          syllables: reading.map(([t, s]) => ({
            id: id(),
            text: t,
            startMs: s,
            endMs: null,
          })),
        }
      : {
          id: id(),
          text,
          ruby: false,
          syllables: [{ id: id(), text, startMs: start, endMs: null }],
        },
  );
  return {
    id: id(),
    text: units.map((u) => u.text).join(""),
    startMs: units[0].syllables[0].startMs,
    endMs: end,
    units,
    translation: "",
    roman: "",
    ...extra,
  };
}
const part = (
  name: string,
  color: string,
  lines: object[],
  extra: object = {},
) => ({
  id: id(),
  name,
  kind: "person",
  background: false,
  color,
  lines,
  ...extra,
});
/** A duet with readings, a harmony, a group, translation and romaji. */
test("ASS exports the layout and the karaoke source, and imports back into parts", async ({
  page,
}) => {
  const a1 = line(
    [
      ["所", [["しょ", 1000]], 0],
      [
        "詮",
        [
          ["せ", 1400],
          ["ん", 1700],
        ],
        0,
      ],
      ["は", null, 2000],
      [
        "夢",
        [
          ["ゆ", 2400],
          ["め", 2700],
        ],
        0,
      ],
      ["の", null, 3000],
      [
        "世界",
        [
          ["せ", 3300],
          ["か", 3600],
          ["い", 3900],
        ],
        0,
      ],
    ],
    4600,
    { translation: "终究只是梦中的世界", roman: "shosen wa yume no sekai" },
  );
  const a2 = line(
    [
      ["また", null, 12500],
      [
        "明日",
        [
          ["あ", 13000],
          ["し", 13300],
          ["た", 13600],
        ],
        0,
      ],
    ],
    14200,
    { translation: "明天见", roman: "mata ashita" },
  );
  const b1 = line(
    [
      [
        "君",
        [
          ["き", 5200],
          ["み", 5500],
        ],
        0,
      ],
      ["の", null, 5800],
      [
        "声",
        [
          ["こ", 6100],
          ["え", 6400],
        ],
        0,
      ],
      ["が", null, 6700],
      ["聞", [["き", 7000]], 0],
      ["こ", null, 7300],
      ["え", null, 7600],
      ["る", null, 7900],
    ],
    8600,
    { translation: "听见你的声音", roman: "kimi no koe ga kikoeru" },
  );
  const g1 = line(
    [
      ["み", null, 9200],
      ["ん", null, 9500],
      ["な", null, 9800],
      ["で", null, 10100],
      [
        "歌",
        [
          ["う", 10400],
          ["た", 10700],
        ],
        0,
      ],
      ["お", null, 11000],
      ["う", null, 11300],
    ],
    12000,
    { translation: "大家一起唱吧", roman: "minna de utaou" },
  );
  const bg1 = line(
    [
      ["ゆ", null, 3400],
      ["め", null, 3800],
    ],
    4400,
  );
  const A = part("A", "#0b84d8", [a1, a2]);
  const project = {
    version: 2,
    name: "ass-sample",
    metadata: { ti: "Sample" },
    audio: null,
    parts: [
      A,
      part("B", "#d6457f", [b1]),
      part("全员", "#c98400", [g1], { kind: "group" }),
      part("和声", "#2f9c5a", [bg1], { background: true }),
    ],
    mainPartId: A.id,
    activePartId: A.id,
    stage: 1,
    unlockedStage: 3,
    activeLineId: a1.id,
    playheadMs: 0,
    translationLang: "zh-CN",
    romanLang: "ja-Latn",
  };
  await page.goto("/");
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "s.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.locator(".prepare-view")).toBeVisible();
  await exportAs(page, "ASS");
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "导出 ASS" })
    .getByRole("button", { name: "导出 ASS" })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("ass-sample.ass");
  const fs = await import("node:fs/promises");
  const ass = await fs.readFile((await file.path())!, "utf8");
  if (process.env.MAKO_ASS_SAMPLE)
    await fs.writeFile(process.env.MAKO_ASS_SAMPLE, ass);
  await expect(page.getByRole("status")).toContainText("成品字幕与卡拉 OK 源");
  expect(ass).toContain("PlayResY: 1080");
  expect(ass).toContain("Style: Mako-B,Noto Sans CJK JP,64,&H007F45D6");
  // Readings: one rendered line per ruby group and the Aegisub furigana source.
  expect(ass).toMatch(/Mako-A-Ruby,A,0,0,0,fx,\{\\an2\\pos\(\d+,\d+\)/);
  expect(ass).toContain("{\\k40}所|しょ{\\k30}詮|せ{\\k30}#|ん");
  expect(ass).toContain("Mako-Translation,A,0,0,0,,");

  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.locator('input[type=file][accept^=".lrc"]').setInputFiles({
    name: "ass-sample.ass",
    mimeType: "text/x-ssa",
    buffer: Buffer.from(ass),
  });
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await expect(page.getByRole("status")).toContainText(
    "已导入 ASS：4 个声部（A、B、全员、和声）",
  );
  await page.locator("mdui-segmented-button", { hasText: "注音" }).click();
  await expect(page.locator(".ruby-unit rt").first()).toHaveText("しょ");
  await page.locator("mdui-segmented-button", { hasText: "翻译" }).click();
  await expect(page.getByLabel("第 1 行翻译")).toHaveValue(
    "终究只是梦中的世界",
  );
});

test("ASS intro hint appears before a line after a long gap", async ({
  page,
}) => {
  const first = line([["あ", null, 10000]], 12000);
  const second = line([["い", null, 20000]], 22000);
  const a = part("A", "#0b84d8", [first, second]);
  const project = {
    version: 2,
    name: "ass-intro-sample",
    metadata: { ti: "Intro" },
    audio: null,
    parts: [a],
    mainPartId: a.id,
    activePartId: a.id,
    stage: 1,
    unlockedStage: 3,
    activeLineId: first.id,
    playheadMs: 0,
    translationLang: "",
    romanLang: "",
  };
  await page.goto("/");
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "intro.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.locator(".prepare-view")).toBeVisible();
  await exportAs(page, "ASS");
  const dialog = page.getByRole("dialog", { name: "导出 ASS" });
  await dialog.getByLabel("前奏提示").fill("3000");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 ASS" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const ass = await fs.readFile((await file.path())!, "utf8");
  if (process.env.MAKO_ASS_INTRO_SAMPLE)
    await fs.writeFile(process.env.MAKO_ASS_INTRO_SAMPLE, ass);
  const lines = ass
    .split("\n")
    .filter((line) => /^(Dialogue|Comment):/.test(line));
  const hints = lines.filter((line) => line.includes("●"));
  expect(hints).toHaveLength(2);
  expect(hints[0]).toContain(
    "Dialogue: 1,0:00:06.20,0:00:12.30,Mako-A,A,0,0,0,fx",
  );
  expect(hints[1]).toContain(
    "Dialogue: 1,0:00:16.20,0:00:22.30,Mako-A,A,0,0,0,fx",
  );
  expect(
    lines
      .filter((line) => line.startsWith("Comment"))
      .some((line) => line.includes("●")),
  ).toBe(false);
});

test("ASS style: per-layer sizes, bold, colors and roman toggle", async ({
  page,
}) => {
  const a = line(
    [
      [
        "詮",
        [
          ["せ", 1000],
          ["ん", 1300],
        ],
        0,
      ],
      ["な", null, 1600],
      ["い", null, 1900],
    ],
    4000,
    { roman: "sen nai" },
  );
  const b = line(
    [
      [
        "君",
        [
          ["き", 3000],
          ["み", 3300],
        ],
        0,
      ],
      ["と", null, 3600],
    ],
    6000,
    { roman: "kimi to" },
  );
  const A = part("A", "#0b84d8", [a]);
  const project = {
    version: 2,
    name: "ass-style-sample",
    metadata: { ti: "Style" },
    audio: null,
    parts: [A, part("B", "#d6457f", [b])],
    mainPartId: A.id,
    activePartId: A.id,
    stage: 1,
    unlockedStage: 3,
    activeLineId: a.id,
    playheadMs: 0,
    translationLang: "",
    romanLang: "",
  };
  await page.goto("/");
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "style.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.locator(".prepare-view")).toBeVisible();
  await exportAs(page, "ASS");
  const assDialog = page.getByRole("dialog", { name: "导出 ASS" });
  await expect(assDialog).toContainText("经典双行");
  await assDialog.getByRole("button", { name: "编辑样式…" }).click();
  const styleDialog = page.getByRole("dialog", { name: "字幕样式" });
  await expect(styleDialog).toBeVisible();
  await choose(page, "版式预设", "diagonal");
  await styleDialog.getByLabel("歌词字号").fill("80");
  await styleDialog.getByLabel("注音字号").fill("40");
  await styleDialog.getByLabel("罗马音字号").fill("36");
  await setChecked(page, "歌词粗体");
  await setChecked(page, "注音粗体");
  await setChecked(page, "罗马音粗体");
  await setChecked(page, "跟随歌词色", false);
  await styleDialog.getByLabel("注音颜色").fill("#abcdef");
  await styleDialog.getByLabel("罗马音颜色").fill("#123456");
  await styleDialog.getByLabel("描边粗细").fill("6");
  await styleDialog.getByLabel("描边颜色").fill("#ff0000");
  await styleDialog.getByLabel("未唱颜色").fill("#112233");
  await setChecked(page, "统一文字颜色", true);
  await styleDialog.getByLabel("纯色").fill("#00ff00");
  await styleDialog.getByRole("button", { name: "应用" }).click();
  await expect(styleDialog).not.toBeVisible();
  await expect(assDialog).toContainText("对角双行");
  await expect(assDialog).toContainText("歌词 80px");
  await expect(assDialog).toContainText("罗马音 36px");
  await expect(assDialog).toContainText("粗体：歌词、注音、罗马音");
  const download = page.waitForEvent("download");
  await assDialog.getByRole("button", { name: "导出 ASS" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const ass = await fs.readFile((await file.path())!, "utf8");
  if (process.env.MAKO_ASS_STYLE_SAMPLE)
    await fs.writeFile(process.env.MAKO_ASS_STYLE_SAMPLE, ass);
  const styleComment = ass
    .split("\n")
    .find((line) => line.startsWith("; mako-style: "))!;
  expect(JSON.parse(styleComment.slice("; mako-style: ".length))).toMatchObject(
    {
      layout: "diagonal",
      mainSize: 80,
      mainBold: true,
      rubySize: 40,
      rubyBold: true,
      rubyColor: "#abcdef",
      romanSize: 36,
      romanBold: true,
      romanColor: "#123456",
      includeRoman: true,
      outline: 6,
      outlineColor: "#ff0000",
      colorMode: "solid",
      solidColor: "#00ff00",
      unsungColor: "#112233",
    },
  );
  expect(ass).toContain(
    "Style: Mako-A,Noto Sans CJK JP,80,&H0000FF00,&H00332211,&H000000FF,&H64000000,-1,0,0,0,100,100,0,0,1,6,0,1,0,0,0,1",
  );
  expect(ass).toContain(
    "Style: Mako-A-Ruby,Noto Sans CJK JP,40,&H00EFCDAB,&H00332211,&H000000FF,&H64000000,-1,0,0,0,100,100,0,0,1,4,0,1,0,0,0,1",
  );
  expect(ass).toContain(
    "Style: Mako-Romaji,Noto Sans CJK JP,36,&H00563412,&H00332211,&H000000FF,&H64000000,-1,0,0,0,100,100,0,0,1,4,0,1,0,0,0,1",
  );
  const lines = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
  const aLine = lines.find(
    (line) => line.includes(",Mako-A,A,") && line.includes(",fx,"),
  )!;
  const aX = Number(/\\pos\((\d+),/.exec(aLine)![1]);
  expect(aX).toBeGreaterThan(1500);
  expect(aX).toBeLessThan(1800);
  const bLine = lines.find(
    (line) => line.includes(",Mako-B,B,") && line.includes(",fx,"),
  )!;
  expect(bLine).toContain("\\pos(120,");

  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.locator('input[type=file][accept^=".lrc"]').setInputFiles({
    name: "ass-style-sample.ass",
    mimeType: "text/x-ssa",
    buffer: Buffer.from(ass),
  });
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 ASS");
  await exportAs(page, "ASS");
  const reopened = page.getByRole("dialog", { name: "导出 ASS" });
  await expect(reopened).toContainText("对角双行");
  await expect(reopened).toContainText("歌词 80px");
  await expect(reopened).toContainText("罗马音 36px");
  await expect(reopened).toContainText("粗体：歌词、注音、罗马音");

  await reopened.getByRole("button", { name: "编辑样式…" }).click();
  await expect(styleDialog).toBeVisible();
  await setChecked(page, "包含罗马音行", false);
  await styleDialog.getByRole("button", { name: "应用" }).click();
  await expect(reopened).toContainText("不含罗马音行");
  const noRomanDownload = page.waitForEvent("download");
  await reopened.getByRole("button", { name: "导出 ASS" }).click();
  const noRoman = await fs.readFile(
    (await (await noRomanDownload).path())!,
    "utf8",
  );
  expect(noRoman).not.toContain("Mako-Romaji");
  expect(noRoman).not.toContain("sen nai");
  const noRomanComment = noRoman
    .split("\n")
    .find((line) => line.startsWith("; mako-style: "))!;
  expect(
    JSON.parse(noRomanComment.slice("; mako-style: ".length)),
  ).toMatchObject({ includeRoman: false, romanSize: 36 });
});
