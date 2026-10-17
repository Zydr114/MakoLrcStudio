import { test, expect } from "@playwright/test";

test("the import lyric field keeps its height and scrolls long text inside", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.locator(".lyric-field");
  const card = page.locator(".lyrics-import");
  const main = page.locator(".app-main");
  const input = page.getByLabel("粘贴歌词");
  await expect(input).toBeVisible();
  const fieldBefore = await field.boundingBox();
  const cardBefore = await card.boundingBox();
  const mainScrollBefore = await main.evaluate(
    (element) => element.scrollHeight,
  );
  const text = Array.from(
    { length: 80 },
    (_, index) => `第 ${index + 1} 句歌词，用来检查导入容器的高度。`,
  ).join("\n");
  await input.fill(text);
  await expect(input).toHaveValue(text);
  const fieldAfter = await field.boundingBox();
  const cardAfter = await card.boundingBox();
  const mainScrollAfter = await main.evaluate(
    (element) => element.scrollHeight,
  );
  expect(Math.abs(fieldAfter!.height - fieldBefore!.height)).toBeLessThan(3);
  expect(Math.abs(cardAfter!.height - cardBefore!.height)).toBeLessThan(3);
  expect(mainScrollAfter - mainScrollBefore).toBeLessThan(4);
  const metrics = await input.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await input.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await input.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    0,
  );
});
