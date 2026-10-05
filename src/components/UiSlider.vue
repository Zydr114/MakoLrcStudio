<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { Slider } from "mdui/components/slider.js";
import { controlInput } from "./controlLabel";
const props = withDefaults(
  defineProps<{
    modelValue: number;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    formatter?: (value: number) => string;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const control = ref<Slider>();
watchEffect(async () => {
  const element = control.value,
    label = props.label;
  if (!element) return;
  (await controlInput(element))?.setAttribute("aria-label", label);
});
function update(event: Event) {
  emit("update:modelValue", (event.currentTarget as Slider).value);
}
</script>
<template>
  <mdui-slider
    ref="control"
    class="ui-slider"
    :value="modelValue"
    :min="min"
    :max="Math.max(min + step, max)"
    :step="step"
    :disabled="disabled"
    :label-formatter="formatter ?? ((value: number) => String(value))"
    @input="update"
  />
</template>
<style scoped>
.ui-slider {
  min-width: 64px;
  height: 36px;
}
</style>
