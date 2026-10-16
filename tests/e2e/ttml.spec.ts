import { test, expect } from "@playwright/test";
import { exportAs } from "./controls";

let n = 0;
const id = () => `id-${++n}`;
const syllable = (text: string, startMs: number) => ({
  id: id(),
  text,
  startMs,
  endMs: null,
});
const unit = (text: string, startMs: number) => ({
  id: id(),
  text,
  ruby: false,
  syllables: [syllable(text, startMs)],
});
const line = (
  units: ReturnType<typeof unit>[],
  endMs: number,
  extra: object = {},
) => ({
  id: id(),
  text: units.map((u) => u.text).join(""),
  startMs: units[0].syllables[0].startMs,
  endMs,
  units,
  translation: "",
  roman: "",
  ...extra,
});
const part = (name: string, lines: object[], extra: object = {}) => ({
  id: id(),
  name,
  kind: "person",
  background: false,
  color: "#0b84d8",
  lines,
  ...extra,
});

/** A duet with a harmony and a reading, restored from a v2 project file. */
function project() {
  const ruby = {
    id: id(),
    text: "詮",
    ruby: true,
    syllables: [syllable("せ", 1000), syllable("ん", 1500)],
  };
  const first = line([ruby, unit("な", 2000)], 3000, {
    translation: "pointless",
  });
  const a = part("A", [first]);
  const b = part("B", [line([unit("君", 4000), unit("と", 4500)], 5000)], {
    color: "#d6457f",
  });
  const bg = part("和声", [line([unit("あ", 2200)], 2800)], {
    background: true,
    color: "#2f9c5a",
  });
  return {
    version: 2,
    name: "duet",
    metadata: { ti: "Duet" },
    audio: null,
    parts: [a, b, bg],
    mainPartId: a.id,
    activePartId: a.id,
    stage: 1,
    unlockedStage: 3,
    activeLineId: first.id,
    playheadMs: 0,
    translationLang: "en",
    romanLang: "",
  };
}

test("TTML exports every part and imports back into parts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "duet.mako.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project())),
    });
  await expect(page.locator(".prepare-view")).toBeVisible();

  await exportAs(page, "TTML");
  const dialog = page.getByRole("dialog", { name: "导出 TTML" });
  await expect(dialog.locator(".export-parts li")).toHaveCount(3);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 TTML" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("duet.ttml");
  const fs = await import("node:fs/promises");
  const ttml = await fs.readFile((await file.path())!, "utf8");
  expect(ttml).toContain('ttm:agent="v2"');
  expect(ttml).toContain('ttm:role="x-bg"');
  expect(ttml).toContain('tts:ruby="text" begin="1.500"');
  expect(ttml).toContain('xml:lang="en"');
  await expect(page.getByRole("status")).toContainText("包含 3 个声部");

  // A fresh import of the file gives the same parts back.
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.locator('input[type=file][accept^=".lrc"]').setInputFiles({
    name: "duet.ttml",
    mimeType: "application/ttml+xml",
    buffer: Buffer.from(ttml),
  });
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await expect(page.getByRole("status")).toContainText(
    "已导入 TTML：3 个声部（A、B、和声）",
  );
  await expect(page.locator(".part-list li")).toHaveCount(3);
  await page.locator("mdui-segmented-button", { hasText: "注音" }).click();
  await expect(page.locator(".ruby-unit rt").first()).toHaveText("せん");
  await page.locator("mdui-segmented-button", { hasText: "翻译" }).click();
  await expect(page.getByLabel("第 1 行翻译")).toHaveValue("pointless");
});

test("an unfinished part blocks TTML export and shows where", async ({
  page,
}) => {
  const data = project();
  (data.parts[1].lines[0] as { endMs: number | null }).endMs = null;
  await page.goto("/");
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "duet.mako.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await exportAs(page, "TTML");
  await page
    .getByRole("dialog", { name: "导出 TTML" })
    .getByRole("button", { name: "导出 TTML" })
    .click();
  await expect(page.getByRole("alert")).toContainText("声部「B」尚未记录收尾");
  await expect(
    page.getByRole("button", { name: /^当前声部：B/ }),
  ).toBeVisible();
});

test("a project file picked as lyrics restores the whole project", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type=file][accept^=".lrc"]').setInputFiles({
    name: "duet.mako.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project())),
  });
  await expect(page.locator(".prepare-view")).toBeVisible();
  await expect(page.locator(".part-list li")).toHaveCount(3);
});
