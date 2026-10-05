<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { AudioTransport } from './audio/transport';
const transport = new AudioTransport();
const name = ref('');
const message = ref('导入音频以验证播放');
async function load(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try { const asset = await transport.load(file); name.value = asset.info.name; message.value = '音频已准备'; }
  catch (error) { message.value = String(error); }
}
onUnmounted(() => transport.dispose());
</script>
<template><main><h1>Mako LRC</h1><input type="file" accept="audio/*" @change="load"/><p>{{ name }} · {{ message }}</p><mdui-button @click="transport.play()">播放</mdui-button><mdui-button @click="transport.pause()">暂停</mdui-button></main></template>
