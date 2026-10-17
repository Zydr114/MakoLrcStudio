import { expect, type Page } from "@playwright/test";

/** Open and pick a real mdui menu option; never fake its change handler. */
export async function choose(page: Page, label: string, value: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  const control = page.locator("mdui-select").filter({ has: input });
  await input.click();
  await control.locator(`mdui-menu-item[value="${value}"]`).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
}
/** Open a color trigger, type a hex value, and close the picker. */
export async function setColor(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).click();
  const panel = page.locator(".color-popover:visible");
  await panel.getByLabel(`${label} 十六进制值`, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "完成" }).click();
  await expect(panel).toBeHidden();
}
export async function setChecked(page: Page, label: string, checked = true) {
  const input = page.getByLabel(label, { exact: true });
  const control = page
    .locator("mdui-checkbox, mdui-switch")
    .filter({ has: input });
  if ((await input.isChecked()) !== checked) await control.click();
  await expect(input).toBeChecked({ checked });
}
/** The header export menu: pick a format from the real mdui menu. */
export async function exportAs(
  page: Page,
  format: "TTML" | "ASS" | "增强 LRC",
) {
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page
    .locator("mdui-menu-item", { hasText: format })
    .filter({ visible: true })
    .click();
}
