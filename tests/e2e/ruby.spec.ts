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

test("typing a romaji reading offers one-click kana conversion", async ({
  page,
}) => {
  await rubyView(page, "今日も");
  await page.locator(".ruby-unit").first().click();
  await page.getByRole("button", { name: "添加读音" }).click();
  const reading = page.getByRole("textbox", { name: "读音", exact: true });
  await reading.fill("kyou");
  const convert = page.getByRole("button", { name: /罗马音.*假名/ });
  await expect(convert).toBeVisible();
  await convert.click();
  await expect(reading).toHaveValue("きょう");
  await page.getByRole("button", { name: "应用读音" }).click();
  await expect(page.locator(".ruby-unit").first().locator("rt")).toHaveText(
    "きょう",
  );
  await expect(
    page.locator(".ruby-unit").first().locator(".ruby-mora"),
  ).toHaveText(["きょ", "う"]);
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

test("automatic Japanese ruby splits word-level units for okurigana", async ({
  page,
}) => {
  await rubyView(
    page,
    "[00:00.00]<00:00.00>四角い<00:01.00>部屋<00:02.00>の<00:02.50>片隅<00:03.00> <00:03.20>覗く<00:04.00>合わせ<00:04.50>鏡<00:05.00>。",
  );
  await choose(page, "语言", "ja");
  await page.getByRole("button", { name: "自动注音" }).click();
  await expect(page.locator(".ruby-unit rt")).toHaveText(
    ["しかく", "へや", "かたすみ", "のぞ", "あ", "きょう"],
    { timeout: 30000 },
  );
  await expect(page.locator(".skip-report")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("6 处待确认");
});

test("automatic Japanese ruby annotates across times and asks for re-timing", async ({
  page,
}) => {
  await rubyView(
    page,
    "[00:00.00]四<00:00.10>角<00:00.20>い<00:00.30>部<00:00.40>屋<00:00.50>の<00:00.60>片<00:00.70>隅<00:00.80> <00:00.90>覗<00:01.00>く<00:01.10>合<00:01.20>わ<00:01.30>せ<00:01.40>鏡<00:01.50>。",
  );
  await choose(page, "语言", "ja");
  await page.getByRole("button", { name: "自动注音" }).click();
  await expect(page.locator(".ruby-unit rt")).toHaveText(
    ["しかく", "へや", "かたすみ", "のぞ", "あ", "きょう"],
    { timeout: 30000 },
  );
  await expect(page.locator(".skip-report")).toContainText(
    "合并了 3 处已有打点，需要重新打轴",
  );
  await expect(page.locator(".skip-report")).toContainText("第 1 行「四角」");
  await expect(page.locator(".skip-report")).toContainText("「部屋」");
  await expect(page.locator(".skip-report")).toContainText("「片隅」");
  await expect(page.getByRole("status")).toContainText("需要重新打轴");
});
