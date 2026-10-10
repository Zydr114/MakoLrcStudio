import { setChecked } from "./controls";
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

test("the line end handle belongs to the current line and stops at the next line start", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill("[00:01]今日\n[00:06]次\n[00:09]も\nまだ");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  // Only the current line exposes an end handle; its implicit end is a reference.
  await expect(page.locator(".time-marker.ending")).toHaveCount(1);
  await expect(page.locator(".time-marker.ending")).toHaveAttribute(
    "aria-valuenow",
    "6000",
  );
  await expect(
    page.getByRole("slider", { name: "参考收尾时间边界", exact: true }),
  ).toHaveCount(1);
  const end = page.getByLabel("本句终点");
  await expect(end).toHaveValue("");
  await expect(page.getByText("参考范围")).toHaveCount(1);
  await end.fill("00:04.500");
  await end.press("Enter");
  await expect(end).toHaveValue("00:04.500");
  await expect(page.getByText("参考范围")).toHaveCount(0);
  await expect(page.locator(".time-marker.ending")).toHaveAttribute(
    "aria-valuenow",
    "4500",
  );
  await expect(page.locator(".timing-region.confirmed")).toHaveCount(1);
  // Zoom out so the handle has room to travel inside the viewport, then drag it
  // past the next line start: it stops there instead of overlapping.
  await page.getByLabel("波形缩放").fill("100");
  const marker = page.locator(".time-marker.ending"),
    box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 300, box.y + 45);
  await page.mouse.up();
  await expect(marker).toHaveAttribute("aria-valuenow", "6000");
  await expect(page.locator(".timing-region.conflict")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(marker).toHaveAttribute("aria-valuenow", "4500");
  // Selecting another line moves the handle with the selection.
  await page.locator(".lyric-nav-list button").nth(1).click();
  await expect(page.locator(".time-marker.ending")).toHaveCount(1);
  await expect(page.locator(".time-marker.ending")).toHaveAttribute(
    "aria-valuenow",
    "9000",
  );
  // A line without a start has no end: the field is disabled and no handle exists.
  await page.locator(".lyric-nav-list button").nth(3).click();
  await expect(page.getByLabel("本句终点")).toBeDisabled();
  await expect(page.locator(".time-marker.ending")).toHaveCount(0);
});

async function completeWordWorkspace(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByLabel("粘贴歌词")
    .fill("[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]次");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await page.locator(".lyric-nav-list button").first().click();
}

test("live preview follows shared boundary drafts and audition selection keeps playing", async ({
  page,
}) => {
  await completeWordWorkspace(page);
  await page.getByLabel("音频位置", { exact: true }).fill("1900");
  await expect(page.locator(".preview-token.playing")).toHaveText("今");
  const marker = page.getByRole("slider", { name: "日时间边界" }),
    box = (await marker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + 20);
  await expect(page.locator(".preview-token.playing")).toHaveText("日");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".preview-token.playing")).toHaveText("今");
  await expect(marker).toHaveAttribute("aria-valuenow", "2000");
  await page.getByRole("button", { name: "试听本行", exact: true }).click();
  await page.locator(".unit-strip button").nth(1).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  const input = page.getByRole("textbox", { name: "「日」起点" });
  await input.fill("00:01.800");
  await expect(marker).toHaveAttribute("aria-valuenow", "1800");
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await input.press("Escape");
  await expect(marker).toHaveAttribute("aria-valuenow", "2000");
  await page.getByRole("button", { name: "试听边界", exact: true }).click();
  await setChecked(page, "循环试听");
  await page.waitForTimeout(1250);
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
});

test("inline segmentation supports merge, split, dragging and local fill without losing later timestamps", async ({
  page,
}) => {
  await completeWordWorkspace(page);
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  await page.getByRole("slider", { name: "文字分隔线 1", exact: true }).focus();
  await page.keyboard.press("Delete");
  await expect(
    page.getByText("3 → 2 · 保留 2 点", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "应用切分", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(2);
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  await page
    .getByRole("button", { name: "在第 1 个字符后切分", exact: true })
    .click();
  await page.getByRole("button", { name: "应用切分", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(3);
  await expect(page.locator(".target-text")).toHaveText("日");
  await expect(page.getByRole("textbox", { name: "「日」起点" })).toHaveValue(
    "",
  );
  await page.getByRole("textbox", { name: "「日」起点" }).fill("00:02.200");
  await page.getByRole("textbox", { name: "「日」起点" }).press("Enter");
  await expect(
    page.getByRole("slider", { name: "も时间边界" }),
  ).toHaveAttribute("aria-valuenow", "3000");
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  const divider = page.getByRole("slider", {
    name: "文字分隔线 1",
    exact: true,
  });
  const box = (await divider.boundingBox())!,
    destination = (await page.locator('[data-gap-offset="2"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + 20,
  );
  await page.mouse.up();
  // A divider cannot cross the adjacent one. Removing the second creates room.
  await page.getByRole("slider", { name: "文字分隔线 2", exact: true }).focus();
  await page.keyboard.press("Delete");
  const movable = page.getByRole("slider", {
    name: "文字分隔线 1",
    exact: true,
  });
  const movableBox = (await movable.boundingBox())!;
  await page.mouse.move(movableBox.x + movableBox.width / 2, movableBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + 20,
  );
  await page.mouse.up();
  await expect(
    page.getByRole("slider", { name: "文字分隔线 2", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("slider", { name: "文字分隔线 2", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "取消切分", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(3);
  await expect(
    page.getByRole("slider", { name: "日时间边界" }),
  ).toHaveAttribute("aria-valuenow", "2200");
});
