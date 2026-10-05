<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    rows?: number;
    type?: "text" | "number";
  }>(),
  { placeholder: "", multiline: false, rows: 3 },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
function update(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>
<template>
  <mdui-text-field
    variant="outlined"
    :type="type"
    :label="label"
    :value="modelValue"
    :placeholder="placeholder"
    :autosize="multiline"
    :rows="multiline ? rows : undefined"
    @input="update"
  />
</template>
