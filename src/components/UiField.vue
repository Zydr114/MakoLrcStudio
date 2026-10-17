<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { TextField } from "mdui/components/text-field.js";
import { controlInput } from "./controlLabel";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    /** Grow the textarea with its content. Disable to keep a fixed height and scroll inside. */
    autosize?: boolean;
    rows?: number;
    type?: "text" | "number";
    min?: number | string;
    max?: number | string;
    step?: number | string;
    ariaLabel?: string;
  }>(),
  { placeholder: "", multiline: false, autosize: true, rows: 3 },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const control = ref<TextField>();
// mdui's floating label is not tied to its input; name the input itself.
watchEffect(async () => {
  const element = control.value,
    label = props.ariaLabel || props.label;
  if (element) (await controlInput(element))?.setAttribute("aria-label", label);
});
function update(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>
<template>
  <mdui-text-field
    ref="control"
    variant="outlined"
    :type="type"
    :label="label"
    :value="modelValue"
    :placeholder="placeholder"
    :min="min"
    :max="max"
    :step="step"
    :autosize="multiline && autosize"
    :rows="multiline ? rows : undefined"
    @input="update"
  />
</template>
