import { test, expect } from "@playwright/test";
import { audio } from "./fixtures";
import { setChecked } from "./controls";

test("vocal parts: create, move lines, switch globally, reference band, main-part LRC and duet preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill(
      "[00:01]<00:01>今<00:02>日<00:03>\n[00:04]<00:04>君<00:05>\n[00:06]<00:06>次<00:07>",
    );
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();

  // A new part starts empty and becomes the part being edited.
  await page.getByRole("button", { name: "＋ 新增" }).click();
  const create = page.getByRole("dialog", { name: "新增声部" });
  await create.getByLabel("名称").fill("B");
  await create.getByRole("button", { name: "新增声部" }).click();
  await expect(page.getByText("「B」还没有歌词行")).toBeVisible();
  await page.getByRole("button", { name: "切换到声部 主唱" }).click();
  await expect(page.locator(".text-row")).toHaveCount(3);

  // Move the second line to B: it keeps its timing.
  await setChecked(page, "选择第 2 行");
  const move = page
    .locator("mdui-dropdown")
    .filter({ has: page.getByRole("button", { name: "移到声部" }) });
  await move.getByRole("button", { name: "移到声部" }).click();
  await move.locator("mdui-menu-item", { hasText: "B" }).click();
  await expect(page.locator(".text-row")).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("已移动 1 行到「B」");

  // The switcher in the tab row reaches every part from every view.
  const trigger = page.getByRole("button", { name: /^当前声部：主唱/ });
  await trigger.click();
  await page.locator(".part-switcher mdui-menu-item", { hasText: "B" }).click();
  await expect(
    page.getByRole("button", { name: /^当前声部：B/ }),
  ).toBeVisible();
  await expect(page.getByLabel("第 1 行歌词")).toHaveValue("君");

  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("tab", { name: "逐行打轴", exact: true }).click();
  // The main part's lines show as a read-only reference while timing B.
  await page.getByLabel("波形缩放").fill("10");
  await expect(page.locator(".part-reference-block")).toHaveCount(2);
  await expect(page.locator(".lyric-nav-list button")).toHaveCount(1);

  // LRC is a compatibility export of the main part only.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 LRC" }).click();
  const fs = await import("node:fs/promises");
  const lrc = await fs.readFile((await (await download).path())!, "utf8");
  expect(lrc).toContain("今");
  expect(lrc).not.toContain("君");
  await expect(page.getByRole("status")).toContainText("只含主声部「主唱」");
  await expect(page.getByRole("status")).toContainText("其他 1 个声部");

  // The whole-song preview shows both parts, B on the other side.
  await page.getByRole("tab", { name: "逐字打轴", exact: true }).click();
  await page.getByRole("button", { name: "试听整曲", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "整曲试听", exact: true });
  await dialog.getByLabel("整曲试听位置").fill("4500");
  await expect(dialog.locator(".song-line.active")).toHaveClass(/right/);
  await expect(dialog.locator(".song-line.active .song-part")).toHaveText("B");
  await expect(dialog.locator(".preview-token.playing")).toHaveText("君");
});
