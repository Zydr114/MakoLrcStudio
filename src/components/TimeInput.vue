<script setup lang="ts">
import { ref, watch } from "vue";
import { formatTime, parseTime } from "../domain/model";
const props = defineProps<{
  value: number | null;
  label: string;
  commit: (ms: number) => boolean;
  disabled?: boolean;
}>();
const input = ref<HTMLInputElement>(),
  text = ref(props.value === null ? "" : formatTime(props.value)),
  error = ref("");
watch(
  () => props.value,
  (value) => {
    text.value = value === null ? "" : formatTime(value);
    error.value = "";
  },
);
function apply() {
  const ms = parseTime(text.value);
  if (ms === null) {
    error.value = "输入 mm:ss.SSS，例如 00:12.340";
    return false;
  }
  if (!props.commit(ms)) {
    error.value = "时间与相邻边界冲突";
    return false;
  }
  error.value = "";
  text.value = formatTime(ms);
  return true;
}
function enter() {
  if (apply()) {
    input.value?.blur();
    (input.value?.closest("[data-workspace]") as HTMLElement)?.focus();
  }
}
</script>
<template>
  <label class="time-input"
    ><span>{{ label }}</span
    ><input
      ref="input"
      v-model="text"
      :aria-label="label"
      :aria-invalid="!!error"
      :disabled="disabled"
      placeholder="mm:ss.SSS"
      spellcheck="false"
      inputmode="decimal"
      @change="apply"
      @keydown.enter.prevent.stop="enter"
    /><small v-if="error" class="field-error">{{ error }}</small></label
  >
</template>
