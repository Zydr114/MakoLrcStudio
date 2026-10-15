import { reactive } from "vue";
/** Units picked in the reading view: one line, a run of units, maybe being edited. */
export const rubySelection = reactive({
  lineId: null as string | null,
  from: 0,
  to: 0,
  editing: false,
});
export function clearRubySelection() {
  rubySelection.lineId = null;
  rubySelection.editing = false;
}
