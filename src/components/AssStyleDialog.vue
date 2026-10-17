<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  assStyleRanges,
  defaultAssStyle,
  normalizeAssStyle,
  type AssLayout,
  type AssStyle,
} from "../domain/assStyle";
import Modal from "./Modal.vue";
import UiButton from "./UiButton.vue";
import UiColorField from "./UiColorField.vue";
import UiField from "./UiField.vue";
import UiToggle from "./UiToggle.vue";
const props = withDefaults(
  defineProps<{ open: boolean; style: AssStyle; partColor?: string }>(),
  { partColor: "#0b84d8" },
);
const emit = defineEmits<{ close: []; save: [style: AssStyle] }>();
const draft = ref<AssStyle>({ ...defaultAssStyle });
watch(
  () => props.open,
  (open) => {
    if (open) draft.value = normalizeAssStyle(props.style);
  },
);
const layouts: {
  value: AssLayout;
  title: string;
  hint: string;
  label: string;
}[] = [
  {
    value: "classic",
    title: "经典双行",
    hint: "按演唱者左右",
    label: "经典双行（按演唱者左右）",
  },
  {
    value: "diagonal",
    title: "对角双行",
    hint: "左上／右下轮换",
    label: "对角双行（左上／右下轮换）",
  },
  {
    value: "single",
    title: "单行居中",
    hint: "底部居中",
    label: "单行底部居中",
  },
];
const layout = computed(
  () => layouts.find((item) => item.value === draft.value.layout) ?? layouts[0],
);
const mainColor = computed(() =>
  draft.value.colorMode === "solid" ? draft.value.solidColor : props.partColor,
);
const rubyColor = computed(() => draft.value.rubyColor ?? mainColor.value);
const rubyFollow = computed(() => draft.value.rubyColor === null);
const previewStyle = computed<Record<string, string>>(() => ({
  "--main-color": mainColor.value,
  "--ruby-color": rubyColor.value,
  "--roman-color": draft.value.romanColor,
  "--unsung-color": draft.value.unsungColor,
  "--outline-color": draft.value.outlineColor,
  "--main-size": `${Math.max(20, Math.min(48, draft.value.mainSize * 0.5))}px`,
  "--ruby-size": `${Math.max(10, Math.min(24, draft.value.rubySize * 0.5))}px`,
  "--roman-size": `${Math.max(
    10,
    Math.min(22, draft.value.romanSize * 0.5),
  )}px`,
  "--outline-width": draft.value.outline
    ? `${Math.min(3.6, draft.value.outline * 0.35).toFixed(2)}px`
    : "0px",
  fontFamily: `"${draft.value.font.replace(/"/g, "")}", "Noto Sans CJK JP", "Noto Sans CJK SC", serif`,
}));
function reset() {
  draft.value = { ...defaultAssStyle };
}
function toggleRubyFollow(follow: boolean) {
  draft.value.rubyColor = follow ? null : "#ffffff";
}
function setNumber(
  key: "mainSize" | "rubySize" | "romanSize" | "outline",
  value: string,
) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) draft.value[key] = parsed;
}
function save() {
  emit("save", normalizeAssStyle(draft.value));
}
</script>
<template>
  <Modal wide :open="open" title="字幕样式" @close="emit('close')">
    <div class="style-workbench">
      <aside class="style-preview">
        <div class="preview-heading">
          <span>预览</span>
          <span class="preview-layout">{{ layout.title }}</span>
        </div>
        <div
          class="preview-stage"
          :class="`is-${draft.layout}`"
          :style="previewStyle"
          role="img"
          aria-label="字幕样式预览"
        >
          <div class="preview-block block-a">
            <span class="preview-main" :class="{ bold: draft.mainBold }"
              ><ruby
                ><span class="sung">四角</span
                ><rt :class="{ bold: draft.rubyBold }">しかく</rt></ruby
              ><span class="unsung">い部屋</span></span
            >
            <span
              v-if="draft.includeRoman"
              class="preview-roman"
              :class="{ bold: draft.romanBold }"
              >shikakui heya</span
            >
          </div>
          <div class="preview-block block-b">
            <span class="preview-main" :class="{ bold: draft.mainBold }"
              ><span class="unsung">の片隅</span></span
            >
            <span
              v-if="draft.includeRoman"
              class="preview-roman"
              :class="{ bold: draft.romanBold }"
              >no katasumi</span
            >
          </div>
        </div>
        <div class="preview-legend">
          <span><i class="legend-dot sung" />已唱</span>
          <span><i class="legend-dot unsung" />未唱</span>
        </div>
      </aside>
      <div class="style-settings">
        <section class="style-section">
          <div class="section-heading"><h3>版式</h3></div>
          <div class="layout-grid" role="group" aria-label="版式预设">
            <button
              v-for="item in layouts"
              :key="item.value"
              type="button"
              class="layout-card"
              :class="{ selected: draft.layout === item.value }"
              :aria-pressed="draft.layout === item.value"
              :title="item.label"
              @click="draft.layout = item.value"
            >
              <span class="layout-diagram" :class="`is-${item.value}`">
                <i /><i />
              </span>
              <span class="layout-copy">
                <strong>{{ item.title }}</strong>
                <small>{{ item.hint }}</small>
              </span>
            </button>
          </div>
          <UiField v-model="draft.font" label="字体" />
        </section>
        <section class="style-section">
          <div class="section-heading"><h3>文字层</h3></div>
          <div class="layer-table">
            <div class="layer-head">
              <span>层</span><span>字号</span><span>粗体</span><span>颜色</span>
            </div>
            <div class="layer-row">
              <span class="layer-name"
                ><i
                  class="layer-dot"
                  :style="{ background: mainColor }"
                />歌词</span
              >
              <UiField
                class="size-field"
                type="number"
                label=""
                ariaLabel="歌词字号"
                :model-value="String(draft.mainSize)"
                :min="assStyleRanges.mainSize[0]"
                :max="assStyleRanges.mainSize[1]"
                step="1"
                @update:model-value="setNumber('mainSize', $event)"
              />
              <UiToggle
                :model-value="draft.mainBold"
                switch
                :show-label="false"
                label="歌词粗体"
                @update:model-value="draft.mainBold = $event"
              />
              <span class="color-readout"
                ><i class="layer-dot" :style="{ background: mainColor }" />{{
                  draft.colorMode === "solid" ? "统一色" : "声部色"
                }}</span
              >
            </div>
            <div class="layer-row">
              <span class="layer-name"
                ><i
                  class="layer-dot"
                  :style="{ background: rubyColor }"
                />注音</span
              >
              <UiField
                class="size-field"
                type="number"
                label=""
                ariaLabel="注音字号"
                :model-value="String(draft.rubySize)"
                :min="assStyleRanges.rubySize[0]"
                :max="assStyleRanges.rubySize[1]"
                step="1"
                @update:model-value="setNumber('rubySize', $event)"
              />
              <UiToggle
                :model-value="draft.rubyBold"
                switch
                :show-label="false"
                label="注音粗体"
                @update:model-value="draft.rubyBold = $event"
              />
              <UiColorField
                class="color-field"
                :model-value="rubyColor"
                label="注音颜色"
                :show-label="false"
                :disabled="rubyFollow"
                @update:model-value="draft.rubyColor = $event"
              />
            </div>
            <div class="layer-row">
              <span class="layer-name"
                ><i
                  class="layer-dot"
                  :style="{ background: draft.romanColor }"
                />罗马音</span
              >
              <UiField
                class="size-field"
                type="number"
                label=""
                ariaLabel="罗马音字号"
                :model-value="String(draft.romanSize)"
                :min="assStyleRanges.romanSize[0]"
                :max="assStyleRanges.romanSize[1]"
                step="1"
                @update:model-value="setNumber('romanSize', $event)"
              />
              <UiToggle
                :model-value="draft.romanBold"
                switch
                :show-label="false"
                label="罗马音粗体"
                @update:model-value="draft.romanBold = $event"
              />
              <UiColorField
                v-model="draft.romanColor"
                class="color-field"
                label="罗马音颜色"
                :show-label="false"
              />
            </div>
          </div>
          <div class="table-options">
            <UiToggle
              :model-value="rubyFollow"
              switch
              label="跟随歌词色"
              @update:model-value="toggleRubyFollow"
            />
            <UiToggle
              v-model="draft.includeRoman"
              switch
              label="包含罗马音行"
            />
          </div>
        </section>
        <section class="style-section">
          <div class="section-heading"><h3>外观</h3></div>
          <div class="appearance-grid">
            <div class="field-block">
              <span class="field-caption">描边</span>
              <div class="outline-row">
                <UiField
                  class="outline-size"
                  type="number"
                  label=""
                  ariaLabel="描边粗细"
                  :model-value="String(draft.outline)"
                  :min="assStyleRanges.outline[0]"
                  :max="assStyleRanges.outline[1]"
                  step="1"
                  @update:model-value="setNumber('outline', $event)"
                />
                <UiColorField
                  v-model="draft.outlineColor"
                  label="描边颜色"
                  :show-label="false"
                />
              </div>
            </div>
            <div class="field-block">
              <span class="field-caption">未唱颜色</span>
              <UiColorField
                v-model="draft.unsungColor"
                label="未唱颜色"
                :show-label="false"
              />
            </div>
            <div class="field-block solid-field">
              <span class="field-caption">统一文字颜色</span>
              <div class="solid-row">
                <UiToggle
                  :model-value="draft.colorMode === 'solid'"
                  switch
                  :show-label="false"
                  label="统一文字颜色"
                  @update:model-value="
                    draft.colorMode = $event ? 'solid' : 'part'
                  "
                />
                <UiColorField
                  v-if="draft.colorMode === 'solid'"
                  v-model="draft.solidColor"
                  label="纯色"
                  :show-label="false"
                />
                <span v-else class="follow-color">跟随声部颜色</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
    <footer>
      <UiButton variant="text" @click="reset">恢复默认</UiButton>
      <span class="footer-gap" />
      <UiButton variant="text" @click="emit('close')">取消</UiButton>
      <UiButton variant="filled" @click="save">应用</UiButton>
    </footer>
  </Modal>
</template>
<style scoped>
.style-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  align-items: start;
  gap: 28px;
  overflow-y: auto;
  padding: 0 24px 8px;
}
.style-preview {
  position: sticky;
  top: 0;
  padding-top: 2px;
}
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 11px;
}
.preview-layout {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--muted);
  font-size: 10px;
}
.preview-stage {
  position: relative;
  height: 248px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background:
    radial-gradient(
      circle at 18% 18%,
      rgba(1, 207, 240, 0.17),
      transparent 42%
    ),
    radial-gradient(
      circle at 86% 82%,
      rgba(255, 138, 101, 0.13),
      transparent 46%
    ),
    #10151a;
  color: #fff;
}
.preview-stage::before {
  position: absolute;
  inset: 0;
  content: "";
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 28%,
    #000 72%,
    transparent
  );
  pointer-events: none;
}
.preview-block {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}
.preview-block.block-a {
  left: 8%;
  bottom: 12%;
  align-items: flex-start;
}
.preview-block.block-b {
  top: 10%;
  right: 8%;
  align-items: flex-end;
}
.is-diagonal .preview-block.block-a {
  top: 10%;
  bottom: auto;
}
.is-diagonal .preview-block.block-b {
  top: auto;
  bottom: 12%;
}
.is-single .preview-block.block-a {
  left: 50%;
  bottom: 12%;
  align-items: center;
  transform: translateX(-50%);
}
.is-single .preview-block.block-b {
  display: none;
}
.preview-main,
.preview-main rt,
.preview-roman {
  -webkit-text-stroke: var(--outline-width) var(--outline-color);
  paint-order: stroke fill;
}
.preview-main {
  color: var(--main-color);
  font-size: var(--main-size);
  line-height: 1.02;
}
.preview-main .unsung,
.preview-block.block-b .preview-main {
  color: var(--unsung-color);
}
.preview-main rt {
  color: var(--ruby-color);
  font-size: var(--ruby-size);
  font-weight: inherit;
  letter-spacing: 0.14em;
  line-height: 1;
}
.preview-roman {
  color: var(--roman-color);
  font-size: var(--roman-size);
  letter-spacing: 0.03em;
  line-height: 1.1;
}
.bold {
  font-weight: 700;
}
.preview-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 10px;
}
.preview-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.legend-dot.sung {
  background: var(--main-color);
}
.legend-dot.unsung {
  background: var(--unsung-color);
  box-shadow: inset 0 0 0 1px var(--line);
}
.style-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 2px;
}
.style-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.style-section + .style-section {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.section-heading h3 {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.layout-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
.layout-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--soft);
  color: var(--ink);
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.layout-card:hover {
  border-color: var(--accent);
}
.layout-card.selected {
  border-color: var(--accent);
  background: rgba(var(--mdui-color-primary), 0.12);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.layout-diagram {
  position: relative;
  display: block;
  width: 100%;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--sheet);
}
.layout-diagram i {
  position: absolute;
  width: 38%;
  height: 4px;
  border-radius: 2px;
  background: var(--muted);
  opacity: 0.7;
}
.layout-diagram.is-classic i:first-child {
  left: 9%;
  bottom: 8px;
}
.layout-diagram.is-classic i:last-child {
  top: 8px;
  right: 9%;
}
.layout-diagram.is-diagonal i:first-child {
  top: 8px;
  left: 9%;
}
.layout-diagram.is-diagonal i:last-child {
  right: 9%;
  bottom: 8px;
}
.layout-diagram.is-single i:first-child {
  left: 31%;
  bottom: 8px;
}
.layout-diagram.is-single i:last-child {
  display: none;
}
.layout-card.selected .layout-diagram i {
  background: var(--accent);
  opacity: 1;
}
.layout-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.layout-copy strong {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.layout-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layer-table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.layer-head,
.layer-row {
  display: grid;
  grid-template-columns: minmax(54px, 0.8fr) 96px 54px minmax(126px, 1.2fr);
  align-items: center;
  gap: 10px;
  padding: 0 12px;
}
.layer-head {
  min-height: 32px;
  background: var(--soft);
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.04em;
}
.layer-row {
  min-height: 60px;
}
.layer-row + .layer-row {
  border-top: 1px solid var(--line);
}
.layer-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}
.layer-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.size-field {
  width: 100%;
}
.layer-row :deep(.ui-toggle) {
  justify-self: start;
}
.color-field {
  width: 100%;
}
.color-readout {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.table-options {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 22px;
}
.table-options :deep(.ui-toggle) {
  min-height: 32px;
}
.appearance-grid {
  display: grid;
  grid-template-columns: 1.18fr 1fr 1.18fr;
  gap: 14px 18px;
}
.field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field-caption {
  color: var(--muted);
  font-size: 11px;
}
.outline-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.outline-size {
  width: 100%;
}
.solid-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.solid-row :deep(.ui-color-field) {
  flex: 1;
}
.follow-color {
  color: var(--muted);
  font-size: 11px;
}
.footer-gap {
  flex: 1;
}
@media (max-width: 780px) {
  .style-workbench {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .style-preview {
    position: static;
  }
  .preview-stage {
    height: 230px;
  }
  .appearance-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 460px) {
  .layout-grid {
    grid-template-columns: 1fr;
  }
  .layout-card {
    flex-direction: row;
    align-items: center;
  }
  .layout-diagram {
    flex: 0 0 44px;
    width: 44px;
    height: 30px;
  }
  .layout-diagram i {
    width: 32%;
  }
}
@media (max-width: 520px) {
  .style-workbench {
    padding: 0 16px 8px;
  }
  .layer-head,
  .layer-row {
    grid-template-columns: 48px 70px 48px minmax(104px, 1fr);
    gap: 6px;
    padding: 0 8px;
  }
  .layer-row {
    min-height: 56px;
  }
  .layer-name {
    gap: 5px;
    font-size: 12px;
  }
  .layer-dot {
    width: 6px;
    height: 6px;
  }
  .table-options {
    gap: 2px 12px;
  }
  .appearance-grid {
    grid-template-columns: 1fr;
  }
}
</style>
