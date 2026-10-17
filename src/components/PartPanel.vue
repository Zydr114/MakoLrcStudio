<script setup lang="ts">
import { computed, ref } from "vue";
import { editor } from "../state/editor";
import {
  addPart,
  movePart,
  nextPartName,
  partKindLabels,
  removePart,
  updatePart,
} from "../domain/parts";
import { partKinds, type PartKind, type VocalPart } from "../domain/model";
import UiButton from "./UiButton.vue";
import UiColorField from "./UiColorField.vue";
import UiField from "./UiField.vue";
import UiIconButton from "./UiIconButton.vue";
import UiSelect from "./UiSelect.vue";
import UiToggle from "./UiToggle.vue";
import Modal from "./Modal.vue";
const kindOptions = partKinds.map((kind) => ({
  value: kind,
  label: partKindLabels[kind],
}));
const creating = ref(false),
  editingId = ref<string | null>(null),
  removing = ref(false),
  issue = ref("");
const form = ref({
  name: "",
  kind: "person" as PartKind,
  background: false,
  color: "#000000",
  copyText: false,
});
const editing = computed(() =>
  editor.project.parts.find((part) => part.id === editingId.value),
);
const stats = (id: string) => editor.partStats.find((item) => item.id === id);
function startCreate() {
  editor.pause();
  form.value = {
    name: nextPartName(editor.project),
    kind: "person",
    background: false,
    color: "#000000",
    copyText: false,
  };
  issue.value = "";
  creating.value = true;
}
function create() {
  let id = "";
  const ok = editor.command("新增声部", (draft) => {
    id = addPart(draft, form.value).id;
  });
  if (!ok) {
    issue.value = editor.error;
    editor.error = "";
    return;
  }
  creating.value = false;
  editor.switchPart(id);
}
function startEdit(part: VocalPart) {
  editor.pause();
  form.value = {
    name: part.name,
    kind: part.kind,
    background: part.background,
    color: part.color,
    copyText: false,
  };
  issue.value = "";
  removing.value = false;
  editingId.value = part.id;
}
function save() {
  const id = editingId.value!;
  const { name, kind, background, color } = form.value;
  if (
    !editor.command("修改声部", (draft) =>
      updatePart(draft, id, { name, kind, background, color }),
    )
  ) {
    issue.value = editor.error;
    editor.error = "";
    return;
  }
  editingId.value = null;
}
function setMain(id: string) {
  editor.command("设为主声部", (draft) => {
    draft.mainPartId = id;
  });
}
function move(id: string, delta: number) {
  editor.command("调整声部顺序", (draft) => movePart(draft, id, delta));
}
function remove() {
  const id = editingId.value!;
  if (editor.command("删除声部", (draft) => removePart(draft, id)))
    editingId.value = null;
}
</script>
<template>
  <section class="part-panel" aria-labelledby="part-panel-title">
    <div class="part-panel-heading">
      <h2 id="part-panel-title">声部</h2>
      <UiButton variant="text" @click="startCreate">＋ 新增</UiButton>
    </div>
    <ul class="part-list">
      <li
        v-for="(part, index) in editor.project.parts"
        :key="part.id"
        :class="{ active: part.id === editor.project.activePartId }"
      >
        <button
          class="part-row"
          type="button"
          :aria-current="
            part.id === editor.project.activePartId ? 'true' : undefined
          "
          :aria-label="`切换到声部 ${part.name}`"
          @click="editor.switchPart(part.id)"
        >
          <i class="part-dot" :style="{ background: part.color }" />
          <span class="part-name">{{ part.name }}</span>
          <small
            >{{ part.background ? "和声" : partKindLabels[part.kind]
            }}{{ part.id === editor.project.mainPartId ? " · 主声部" : "" }} ·
            {{ part.lines.length }} 行</small
          >
          <small v-if="stats(part.id)" class="part-progress"
            >{{ stats(part.id)!.done }}/{{ stats(part.id)!.total }}</small
          >
        </button>
        <UiIconButton
          icon="settings"
          :label="`编辑声部 ${part.name}`"
          @click="startEdit(part)"
        />
        <span class="sr-only">第 {{ index + 1 }} 个声部</span>
      </li>
    </ul>
    <p class="small-note">
      每个声部单独打轴，彼此可以重叠。LRC 只导出主声部；TTML、ASS 导出全部声部。
    </p>
    <Modal :open="creating" title="新增声部" @close="creating = false">
      <div class="part-form">
        <UiField v-model="form.name" label="名称" />
        <UiSelect v-model="form.kind" label="类型" :options="kindOptions" />
        <UiToggle
          v-model="form.background"
          switch
          label="和声（TTML 中附在主行下方）"
        />
        <UiToggle
          v-model="form.copyText"
          :label="`复制「${editor.part.name}」的歌词文本（不含时间）`"
        />
        <p v-if="issue" class="field-error" role="alert">{{ issue }}</p>
      </div>
      <footer>
        <UiButton variant="text" @click="creating = false">取消</UiButton
        ><UiButton variant="filled" @click="create">新增声部</UiButton>
      </footer>
    </Modal>
    <Modal
      :open="!!editing"
      :title="`编辑声部「${editing?.name ?? ''}」`"
      @close="editingId = null"
    >
      <div v-if="editing" class="part-form">
        <UiField v-model="form.name" label="名称" />
        <UiSelect v-model="form.kind" label="类型" :options="kindOptions" />
        <UiToggle
          v-model="form.background"
          switch
          label="和声（TTML 中附在主行下方）"
        />
        <UiColorField v-model="form.color" label="颜色" />
        <div class="part-form-actions">
          <UiButton
            :disabled="editing.id === editor.project.mainPartId"
            @click="setMain(editing.id)"
            >{{
              editing.id === editor.project.mainPartId
                ? "已是主声部"
                : "设为主声部"
            }}</UiButton
          >
          <UiButton
            variant="text"
            :disabled="editor.project.parts[0].id === editing.id"
            @click="move(editing.id, -1)"
            >上移</UiButton
          ><UiButton
            variant="text"
            :disabled="editor.project.parts.at(-1)!.id === editing.id"
            @click="move(editing.id, 1)"
            >下移</UiButton
          >
        </div>
        <p v-if="issue" class="field-error" role="alert">{{ issue }}</p>
        <div v-if="removing" class="part-remove-confirm" role="alert">
          <span
            >删除后该声部的
            {{ editing.lines.length }}
            行歌词和时间一起删除，可用撤销恢复。</span
          >
          <UiButton variant="text" @click="removing = false">保留</UiButton
          ><UiButton variant="filled" @click="remove">确认删除</UiButton>
        </div>
      </div>
      <footer v-if="editing">
        <UiButton
          variant="text"
          icon="trash"
          :disabled="editor.project.parts.length === 1 || removing"
          :title="
            editor.project.parts.length === 1 ? '至少保留一个声部' : undefined
          "
          @click="removing = true"
          >删除声部</UiButton
        >
        <span class="footer-spacer" />
        <UiButton variant="text" @click="editingId = null">取消</UiButton
        ><UiButton variant="filled" @click="save">保存</UiButton>
      </footer>
    </Modal>
  </section>
</template>
<style scoped>
.part-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.part-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.part-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.part-list li {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 12px;
}
.part-list li.active {
  background: var(--accent-soft);
}
.part-row {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.part-row:hover {
  background: var(--soft);
}
.part-list li.active .part-row:hover {
  background: transparent;
}
.part-row .part-dot {
  grid-row: 1 / 3;
}
.part-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.part-row small {
  grid-column: 2;
  color: var(--muted);
  font-size: 11px;
}
.part-row .part-progress {
  grid-column: 3;
  grid-row: 1 / 3;
  font-variant-numeric: tabular-nums;
}
.part-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.part-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.part-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.part-remove-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(var(--mdui-color-error), 0.1);
  color: var(--danger);
  font-size: 13px;
}
.footer-spacer {
  flex: 1;
}
.field-error {
  color: var(--danger);
  font-size: 12px;
}
</style>
