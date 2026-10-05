<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import UiIconButton from "./UiIconButton.vue";
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: []; closed: [] }>();
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
    :aria-label="title"
    @cancel.prevent="emit('close')"
    @close="emit('closed')"
    @click="
      (event) => {
        if (event.target === dialog) emit('close');
      }
    "
  >
    <header>
      <h2>{{ title }}</h2>
      <UiIconButton icon="close" label="关闭" @click="emit('close')" />
    </header>
    <slot />
  </dialog>
</template>
