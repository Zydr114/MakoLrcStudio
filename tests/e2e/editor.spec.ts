import { choose, setChecked } from "./controls";
import { test, expect, type Page } from "@playwright/test";

import { audio, wav } from "./fixtures";
async function importProject(page: Page, text: string) {
  await page.goto("/");
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await expect(page.getByText("音频已准备", { exact: true })).toBeVisible();
  await page.getByLabel("粘贴歌词").fill(text);
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
}
async function wordStage(
  page: Page,
  text = "[00:01]今日も\n[00:06]hello world",
) {
  await importProject(page, text);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  if (text.includes("<"))
    await expect(page.locator(".state-label")).toHaveText("本行完成");
  else await expect(page.locator(".target-text")).toHaveText("今");
}

test("complete workflow: clean text, record lines, undo, precise words, independent export and recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await importProject(page, "  今日も（きょう）\n\nhello world\n作词：某人");
  await setChecked(page, "选择第 4 行");
  await page.getByRole("button", { name: "删除 1" }).click();
  await setChecked(page, "删除括号里的内容");
  await page.getByRole("button", { name: "预览整理结果" }).click();
  await page.getByRole("button", { name: "应用整理" }).click();
  await expect(page.getByLabel("第 1 行歌词")).toHaveValue("今日も");
  await expect(page.locator(".text-row")).toHaveCount(2);
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByLabel("本句起点").fill("00:01.000");
  await page.getByLabel("本句起点").press("Enter");
  await page.locator(".lyric-nav-list button").nth(1).click();
  await page.getByLabel("本句起点").fill("00:06.000");
  await page.getByLabel("本句起点").press("Enter");
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await page.locator(".lyric-nav-list button").first().click();
  for (const [index, time] of [
    "00:01.000",
    "00:01.500",
    "00:02.000",
  ].entries()) {
    await page.locator(".unit-strip button").nth(index).click();
    await page.getByRole("textbox", { name: /起点/ }).fill(time);
    await page.getByRole("textbox", { name: /起点/ }).press("Enter");
  }
  await page.getByLabel("本句收尾").fill("00:03.000");
  await page.getByLabel("本句收尾").press("Enter");
  await expect(page.locator(".state-label")).toHaveText("本行完成");
  // The record buttons stay inside the visible timing workspace.
  const button = await page
      .getByRole("button", { name: "下一句", exact: true })
      .boundingBox(),
    workspace = await page.locator("[data-workspace]").boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(
    workspace!.y + workspace!.height,
  );
  await page.getByRole("button", { name: "下一句", exact: true }).click();
  for (const [index, time] of ["00:06.000", "00:07.000"].entries()) {
    await page.locator(".unit-strip button").nth(index).click();
    await page.getByRole("textbox", { name: /起点/ }).fill(time);
    await page.getByRole("textbox", { name: /起点/ }).press("Enter");
  }
  await page.getByLabel("本句收尾").fill("00:08.000");
  await page.getByLabel("本句收尾").press("Enter");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 LRC" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const result = await fs.readFile((await file.path())!, "utf8");
  expect(result).toContain(
    "[00:01.000]<00:01.000>今<00:01.500>日<00:02.000>も<00:03.000>",
  );
  expect(result).toContain("hello <00:07.000>world<00:08.000>");
  const { parseEnhanced, LineType } = await import("clrc");
  expect(
    parseEnhanced(result).filter((l) => l.type === LineType.ENHANCED_LYRIC),
  ).toHaveLength(2);
  await expect(page.locator(".save-status")).toHaveText("草稿已保存在本机");
  await page.reload();
  await expect(page.getByText("重新选择原音频", { exact: true })).toBeVisible();
  await page
    .locator('input[type=file][accept^="audio"]')
    .setInputFiles({ ...audio, name: "wrong.wav", buffer: wav(10) });
  await expect(page.getByRole("alert")).toContainText("与草稿不一致");
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await expect(page.locator(".state-label")).toHaveText("本行完成");
  expect(errors).toEqual([]);
});

test("Enter plays, repeated keys and IME do not double mark, Backspace pauses and resume does not mark", async ({
  page,
}) => {
  await wordStage(page);
  await page.locator("[data-workspace]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".state-label")).toContainText("正在记录");
  await page.waitForTimeout(300);
  await page.keyboard.down("Enter");
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.keyboard.down("Enter");
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.keyboard.up("Enter");
  await page.locator("[data-workspace]").dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".target-text")).toHaveText("今");
  await expect(page.locator(".state-label")).toContainText("已暂停");
  await page.keyboard.press("Enter");
  await expect(page.locator(".target-text")).toHaveText("今");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.keyboard.press("Escape");
  await expect(page.locator(".state-label")).toContainText("已暂停");
});

test("dragging shared boundaries, marker keys, invalid fields, Japanese grouping and local retime", async ({
  page,
}) => {
  await wordStage(
    page,
    "[00:01]<00:01>今<00:02>日<00:03>も<00:04>\n[00:06]next",
  );
  await page.locator(".lyric-nav-list button").first().click();
  await expect(page.locator(".state-label")).toHaveText("本行完成");
  const marker = page.getByRole("slider", { name: "日时间边界" });
  const before = Number(await marker.getAttribute("aria-valuenow"));
  const box = await marker.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 15);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 20, box!.y + 15);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await marker.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
  const dragged = Number(await marker.getAttribute("aria-valuenow"));
  await marker.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(marker).toHaveAttribute("aria-valuenow", String(dragged + 1));
  await page.getByRole("textbox", { name: /起点/ }).fill("00:00.100");
  await page.getByRole("textbox", { name: /起点/ }).press("Enter");
  await expect(page.getByRole("textbox", { name: /起点/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  await page.getByRole("slider", { name: "文字分隔线 1", exact: true }).focus();
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "应用切分", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(2);
  await page.getByRole("button", { name: "调整切分", exact: true }).click();
  await page
    .getByRole("button", { name: "在第 1 个字符后切分", exact: true })
    .click();
  await page.getByRole("button", { name: "应用切分", exact: true }).click();
  await expect(page.locator(".unit-strip button")).toHaveCount(3);
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.getByRole("button", { name: "从选中单位重打" }).click();
  await expect(page.locator("[data-workspace]")).toBeFocused();
  await expect(page.locator(".target-text")).toHaveText("日");
  await expect(
    page.getByRole("slider", { name: "今时间边界" }),
  ).toHaveAttribute("aria-valuenow", "1000");
  await page.screenshot({ path: "test-results/timing-desktop.png" });
});

test("backup restore, input Enter isolation, dark theme and Shift-JIS preview", async ({
  page,
}) => {
  await importProject(page, "[00:01]今");
  await page.getByLabel("第 1 行歌词").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".prepare-view")).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await choose(page, "主题", "dark");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass(/mdui-theme-dark/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份", exact: true }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const backup = await fs.readFile((await file.path())!);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "新建空白项目" }).click();
  await page.getByRole("button", { name: "新建空白项目", exact: true }).click();
  await expect(page.locator(".import-view")).toBeVisible();
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: backup,
    });
  await expect(page.locator(".prepare-view")).toBeVisible();
  await expect(page.getByLabel("第 1 行歌词")).toHaveValue("今");
  await page.getByRole("button", { name: "导入", exact: true }).click();
  await page.locator('input[type=file][accept^=".lrc"]').setInputFiles({
    name: "japanese.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0x82, 0xa0, 0x82, 0xa2]),
  });
  await choose(page, "编码", "shift_jis");
  await expect(page.getByLabel("粘贴歌词")).toHaveValue("あい");
});

test("half speed uses source time, record button returns keyboard focus, terminal pauses and next is manual", async ({
  page,
}) => {
  await wordStage(page);
  await choose(page, "播放速度", "0.5");
  await page.getByRole("button", { name: /^开始打轴/ }).click();
  await expect(page.locator("[data-workspace]")).toBeFocused();
  await expect(page.locator(".state-label")).toContainText("正在记录");
  await page.waitForTimeout(650);
  await page.keyboard.press("Enter");
  const ms = Number(
    await page
      .getByRole("slider", { name: "今时间边界" })
      .getAttribute("aria-valuenow"),
  );
  expect(ms).toBeGreaterThan(120);
  expect(ms).toBeLessThan(600);
  for (const target of ["も", "收尾", "完成"]) {
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    if (target === "完成")
      await expect(page.locator(".state-label")).toHaveText("本行完成");
    else await expect(page.locator(".target-text")).toHaveText(target);
  }
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.locator(".target-text")).toHaveText("收尾");
  await page.keyboard.press("Enter");
  await expect(page.locator(".target-text")).toHaveText("收尾");
  // Backspace rewinds one source second; at half speed we must listen past the last onset again.
  await page.waitForTimeout(1800);
  await page.keyboard.press("Enter");
  await expect(page.locator(".state-label")).toHaveText("本行完成");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".target-text")).toHaveText("hello");
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
});

test("continuous line recording advances, Backspace returns to previous line, final Enter stops", async ({
  page,
}) => {
  await importProject(page, "今\n日");
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  await page.keyboard.press("Enter");
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".target-text")).toHaveText("今");
  await expect(page.getByLabel("本句起点")).toHaveValue("");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await expect(page.locator(".target-text")).toHaveText("日");
  await page.waitForTimeout(350);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await expect(page.locator(".unit-strip")).toBeVisible();
});

test("production files work from a subdirectory with no external requests or route fallback", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4184/")) external.push(r.url());
  });
  await page.goto("http://127.0.0.1:4184/mako/");
  await expect(page.getByRole("heading", { name: "导入歌词" })).toBeVisible();
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(audio);
  await expect(page.getByText("音频已准备", { exact: true })).toBeVisible();
  await page.getByLabel("粘贴歌词").fill("[00:01]こんにちは");
  await page.getByRole("button", { name: "下一步，整理歌词" }).click();
  await expect(page.locator(".prepare-view")).toBeVisible();
  await page.reload();
  await expect(page.locator(".prepare-view")).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("storage failure is visible and a backup is still downloadable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("Storage unavailable");
      },
    }),
  );
  await importProject(page, "[00:01]今");
  await expect(page.locator(".save-status")).toHaveText(
    "本机保存失败，请下载备份",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.mako\.json$/);
});

test("conflicting imported word times remain editable and cannot masquerade as a complete line", async ({
  page,
}) => {
  await importProject(page, "[00:01]<00:01>今<00:00.500>日<00:02>\n[00:06]次");
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await expect(page.locator(".target-text")).toHaveText("待调整");
  await expect(page.locator(".conflict-note")).toContainText("冲突");
  await page.locator(".unit-strip button").nth(1).click();
  await page.getByRole("textbox", { name: /起点/ }).fill("00:01.500");
  await page.getByRole("textbox", { name: /起点/ }).press("Enter");
  await expect(page.locator(".state-label")).toHaveText("本行完成");
  await expect(page.locator(".conflict-note")).toHaveCount(0);
});

test("block drag clamps the entire finished sentence and undo restores its relative times", async ({
  page,
}) => {
  await importProject(page, "[00:01]<00:01>今<00:02>日<00:04>\n[00:06]次");
  await page.getByRole("button", { name: "确认文本，开始逐行打轴" }).click();
  // The start handle only trims the line start, so it stops before the next unit.
  const marker = page.getByRole("slider", { name: "1时间边界" });
  await expect(marker).toHaveAttribute("aria-valuemax", "1999");
  // The middle of the block translates the whole sentence, clamped by the next line.
  await page.getByLabel("波形缩放").fill("100");
  const region = page.locator(".timing-region").first(),
    box = (await region.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 300, box.y + box.height / 2);
  await page.mouse.up();
  await expect(marker).toHaveAttribute("aria-valuenow", "3000");
  await page.locator("[data-workspace]").focus();
  await page.keyboard.press("Control+z");
  await expect(marker).toHaveAttribute("aria-valuenow", "1000");
  await page.getByRole("button", { name: "进入逐字", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "日时间边界" }),
  ).toHaveAttribute("aria-valuenow", "2000");
  await expect(
    page.getByRole("slider", { name: "收尾时间边界" }),
  ).toHaveAttribute("aria-valuenow", "4000");
});
