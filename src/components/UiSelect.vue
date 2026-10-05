<script setup lang="ts" generic="T extends string | number | boolean">
import { ref, watchEffect, useId } from "vue";
import type { Select } from "mdui/components/select.js";
import { controlInput } from "./controlLabel";
const props = withDefaults(
  defineProps<{
    modelValue: T;
    label: string;
    options: readonly { value: T; label: string; disabled?: boolean }[];
    compact?: boolean;
    disabled?: boolean;
  }>(),
  { compact: false, disabled: false },
);
const emit = defineEmits<{
  "update:modelValue": [value: T];
  change: [value: T];
}>();
const control = ref<Select>();
const expanded = ref(false);
const menuId = useId();
watchEffect(async () => {
  const element = control.value,
    label = props.label,
    open = expanded.value;
  if (!element) return;
  const input = await controlInput(element);
  input?.setAttribute("aria-label", label);
  input?.setAttribute("role", "combobox");
  input?.setAttribute("aria-haspopup", "listbox");
  input?.setAttribute("aria-expanded", String(open));
  input?.setAttribute("aria-controls", menuId);
  const menu = element.shadowRoot?.querySelector("mdui-menu");
  menu?.setAttribute("id", menuId);
  menu?.setAttribute("role", "listbox");
  menu?.setAttribute("aria-label", label);
});
function change(event: Event) {
  const value = (event.currentTarget as Select).value;
  const option = props.options.find((item) => String(item.value) === value);
  // mdui also emits when its menu receives a programmatic value update.
  if (!option || option.disabled || Object.is(option.value, props.modelValue))
    return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
}
</script>
<template>
  <mdui-select
    ref="control"
    class="ui-select"
    :class="{ compact }"
    variant="outlined"
    :label="compact ? undefined : label"
    :title="compact ? label : undefined"
    :value="String(modelValue)"
    :disabled="disabled"
    @change="change"
    @open="expanded = true"
    @close="expanded = false"
  >
    <mdui-menu-item
      v-for="option in options"
      :key="String(option.value)"
      :value="String(option.value)"
      :disabled="option.disabled"
      role="option"
      :aria-selected="Object.is(option.value, modelValue)"
      >{{ option.label }}</mdui-menu-item
    >
  </mdui-select>
</template>
<style scoped>
.ui-select {
  min-width: 0;
  --shape-corner: 12px;
}
.compact {
  width: 132px;
}
.compact::part(text-field__container) {
  min-height: 40px;
  height: 40px;
}
.compact::part(text-field__input) {
  padding: 8px 12px;
  font-size: 14px;
}
.compact::part(text-field__end-icon) {
  padding-right: 8px;
}
</style>
