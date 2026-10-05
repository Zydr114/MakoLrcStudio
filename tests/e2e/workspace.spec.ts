import { test, expect } from "@playwright/test";
import { audio } from "./fixtures";

test("text-first preparation and explicitly armed line recording", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("粘贴歌词").fill("今\n日");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await expect(page.getByLabel("第 1 行歌词")).toHaveValue("今");
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await expect(page.getByRole("alert")).toContainText("音频");
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await expect(page.getByLabel("本句起点")).toHaveValue("");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("本句起点")).toHaveValue("");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await expect(page.locator(".lyric-nav-list button").first()).not.toHaveClass(
    /active/,
  );
  await expect(page.locator(".timing-region")).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.getByLabel("本句起点")).toHaveValue("");
});

test("line reference overlays and boundary cancellation preserve real endpoints", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("粘贴歌词").fill("[00:01]今日\n[00:06]次");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await expect(page.locator(".timing-region.reference")).toHaveCount(2);
  const marker = page.getByRole("slider", { name: "1时间边界" });
  const box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + 45);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(marker).toHaveAttribute("aria-valuenow", "1000");
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份", exact: true }).click();
  const fs = await import("node:fs/promises");
  const draft = JSON.parse(
    await fs.readFile((await (await backup).path())!, "utf8"),
  );
  expect(draft.lines[0].endMs).toBeNull();
});
