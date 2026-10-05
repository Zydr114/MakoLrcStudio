<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { Checkbox } from "mdui/components/checkbox.js";
import type { Switch } from "mdui/components/switch.js";
import { controlInput } from "./controlLabel";
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    label: string;
    switch?: boolean;
    showLabel?: boolean;
    disabled?: boolean;
  }>(),
  { switch: false, showLabel: true, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const control = ref<Checkbox | Switch>();
watchEffect(async () => {
  const element = control.value,
    label = props.label,
    isSwitch = props.switch;
  if (!element) return;
  const input = await controlInput(element);
  input?.setAttribute("aria-label", label);
  if (isSwitch) input?.setAttribute("role", "switch");
});
function update(event: Event) {
  const checked = (event.currentTarget as Checkbox | Switch).checked;
  if (checked !== props.modelValue) emit("update:modelValue", checked);
}
</script>
<template>
  <component
    :is="props.switch ? 'label' : 'div'"
    class="ui-toggle"
    :class="{ 'is-switch': props.switch }"
  >
    <component
      :is="props.switch ? 'mdui-switch' : 'mdui-checkbox'"
      ref="control"
      :checked="modelValue"
      :disabled="disabled"
      @change="update"
    >
      <template v-if="!props.switch && showLabel">{{ label }}</template>
    </component>
    <span
      v-if="props.switch && showLabel"
      @click="emit('update:modelValue', !modelValue)"
      >{{ label }}</span
    >
  </component>
</template>
<style scoped>
.ui-toggle {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  font-size: 14px;
}
.is-switch {
  gap: 10px;
}
.ui-toggle mdui-checkbox {
  --mdui-typescale-body-large-size: 14px;
}
</style>
