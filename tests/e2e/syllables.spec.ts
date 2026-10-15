import { test, expect } from "@playwright/test";
import { audio } from "./fixtures";
import { setChecked } from "./controls";

test("ruby syllables are timed one by one, pauses split a syllable from the next, and LRC keeps the base", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("粘贴歌词").fill("[00:01]詮な");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();

  // Give 詮 the reading せん: it divides by mora into two syllables.
  await page.locator(".unit-strip button").first().click();
  await page.getByRole("button", { name: "注音", exact: true }).click();
  await page.getByRole("textbox", { name: "读音", exact: true }).fill("せん");
  await expect(page.locator(".ruby-editor .text-gap.divided")).toHaveCount(1);
  await page.getByRole("button", { name: "应用读音" }).click();
  await expect(page.locator(".strip-syllable")).toHaveText(["せ", "ん"]);
  await expect(page.locator(".target-text")).toHaveText("詮・せ");
  await expect(page.locator(".lyric-preview rt").first()).toHaveText("せん");

  const start = page.getByRole("textbox", { name: /起点/ });
  for (const [select, time] of [
    [page.locator(".strip-syllable").nth(0), "00:01.000"],
    [page.locator(".strip-syllable").nth(1), "00:01.500"],
    [page.locator(".unit-strip button").nth(1), "00:02.000"],
  ] as const) {
    await select.click();
    await start.fill(time);
    await start.press("Enter");
  }
  await page.getByLabel("本句收尾").fill("00:03.000");
  await page.getByLabel("本句收尾").press("Enter");
  await expect(page.locator(".state-label")).toHaveText("本行完成");

  // A pause: せ ends at 1.3 s while ん still starts at 1.5 s.
  await page.locator(".strip-syllable").nth(0).click();
  await setChecked(page, "停顿");
  const end = page.getByLabel("「詮・せ」终点");
  await expect(end).toHaveValue("00:01.500");
  await end.fill("00:01.300");
  await end.press("Enter");
  await expect(page.locator(".time-marker.ending")).toHaveCount(2);
  await expect(page.locator(".strip-syllable.paused")).toHaveCount(1);
  await expect(page.locator(".state-label")).toHaveText("本行完成");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 LRC" }).click();
  const fs = await import("node:fs/promises");
  const lrc = await fs.readFile((await (await download).path())!, "utf8");
  expect(lrc).toBe("[00:01.000]<00:01.000>詮<00:02.000>な<00:03.000>\n");
  await expect(page.getByRole("status")).toContainText("注音、音节停顿");
});
