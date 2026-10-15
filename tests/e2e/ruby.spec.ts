import { test, expect, type Page } from "@playwright/test";
import { choose } from "./controls";

async function rubyView(page: Page, lyrics: string) {
  await page.goto("/");
  await page.getByLabel("粘贴歌词").fill(lyrics);
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator("mdui-segmented-button", { hasText: "注音" }).click();
  await expect(page.getByRole("note")).toContainText("请逐行核对");
}

test("manual ruby: group characters, type a reading, confirm-free and kept on text edits", async ({
  page,
}) => {
  await rubyView(page, "今日も君と");
  const units = page.locator(".ruby-unit");
  await units.nth(0).click();
  await units.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".ruby-actions")).toContainText("「今日」");
  await page.getByRole("button", { name: "添加读音" }).click();
  await page.getByRole("textbox", { name: "读音", exact: true }).fill("きょう");
  await page.getByRole("button", { name: "应用读音" }).click();
  await expect(units.first().locator("rt")).toHaveText("きょう");
  await expect(units.first().locator(".ruby-mora")).toHaveText(["きょ", "う"]);
  await expect(units).toHaveCount(4);
  // Back in the lyrics layer, editing other words keeps the typed reading.
  await page.locator("mdui-segmented-button", { hasText: "歌词" }).click();
  await page.getByLabel("第 1 行歌词").fill("今日は君と");
  await page.getByLabel("第 1 行歌词").blur();
  await page.locator("mdui-segmented-button", { hasText: "注音" }).click();
  await expect(units.first().locator("rt")).toHaveText("きょう");
  await expect(units.nth(1)).toHaveText("は");
});

test("automatic pinyin is marked for review and confirmed per line", async ({
  page,
}) => {
  await rubyView(page, "银行行长");
  await expect(page.getByRole("combobox", { name: "语言" })).toHaveValue(
    /中文/,
  );
  await page.getByRole("button", { name: "自动注音" }).click();
  await expect(page.locator(".ruby-unit.pending")).toHaveCount(4);
  await expect(page.locator(".ruby-unit rt")).toHaveText([
    "yín",
    "háng",
    "háng",
    "zhǎng",
  ]);
  await expect(page.getByRole("status")).toContainText("4 处待确认");
  await page.getByRole("button", { name: "确认本行（4）" }).click();
  await expect(page.locator(".ruby-unit.pending")).toHaveCount(0);
});

test("automatic Japanese ruby loads the bundled dictionary on demand", async ({
  page,
}) => {
  const dictionary: string[] = [];
  page.on("request", (request) => {
    if (/\.dat-.*\.gz$/.test(request.url())) dictionary.push(request.url());
  });
  await rubyView(page, "君と引き出す物語");
  expect(dictionary).toHaveLength(0);
  await choose(page, "语言", "ja");
  await page.getByRole("button", { name: "自动注音" }).click();
  await expect(page.locator(".ruby-unit rt").first()).toHaveText("きみ", {
    timeout: 30000,
  });
  await expect(page.locator(".ruby-unit rt")).toHaveText([
    "きみ",
    "ひ",
    "だ",
    "ものがたり",
  ]);
  expect(dictionary.length).toBeGreaterThan(0);
  expect(
    dictionary.every((url) => url.startsWith("http://127.0.0.1:4173/")),
  ).toBe(true);
});
