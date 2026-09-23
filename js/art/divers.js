// Two little scuba buddies: a tree-stump fellow with leafy ball hands, and a
// round green bean pup. Hand-placed pixels, drawn facing right.
import { Buf, hex } from '../util.js';

export const DIVER_FRAMES = 4;
const cache = new Map();

const C = (h) => hex(h);
const OUT = C('#1a1420');

function painter(w, h) {
  const b = new Buf(w, h);
  const fill = (x, y, col) => b.set(x, y, col);
  const ellipse = (cx, cy, rx, ry, colFn) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) fill(x, y, colFn(u, v));
    }
  };
  const rect = (x0, y0, x1, y1, col) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fill(x, y, col); };
  const line = (ax, ay, bx, by, col, r = 0) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2 + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (r) ellipse(x, y, r, r, () => col); else fill(Math.round(x), Math.round(y), col);
    }
  };
  // one-pixel dark outline around everything drawn so far
  const outline = () => {
    const d = b.d, W = b.w, H = b.h;
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
    const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) pts.push([x, y]);
    for (const [x, y] of pts) b.set(x, y, OUT);
  };
  return { b, fill, ellipse, rect, line, outline };
}

// frame: flutter kick phase; blink on frame 3
function treeDiver(frame) {
  const P = painter(34, 40);
  const kick = [0, 1, 0, -1][frame];
  const bark = C('#a8724a'), barkD = C('#7c5032'), barkL = C('#c48c5e');
  const leaf = C('#5caa3c'), leafL = C('#8cd45c'), leafD = C('#3a7a2a');
  // air tank on his back
  P.rect(8, 14, 11, 25, C('#f2c230'));
  P.rect(8, 14, 8, 25, C('#c89a20'));
  P.rect(9, 12, 10, 13, C('#9aa4b4'));
  // flippers and stubby legs
  P.ellipse(12 - kick, 36, 3.2, 1.6, () => C('#2f7ee0'));
  P.ellipse(21 + kick, 36, 3.2, 1.6, () => C('#2f7ee0'));
  P.rect(12, 30, 14, 34, barkD);
  P.rect(19, 30, 21, 34, barkD);
  // trunk
  P.ellipse(16.5, 22, 5.5, 10, (u) => (u < -0.45 ? barkL : u > 0.5 ? barkD : bark));
  // yellow spots
  for (const [x, y] of [[14, 23], [18, 26], [15, 28]]) { P.fill(x, y, C('#f0c830')); P.fill(x, y + 1, C('#f0c830')); }
  // forked branch on top
  P.line(16.5, 12, 16.5, 7, bark, 0.9);
  P.line(16.5, 8, 13.5, 5, bark, 0.9);
  P.line(16.5, 8, 19.5, 4, bark, 0.9);
  // arms reaching up and out, green ball hands
  P.line(12, 18, 5, 12, barkD, 0.8);
  P.line(21, 18, 28, 12, barkD, 0.8);
  for (const [cx, cy] of [[4, 11], [2, 14], [6, 8], [29, 11], [31, 14], [27, 8]]) P.ellipse(cx, cy, 2.2, 2.2, (u, v) => (v < -0.3 && u < 0.2 ? leafL : v > 0.4 ? leafD : leaf));
  // diving mask
  P.rect(13, 14, 21, 18, C('#3a4458'));
  P.rect(14, 15, 20, 17, C('#9fe0ff'));
  P.fill(14, 15, C('#e8fbff'));
  if (frame !== 3) { P.fill(16, 16, OUT); P.fill(19, 16, OUT); } else { P.fill(16, 16, C('#5a86a8')); P.fill(19, 16, C('#5a86a8')); }
  // happy smile with the regulator
  P.line(15, 20, 19, 20, C('#e87a9a'));
  P.fill(20, 21, C('#3a4458'));
  P.outline();
  const c = P.b.toCanvas();
  c.ox = 17; c.oy = 22; c.mouth = [21, 21];
  return c;
}

function beanDiver(frame) {
  const P = painter(30, 26);
  const kick = [0, 1, 0, -1][frame];
  const body = C('#c4dc3a'), bodyL = C('#dcee70'), bodyD = C('#9cb42a');
  // little flippers
  P.ellipse(10 - kick, 22, 2.6, 1.3, () => C('#2f7ee0'));
  P.ellipse(17 + kick, 22, 2.6, 1.3, () => C('#2f7ee0'));
  // snorkel
  P.line(21, 9, 23, 2, C('#9aa4b4'), 0.7);
  P.fill(23, 1, C('#ff7a3a')); P.fill(24, 1, C('#ff7a3a')); P.fill(23, 0, C('#ff7a3a'));
  // bean body
  P.ellipse(14, 13, 11, 8, (u, v) => (v < -0.45 ? bodyL : v > 0.55 ? bodyD : body));
  // ears
  P.ellipse(20.5, 8, 2.6, 3.6, () => C('#6aae2a'));
  P.ellipse(3.5, 12, 1.6, 2.6, () => C('#6aae2a'));
  // mask over the eyes
  P.rect(6, 9, 17, 13, C('#3a4458'));
  P.rect(7, 10, 16, 12, C('#b8ecff'));
  P.fill(7, 10, C('#f0fcff'));
  if (frame !== 3) { P.rect(9, 11, 10, 12, OUT); P.rect(13, 11, 14, 12, OUT); P.fill(9, 11, C('#ffffff')); P.fill(13, 11, C('#ffffff')); }
  else { P.rect(9, 12, 10, 12, OUT); P.rect(13, 12, 14, 12, OUT); }
  // tiny cat-like mouth
  P.fill(11, 15, OUT); P.fill(12, 16, OUT); P.fill(13, 15, OUT); P.fill(12, 14, OUT);
  P.outline();
  const c = P.b.toCanvas();
  c.ox = 14; c.oy = 13; c.mouth = [22, 2];
  return c;
}

export function diverSprite(kind, frame) {
  const key = kind + frame;
  let c = cache.get(key);
  if (!c) { c = kind === 'tree' ? treeDiver(frame) : beanDiver(frame); cache.set(key, c); }
  return c;
}
