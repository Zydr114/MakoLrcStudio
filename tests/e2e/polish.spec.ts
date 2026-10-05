import { test, expect, type Page } from "@playwright/test";
import { audio } from "./fixtures";

async function workspace(page: Page, text: string) {
  await page.goto("/");
  await page.getByLabel("粘贴歌词").fill(text);
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
}
const complete =
  "[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]<00:06>hello <00:07>world<00:08>";

test("whole-song preview shares timing, handles gaps and preserves the editing selection", async ({
  page,
}) => {
  await workspace(page, complete);
  await page.locator(".unit-strip button").nth(1).click();
  await page.getByRole("button", { name: "试听整曲", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "整曲试听", exact: true });
  await expect(dialog.getByRole("button", { name: "暂停整曲" })).toBeVisible();
  await dialog.getByLabel("整曲试听位置").fill("1900");
  await expect(dialog.locator(".preview-token.playing")).toHaveText("今");
  await dialog.getByLabel("整曲试听位置").fill("2000");
  await expect(dialog.locator(".preview-token.playing")).toHaveText("日");
  await dialog.getByLabel("整曲试听位置").fill("4500");
  await expect(dialog.locator(".preview-token.playing")).toHaveCount(0);
  await dialog.getByLabel("整曲定位歌词").selectOption("1");
  await expect(dialog.locator(".preview-token.playing")).toHaveText("hello ");
  await dialog.getByLabel("整曲试听速度").selectOption("0.5");
  await dialog.getByRole("button", { name: "播放整曲", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "暂停整曲" })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator("[data-workspace]")).toBeFocused();
  await expect(page.locator(".unit-strip button.selected")).toHaveText("日");
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
});

test("dense regions keep proportional widths, remain selectable and align after zoom, pan and resize", async ({
  page,
}, testInfo) => {
  const chars = Array.from("春夏秋冬天地星月山川");
  const body = chars
    .map((char, i) => `<00:01.${String(i * 10).padStart(3, "0")}>${char}`)
    .join("");
  await workspace(page, `[00:01]${body}<00:01.100>\n[00:06]次`);
  await expect(page.locator(".timing-region")).toHaveCount(10);
  expect(await page.locator(".timing-region .region-text").count()).toBe(0);
  await page.locator(".unit-strip button").nth(7).click();
  const marker = page.getByRole("slider", { name: "月时间边界", exact: true });
  await marker.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(marker).toHaveAttribute("aria-valuenow", "1071");
  await page.getByLabel("波形缩放").fill("800");
  await page.getByLabel("波形视窗起点").fill("700");
  const region = page.locator('.timing-region[data-start="1071"]');
  async function aligned() {
    const [a, b] = await Promise.all([
      region.boundingBox(),
      marker.boundingBox(),
    ]);
    return Math.abs(a!.x - (b!.x + b!.width / 2));
  }
  await expect.poll(aligned).toBeLessThan(2);
  const handle = page.getByRole("button", { name: "调整波形高度" });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("波形缩放")).toHaveValue("800");
  await expect(page.getByLabel("波形视窗起点")).toHaveValue("700");
  await expect.poll(aligned).toBeLessThan(2);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(aligned).toBeLessThan(2);
  await expect(page.getByLabel("波形缩放")).toHaveValue("800");
  const width = (await region.boundingBox())!.width;
  expect(width).toBeGreaterThan(6);
  expect(width).toBeLessThan(9); // 9 ms x 800 px/sec, never widened for labels.
  await page.screenshot({ path: testInfo.outputPath("dense-light-1440.png") });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("dark");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass(/mdui-theme-dark/);
  await expect.poll(aligned).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("dense-dark-1440.png") });
});

test("IME confirmation in precise fields does not commit or mark, valid shared end commits once", async ({
  page,
}) => {
  await workspace(page, complete);
  await page.locator(".unit-strip button").first().click();
  const end = page.getByRole("textbox", { name: "「今」终点" });
  const next = page.getByRole("slider", { name: "日时间边界" });
  await end.fill("00:02.200");
  await end.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(end).toBeFocused();
  await expect(next).toHaveAttribute("aria-valuenow", "2200");
  await end.press("Escape");
  await expect(next).toHaveAttribute("aria-valuenow", "2000");
  await end.fill("00:02.200");
  await end.press("Tab");
  await expect(next).toHaveAttribute("aria-valuenow", "2200");
  await page.locator("[data-workspace]").focus();
  await page.keyboard.press("Control+z");
  await expect(next).toHaveAttribute("aria-valuenow", "2000");
  await expect(
    page.getByRole("slider", { name: "も时间边界" }),
  ).toHaveAttribute("aria-valuenow", "3000");
});

test("unknown successors have no invented regions or playback fill and long lines keep actions reachable", async ({
  page,
}, testInfo) => {
  await workspace(page, "[00:01]<00:01>今日も\n[00:06]次");
  await page.getByLabel("音频位置", { exact: true }).fill("1900");
  await expect(page.locator(".timing-region")).toHaveCount(0);
  await expect(page.locator(".preview-token.playing")).toHaveCount(0);
  await expect(page.locator(".lyric-preview")).toHaveAttribute(
    "data-sample-status",
    "unknown",
  );
  await page.getByRole("tab", { name: "文本处理", exact: true }).click();
  await page
    .getByLabel("第 1 行歌词")
    .fill("今日も君を待っている　".repeat(12));
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(120);
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  await expect(page.locator("[data-editing-text]")).toBeVisible();
  await page.getByRole("button", { name: "取消切分", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("dark");
  await page.keyboard.press("Escape");
  const [actions, workspaceBox] = await Promise.all([
    page.locator(".workspace-actions").boundingBox(),
    page.locator("[data-workspace]").boundingBox(),
  ]);
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(
    workspaceBox!.y + workspaceBox!.height,
  );
  await page.screenshot({
    path: testInfo.outputPath("long-line-dark-1280.png"),
  });
  // A word beyond the visible prefix must be revealed by actual playback sampling.
  for (const [index, time] of [
    [80, "00:02.000"],
    [81, "00:03.000"],
  ] as const) {
    await page.locator(".unit-strip button").nth(index).click();
    const start = page.getByRole("textbox", { name: /起点/ });
    await start.fill(time);
    await start.press("Enter");
  }
  // The missing first onset is explicit; synchronize it before this confirmed span can preview.
  await page.locator(".unit-strip button").first().click();
  const first = page.getByRole("textbox", { name: /起点/ });
  await first.fill("00:01.000");
  await first.press("Enter");
  await page.getByLabel("音频位置", { exact: true }).fill("2500");
  const preview = page.locator(".lyric-preview"),
    token = preview.locator(".preview-token.playing");
  await expect(token).toHaveCount(1);
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([
        preview.boundingBox(),
        token.boundingBox(),
      ]);
      return b!.y >= a!.y && b!.y + b!.height <= a!.y + a!.height;
    })
    .toBe(true);
});
