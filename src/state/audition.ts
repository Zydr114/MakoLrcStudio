import { ref } from "vue";
import type { AudioTransport } from "../audio/transport";
export type AuditionScope = "line" | "token" | "boundary" | "song";
export interface AuditionTarget {
  lineId: string;
  unitId: string | null;
}
type Port = Pick<AudioTransport, "play" | "playing">;
/** A range is frozen during a pass. Its same target is resolved anew at the next loop. */
export function createAudition(
  transport: Port,
  resolve: (
    scope: AuditionScope,
    target: AuditionTarget,
    committed?: boolean,
  ) => [number, number],
  activate: () => void,
  sync: () => void,
  fail: (error: unknown) => void,
) {
  const scope = ref<AuditionScope | null>(null),
    loop = ref(false),
    range = ref<[number, number] | null>(null),
    target = ref<AuditionTarget | null>(null);
  let generation = 0;
  async function play(from?: number) {
    if (!range.value) return;
    const version = ++generation;
    activate();
    try {
      const [start, end] = range.value;
      await transport.play(
        from === undefined || from >= end
          ? start
          : Math.max(0, Math.min(from, end - 1)),
        end,
      );
      if (version === generation) sync();
    } catch (error) {
      if (version === generation) fail(error);
    }
  }
  async function start(
    nextScope: AuditionScope,
    nextTarget: AuditionTarget,
    from?: number,
  ) {
    try {
      range.value = resolve(nextScope, nextTarget);
      scope.value = nextScope;
      target.value = nextTarget;
      await play(from);
    } catch (error) {
      fail(error);
    }
  }
  function cancel() {
    generation++;
    scope.value = null;
    range.value = null;
    target.value = null;
  }
  function invalidate() {
    generation++;
  }
  function handleEnd(): boolean {
    if (!loop.value || !scope.value || !target.value) return false;
    try {
      range.value = resolve(scope.value, target.value, true);
      void play();
      return true;
    } catch (error) {
      cancel();
      fail(error);
      return false;
    }
  }
  return {
    scope,
    loop,
    range,
    target,
    start,
    resume: play,
    cancel,
    invalidate,
    handleEnd,
  };
}
