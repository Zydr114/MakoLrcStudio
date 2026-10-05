import { test, expect, type Page } from "@playwright/test";
import { audio } from "./fixtures";
import { choose, setChecked } from "./controls";

async function workspace(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill("[00:01]<00:01>今<00:02>日<00:03>も\n[00:06]次");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();
}

test("mdui menus and sliders keep native keyboard actions isolated from recording", async ({
  page,
}) => {
  await workspace(page);
  await expect(page.locator("mdui-tabs > mdui-tab")).toHaveCount(3);
  const speed = page.getByRole("combobox", { name: "播放速度", exact: true });
  await speed.focus();
  await speed.press("Enter");
  await expect(speed).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("mdui-menu-item[value=\"1\"]")).toBeFocused();
  await page.waitForTimeout(200);
  // mdui keeps focus on the selected item; move through the real menu with ArrowDown.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await expect(speed).toHaveValue("0.5×");
  await expect(page.locator(".state-label")).toHaveText("准备");
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  const progress = page.getByLabel("音频位置", { exact: true });
  await expect(progress).toBeVisible();
  expect((await progress.boundingBox())?.width ?? 0).toBeGreaterThan(180);
  for (const name of ["试听本行", "试听选中", "试听边界"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
  await progress.fill("1900");
  const volume = page.getByRole("slider", { name: "音量", exact: true });
  await volume.focus();
  await volume.press("ArrowLeft");
  await expect(volume).toHaveValue("0.79");
  await expect(progress).toHaveValue("1900");
  await setChecked(page, "循环试听");
  await expect(page.getByRole("switch", { name: "循环试听" })).toBeChecked();
  await choose(page, "预览方式", "true");
  await expect(page.getByRole("combobox", { name: "预览方式" })).toHaveValue(
    "区间填色（均匀）",
  );
  await expect(
    page.getByRole("slider", { name: "日时间边界" }),
  ).toHaveAttribute("aria-valuenow", "2000");
});
