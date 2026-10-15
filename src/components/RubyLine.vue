<script setup lang="ts">
import { computed, ref } from "vue";
import { editor } from "../state/editor";
import { rubySelection, clearRubySelection } from "../state/rubySelection";
import { activeLines, type LyricLine } from "../domain/model";
import { tokenize, mergeUnits } from "../domain/tokenize";
import {
  moraCuts,
  readingCuts,
  readingOf,
  rubyParts,
  setRuby,
  splitIntoCharacters,
} from "../domain/ruby";
import { confirmRuby, pendingRuby } from "../domain/autoRuby";
import { graphemes } from "../domain/tokenize";
import UiButton from "./UiButton.vue";
import RubyEditor from "./RubyEditor.vue";
const props = defineProps<{ line: LyricLine; index: number }>();
/** Lines are split lazily; until then show the split the first edit will make. */
const units = computed(() =>
  props.line.units.length ? props.line.units : tokenize(props.line.text),
);
const mine = computed(() => rubySelection.lineId === props.line.id);
const range = computed(() =>
  mine.value ? units.value.slice(rubySelection.from, rubySelection.to + 1) : [],
);
const rangeText = computed(
  () => rubyParts(range.value.map((unit) => unit.text).join("")).base,
);
const pending = computed(() => pendingRuby(props.line));
const issue = ref("");
const initial = computed(() => {
  const group = range.value;
  if (group.length === 1 && group[0].ruby)
    return { reading: readingOf(group[0]), cuts: readingCuts(group[0]) };
  const reading = group.every((unit) => unit.ruby)
    ? group.map(readingOf).join("")
    : "";
  return { reading, cuts: moraCuts(reading) };
});
function pick(index: number, extend: boolean) {
  if (extend && mine.value) {
    const anchor = rubySelection.from;
    rubySelection.from = Math.min(anchor, index);
    rubySelection.to = Math.max(anchor, index);
  } else {
    rubySelection.lineId = props.line.id;
    rubySelection.from = rubySelection.to = index;
  }
  rubySelection.editing = false;
  issue.value = "";
  editor.view({ activeLineId: props.line.id });
}
function edit(label: string, change: (line: LyricLine) => void) {
  const id = props.line.id;
  const ok = editor.command(label, (draft) => {
    const line = activeLines(draft).find((item) => item.id === id)!;
    if (!line.units.length) line.units = tokenize(line.text);
    change(line);
  });
  if (!ok) {
    issue.value = editor.error;
    editor.error = "";
  }
  return ok;
}
function apply(pieces: string[]) {
  const { from, to } = rubySelection;
  if (
    edit("编辑读音", (line) => {
      if (to > from) line.units = mergeUnits(line.units, from, to);
      setRuby(line, from, pieces);
    })
  ) {
    rubySelection.to = from;
    rubySelection.editing = false;
  }
}
function confirm() {
  const { from, to } = rubySelection;
  edit("确认注音", (line) => confirmRuby(line, from, to));
}
function remove() {
  const { from, to } = rubySelection;
  if (
    edit("移除注音", (line) => {
      for (let i = from; i <= to; i++)
        if (line.units[i].ruby) setRuby(line, i, null);
    })
  )
    rubySelection.editing = false;
}
function explode() {
  const from = rubySelection.from;
  if (edit("拆为单字", (line) => splitIntoCharacters(line, from)))
    clearRubySelection();
}
</script>
<template>
  <div class="ruby-line">
    <div class="ruby-units" :aria-label="`第 ${index + 1} 行注音`">
      <button
        v-for="(unit, i) in units"
        :key="i"
        type="button"
        class="ruby-unit"
        :class="{
          selected: mine && i >= rubySelection.from && i <= rubySelection.to,
          'has-ruby': unit.ruby,
          pending: unit.autoRuby,
        }"
        :aria-pressed="mine && i >= rubySelection.from && i <= rubySelection.to"
        :title="
          unit.autoRuby
            ? '自动注音，待确认'
            : 'Shift + 点击可选择多个字，合为一组注音'
        "
        @click="pick(i, $event.shiftKey)"
      >
        <template v-if="unit.ruby"
          >{{ rubyParts(unit.text).before
          }}<ruby
            >{{ rubyParts(unit.text).base
            }}<rt
              ><span
                v-for="syllable in unit.syllables"
                :key="syllable.id"
                class="ruby-mora"
                >{{ syllable.text }}</span
              ></rt
            ></ruby
          >{{ rubyParts(unit.text).after }}</template
        ><template v-else>{{ unit.text }}</template>
      </button>
      <UiButton
        v-if="pending"
        class="confirm-line"
        variant="text"
        @click="edit('确认本行注音', (line) => confirmRuby(line))"
        >确认本行（{{ pending }}）</UiButton
      >
    </div>
    <div v-if="mine && !rubySelection.editing" class="ruby-actions">
      <span
        >「{{ rangeText }}」<small v-if="range.length > 1"
          >{{ range.length }} 个单位将合为一组</small
        ></span
      >
      <UiButton variant="tonal" @click="rubySelection.editing = true">{{
        range.some((unit) => unit.ruby) ? "编辑读音" : "添加读音"
      }}</UiButton>
      <UiButton
        v-if="range.some((unit) => unit.autoRuby)"
        variant="text"
        @click="confirm"
        >确认</UiButton
      >
      <UiButton
        v-if="range.some((unit) => unit.ruby)"
        variant="text"
        @click="remove"
        >移除注音</UiButton
      >
      <UiButton
        v-if="
          range.length === 1 &&
          graphemes(rubyParts(range[0].text).base).length > 1
        "
        variant="text"
        @click="explode"
        >拆为单字</UiButton
      >
    </div>
    <RubyEditor
      v-if="mine && rubySelection.editing"
      :base="rangeText"
      :reading="initial.reading"
      :cuts="initial.cuts"
      :removable="range.some((unit) => unit.ruby)"
      :error="issue"
      @apply="apply"
      @remove="remove"
      @cancel="rubySelection.editing = false"
    />
    <p v-else-if="mine && issue" class="field-error" role="alert">
      {{ issue }}
    </p>
  </div>
</template>
<style scoped>
.ruby-line {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ruby-units {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  row-gap: 4px;
}
.ruby-unit {
  padding: 2px 1px 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 18px;
  line-height: 1.9;
  white-space: pre;
  cursor: pointer;
}
.ruby-unit:hover {
  background: var(--soft);
}
.ruby-unit.selected {
  background: var(--accent-soft);
  box-shadow: inset 0 -2px var(--accent);
}
.ruby-unit.pending ruby {
  text-decoration: underline dotted var(--accent);
  text-underline-offset: 5px;
}
rt {
  font-size: 0.5em;
  color: var(--accent);
}
.ruby-mora + .ruby-mora {
  border-left: 1px solid var(--line);
}
.confirm-line {
  margin-left: auto;
}
.ruby-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ruby-actions small {
  margin-left: 6px;
  color: var(--muted);
}
.field-error {
  color: var(--danger);
  font-size: 12px;
}
</style>
