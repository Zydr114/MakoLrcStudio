/** Layout produces events first; effects decorate them before serialization. */
export interface AssOutputEvent {
  layer: number;
  start: number;
  end: number;
  style: string;
  actor: string;
  effect: string;
  text: string;
  kind: string;
}

export const assTime = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000),
    m = Math.floor(cs / 6000) % 60,
    s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

export function serializeAssEvent(event: AssOutputEvent): string {
  return `${event.kind}: ${event.layer},${assTime(event.start)},${assTime(event.end)},${event.style},${event.actor.replace(/,/g, "，")},0,0,0,${event.effect},${event.text}`;
}
