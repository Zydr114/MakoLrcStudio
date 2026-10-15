export const playbackRates = [
  { value: 1, label: "1×" },
  { value: 0.75, label: "0.75×" },
  { value: 0.5, label: "0.5×" },
];
export const previewModes = [
  { value: false, label: "起点高亮" },
  { value: true, label: "区间填色（均匀）" },
];
export const extraModes = [
  { value: "none", label: "不显示翻译" },
  { value: "translation", label: "显示翻译" },
  { value: "roman", label: "显示罗马音" },
  { value: "both", label: "翻译和罗马音" },
] as const;
export const themes: { value: "auto" | "light" | "dark"; label: string }[] = [
  { value: "auto", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
