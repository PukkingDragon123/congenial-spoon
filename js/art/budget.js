// Per-frame sprite generation budget + a background warm-up queue, so sprite
// variants are rendered lazily without ever stalling a frame.
export const B = { left: Infinity };
export function timed(fn) {
  const t = performance.now();
  const r = fn();
  B.left -= performance.now() - t;
  return r;
}
const queue = [];
export function queueWarm(fn) { queue.push(fn); }
export function pumpWarm(ms) {
  const end = performance.now() + ms;
  while (queue.length && performance.now() < end) queue.shift()();
  return queue.length;
}
