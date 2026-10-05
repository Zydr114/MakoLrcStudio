<script setup lang="ts">
import { ref, watch } from "vue";
import { formatTime, parseTime } from "../domain/model";
const props = defineProps<{
  value: number | null;
  label: string;
  commit: (ms: number) => boolean;
  preview?: (ms: number) => boolean;
  cancel?: () => void;
  disabled?: boolean;
}>();
const input = ref<HTMLInputElement>(),
  text = ref(props.value === null ? "" : formatTime(props.value)),
  error = ref(""),
  dirty = ref(false);
function reset() {
  props.cancel?.();
  text.value = props.value === null ? "" : formatTime(props.value);
  error.value = "";
  dirty.value = false;
}
watch(
  () => [props.value, props.label],
  () => {
    text.value = props.value === null ? "" : formatTime(props.value);
    error.value = "";
    dirty.value = false;
  },
);
function preview() {
  dirty.value = true;
  const ms = parseTime(text.value);
  if (ms === null) props.cancel?.();
  else props.preview?.(ms);
}
function apply() {
  if (!dirty.value) return true;
  const ms = parseTime(text.value);
  if (ms === null) {
    props.cancel?.();
    error.value = "输入 mm:ss.SSS";
    return false;
  }
  if (!props.commit(ms)) {
    props.cancel?.();
    error.value = "时间与相邻边界冲突";
    return false;
  }
  error.value = "";
  text.value = formatTime(ms);
  dirty.value = false;
  return true;
}
function key(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    reset();
    input.value?.blur();
    input.value?.closest<HTMLElement>("[data-workspace]")?.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    if (apply()) {
      input.value?.blur();
      input.value?.closest<HTMLElement>("[data-workspace]")?.focus();
    }
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
      @input="preview"
      @blur="apply"
      @keydown="key"
    /><small v-if="error" class="field-error">{{ error }}</small></label
  >
</template>
