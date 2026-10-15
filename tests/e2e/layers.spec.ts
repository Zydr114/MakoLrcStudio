import { test, expect } from "@playwright/test";
import { audio } from "./fixtures";

test("translation and romanization layers: typing, pasting, generating from readings and word romaji", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill("[00:01]<00:01>我<00:02>们<00:03>\n[00:04]长大");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  const layer = (name: string) =>
    page.locator("mdui-segmented-button", { hasText: name }).click();

  // Translations: Enter moves to the next line, the language code is checked.
  await layer("翻译");
  await page.getByLabel("第 1 行翻译").fill("we");
  await page.getByLabel("第 1 行翻译").press("Enter");
  await expect(page.getByLabel("第 2 行翻译")).toBeFocused();
  await page.getByRole("textbox", { name: "翻译语言代码" }).fill("en");
  await page.getByRole("textbox", { name: "翻译语言代码" }).press("Enter");
  await page.getByRole("button", { name: "按行粘贴翻译…" }).click();
  await page
    .getByRole("textbox", { name: "粘贴翻译" })
    .fill("we\ngrow up\nextra");
  await page.getByRole("button", { name: "填入" }).click();
  await expect(page.getByLabel("第 2 行翻译")).toHaveValue("grow up");
  await expect(page.getByRole("status")).toContainText("多出的 1 行未使用");

  // Romanization comes from the readings.
  await layer("注音");
  await page.getByRole("button", { name: "自动注音" }).click();
  await expect(page.locator(".ruby-unit.pending")).toHaveCount(4);
  await layer("罗马音");
  await page.getByRole("button", { name: "从注音生成" }).click();
  await expect(page.getByLabel("第 1 行罗马音")).toHaveValue("wǒ men");
  await expect(page.getByLabel("第 2 行罗马音")).toHaveValue("zhǎng dà");
  await expect(
    page.getByRole("textbox", { name: "罗马音语言代码" }),
  ).toHaveValue("zh-Latn");
  await page.getByRole("button", { name: "确认" }).first().click();
  await expect(page.locator("textarea.pending")).toHaveCount(1);

  // The word timing view shows them and edits the word romanization.
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();
  await page.locator(".lyric-nav-list button").first().click();
  await expect(page.locator(".scroll-line.active .line-extra")).toHaveText(
    "we",
  );
  await expect(page.locator(".strip-roman")).toHaveText(["wǒ", "men"]);
  await page.locator(".unit-strip button").nth(1).click();
  await page.getByRole("button", { name: "罗马音", exact: true }).click();
  await page.getByRole("textbox", { name: "逐字罗马音" }).fill("mén");
  await page.getByRole("textbox", { name: "逐字罗马音" }).press("Enter");
  await expect(page.locator(".strip-roman")).toHaveText(["wǒ", "mén"]);
});
