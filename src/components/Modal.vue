<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import Icon from "./Icon.vue";
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open) dialog.value?.showModal();
    else dialog.value?.close();
  },
);
onBeforeUnmount(() => dialog.value?.close());
</script>
<template>
  <dialog
    ref="dialog"
    class="modal"
    @cancel.prevent="emit('close')"
    @click="
      (event) => {
        if (event.target === dialog) emit('close');
      }
    "
  >
    <header>
      <h2>{{ title }}</h2>
      <button class="icon-button" aria-label="关闭" @click="emit('close')">
        <Icon name="close" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
