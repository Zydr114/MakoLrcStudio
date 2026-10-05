<script setup lang="ts">
import Icon from "./Icon.vue";
withDefaults(
  defineProps<{
    variant?: "filled" | "tonal" | "outlined" | "text";
    icon?: string;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: "outlined", disabled: false, loading: false },
);
</script>
<template>
  <mdui-button :variant="variant" :disabled="disabled" :loading="loading"
    ><Icon v-if="icon" slot="icon" :name="icon" /><slot
  /></mdui-button>
</template>
