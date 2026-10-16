import { test, expect } from "@playwright/test";
import { exportAs } from "./controls";
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
