<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { ButtonIcon } from "mdui/components/button-icon.js";
import Icon from "./Icon.vue";
import { controlInput } from "./controlLabel";
const props = withDefaults(
  defineProps<{
    icon: string;
    label: string;
    disabled?: boolean;
    variant?: "standard" | "filled" | "tonal" | "outlined";
  }>(),
  { disabled: false, variant: "standard" },
);
const control = ref<ButtonIcon>();
watchEffect(async () => {
  const element = control.value,
    label = props.label;
  if (element) (await controlInput(element))?.setAttribute("aria-label", label);
});
</script>
<template>
  <mdui-button-icon
    ref="control"
    :variant="variant"
    :disabled="disabled"
    :title="label"
  >
    <Icon :name="icon" :size="20" />
  </mdui-button-icon>
</template>
