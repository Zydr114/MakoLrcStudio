<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  music:
    "M9 18V5l12-2v13M9 8l12-2M9 18c0 1.7-1.8 3-4 3s-4-1.3-4-3 1.8-3 4-3 4 1.3 4 3Zm12-2c0 1.7-1.8 3-4 3s-4-1.3-4-3 1.8-3 4-3 4 1.3 4 3Z",
  upload: "M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8",
  check: "m5 12 4 4L19 6",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  play: "m8 4 12 8-12 8V4Z",
  pause: "M8 4v16M16 4v16",
  undo: "M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14",
  redo: "m16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14",
  download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
  close: "m6 6 12 12M6 18 18 6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  split: "M4 7h5m6 0h5M4 17h5m6 0h5M12 2v20",
  merge: "M3 7h6l3 5 3-5h6M3 17h6l3-5 3 5h6",
  repeat: "M4 8h14l-3-3m3 3-3 3M20 16H6l3 3m-3-3 3-3",
  zoom: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM6 10h8m-4-4v8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Z",
  back: "M19 12H5m6-6-6 6 6 6",
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.file" />
  </svg>
</template>
