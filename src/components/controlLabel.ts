type Control = {
  shadowRoot: ShadowRoot | null;
  updateComplete?: Promise<unknown>;
};

/** Name the actual focusable input in mdui's Shadow DOM, not a duplicate host role. */
export async function controlInput(control: Control) {
  await control.updateComplete;
  const field = control.shadowRoot?.querySelector("mdui-text-field") as
    (Element & Control) | null;
  if (field) await field.updateComplete;
  return (
    field?.shadowRoot ?? control.shadowRoot
  )?.querySelector<HTMLInputElement>(
    'input:not([type="hidden"]):not([type="radio"]), textarea, button',
  );
}
