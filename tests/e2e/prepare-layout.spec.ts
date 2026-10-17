import { test, expect } from "@playwright/test";
import { setChecked } from "./controls";

test("the lyric list scrolls inside the sheet while add and delete stay visible", async ({
  page,
}) => {
  await page.goto("/");
  const lyrics = Array.from({ length: 40 }, (_, i) => `第${i + 1}行歌词`);
  await page.getByLabel("粘贴歌词").fill(lyrics.join("\n"));
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();

  const list = page.locator(".lyric-list");
  const sheet = page.locator(".lyric-sheet");
  const toolbar = page.locator(".sheet-toolbar");
  const add = page.getByRole("button", { name: /添加一行/ });
  await expect(list).toBeVisible();
  await expect(add).toBeVisible();

  const overflow = await list.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight + 100);

  const sheetBox = (await sheet.boundingBox())!;
  const addBox = (await add.boundingBox())!;
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(
    sheetBox.y + sheetBox.height + 1,
  );
  await expect(add).toBeInViewport();

  const main = page.locator(".app-main");
  const pageScrollBefore = await main.evaluate((element) => element.scrollTop);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByLabel("选择第 40 行")).toBeInViewport();
  expect(await main.evaluate((element) => element.scrollTop)).toBe(
    pageScrollBefore,
  );

  // The bulk action bar stays at the top of the sheet; no scrolling back needed.
  await expect(toolbar).toBeInViewport();
  await setChecked(page, "选择第 40 行");
  await page.getByRole("button", { name: "删除 1" }).click();
  await expect(page.locator(".text-row")).toHaveCount(39);
});
