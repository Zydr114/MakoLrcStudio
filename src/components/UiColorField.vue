<script setup lang="ts">
import { computed } from "vue";
import UiField from "./UiField.vue";
const props = defineProps<{ modelValue: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const valid = computed(() => /^#[0-9a-f]{6}$/i.test(props.modelValue));
</script>
<template>
  <div class="ui-color-field">
    <UiField
      :model-value="modelValue"
      :label="label"
      placeholder="#RRGGBB"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <span
      class="color-swatch"
      :class="{ invalid: !valid }"
      :style="valid ? { backgroundColor: modelValue } : undefined"
      aria-hidden="true"
    />
  </div>
</template>
<style scoped>
.ui-color-field {
  position: relative;
  min-width: 0;
}
.color-swatch {
  position: absolute;
  top: 50%;
  right: 14px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: 6px;
  transform: translateY(-50%);
  pointer-events: none;
}
.color-swatch.invalid {
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    var(--line) 4px,
    var(--line) 5px
  );
}
</style>
