import { expect, type Page } from "@playwright/test";

/** Open and pick a real mdui menu option; never fake its change handler. */
export async function choose(page: Page, label: string, value: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  const control = page.locator("mdui-select").filter({ has: input });
  await input.click();
  await control.locator(`mdui-menu-item[value="${value}"]`).click();
  await expect(input).toHaveAttribute("aria-expanded", "false");
}
export async function setChecked(page: Page, label: string, checked = true) {
  const input = page.getByLabel(label, { exact: true });
  const control = page
    .locator("mdui-checkbox, mdui-switch")
    .filter({ has: input });
  if ((await input.isChecked()) !== checked) await control.click();
  await expect(input).toBeChecked({ checked });
}
