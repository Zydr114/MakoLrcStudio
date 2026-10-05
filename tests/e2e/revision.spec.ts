import { test, expect, type Page } from "@playwright/test";
import { audio } from "./fixtures";
async function openProject(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill("[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]<00:06>次<00:07>");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
}

test("three editable tabs share the current line, permit return after text changes and retain unaffected times", async ({
  page,
}) => {
  await openProject(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();
  await page.locator(".lyric-nav-list button").nth(1).click();
  await page.getByLabel("音频位置", { exact: true }).fill("6300");
  await page.getByRole("tab", { name: "文本处理", exact: true }).click();
  await expect(page.locator(".text-row.active textarea")).toHaveValue("次");
  await page.getByLabel("第 2 行歌词").fill("次の歌");
  await page.getByRole("tab", { name: "逐行打轴", exact: true }).click();
  await expect(page.locator(".target-text")).toHaveText("次の歌");
  await expect(page.getByLabel("本句起点")).toHaveValue("00:06.000");
  await expect(page.getByLabel("音频位置", { exact: true })).toHaveValue(
    "6300",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "逐行打轴", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".target-text")).toHaveText("次");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.locator(".target-text")).toHaveText("次の歌");
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(3);
  await expect(
    page.getByRole("tab", { name: "逐字打轴", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator(".lyric-nav-list button").first().click();
  await expect(
    page.getByRole("slider", { name: "收尾时间边界" }),
  ).toHaveAttribute("aria-valuenow", "4000");
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "文本处理", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "逐行打轴", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".target-text")).toHaveText("今日も");
});
