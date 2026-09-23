// Two little friends: a tall tree fellow with leafy ball hands who waves from
// the reef, and a round green bean pup in a snorkel. Hand-placed pixels.
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

// The tall tree friend, front view, waving at you. frame 0..3 = wave cycle,
// blink on frame 3. Origin at his feet.
export const TREE_FRAMES = 4;
function treeFriend(frame) {
  const P = painter(48, 64);
  const bark = C('#b27e54'), barkL = C('#cc9a6c'), barkD = C('#865a3a'), pants = C('#946645');
  const leaf = C('#5cae3e'), leafL = C('#92d664'), leafD = C('#3c7e2c');
  const balls = (hx, hy, flip) => {
    for (const [dx, dy] of [[0, -3], [-3.4 * flip, 1], [3 * flip, 2.6]]) P.ellipse(hx + dx, hy + dy, 3.3, 3.3, (u, v) => (v < -0.35 && u < 0.2 ? leafL : v > 0.45 || u > 0.55 ? leafD : leaf));
  };
  // bowed legs and big flat feet
  P.line(20, 50, 15, 57, barkD, 1.6);
  P.line(28, 50, 33, 57, barkD, 1.6);
  P.ellipse(13, 59, 4.2, 2, () => barkD);
  P.ellipse(35, 59, 4.2, 2, () => barkD);
  // long trunk with a slight lean, darker "shorts" at the bottom
  for (let y = 14; y <= 51; y++) {
    const lean = (y - 14) * -0.06;
    const hw = 6.2 + (y > 44 ? (y - 44) * 0.35 : 0);
    const cx = 24 + lean;
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const u = (x + 0.5 - cx) / hw;
      let c = u < -0.5 ? barkL : u > 0.55 ? barkD : bark;
      if (y > 43) c = u > 0.5 ? barkD : pants;
      if (y === 14 && Math.abs(u) > 0.7) continue;
      P.fill(x, y, c);
    }
  }
  // yellow spots
  const spot = C('#f2c632'), spotD = C('#c89a1c');
  for (const [x, y] of [[25, 30], [20, 35], [26, 38], [21, 45]]) {
    P.fill(x + 1, y, spot); P.fill(x, y + 1, spot); P.fill(x + 1, y + 1, spot);
    P.fill(x, y + 2, spot); P.fill(x + 1, y + 2, spotD); P.fill(x, y + 3, spotD);
  }
  // forked branch on his head
  P.line(24, 14, 24, 8, bark, 1.1);
  P.line(24, 9, 20, 4, bark, 1.1);
  P.line(24, 9, 28, 3, bark, 1.1);
  P.ellipse(19.5, 3.6, 1.6, 1.6, () => barkL);
  P.ellipse(28.5, 2.6, 1.6, 1.6, () => barkL);
  // left arm raised and still, right arm waving
  P.line(18, 27, 7, 17, barkD, 0.9);
  balls(6, 15, 1);
  const wave = [-0.5, -0.1, 0.35, -0.1][frame];
  const hx = 31 + Math.cos(-1.05 + wave) * 14, hy = 27 + Math.sin(-1.05 + wave) * 14;
  P.line(30, 27, hx, hy, barkD, 0.9);
  balls(hx + 1, hy - 1, -1);
  // face: dot eyes and a wide pink smile
  if (frame !== 3) { P.fill(21, 20, OUT); P.fill(21, 21, OUT); P.fill(26, 20, OUT); P.fill(26, 21, OUT); }
  else { P.fill(21, 21, OUT); P.fill(26, 21, OUT); }
  // a wide curved smile
  const pink = C('#ea8aa2');
  P.fill(19, 23, OUT); P.fill(28, 23, OUT);
  for (let x = 20; x <= 27; x++) P.fill(x, 24, pink);
  for (let x = 21; x <= 26; x++) P.fill(x, 25, pink);
  P.fill(20, 25, OUT); P.fill(27, 25, OUT);
  for (let x = 21; x <= 26; x++) P.fill(x, 26, OUT);
  P.outline();
  const c = P.b.toCanvas();
  c.ox = 24; c.oy = 61;
  return c;
}

export function treeSprite(frame) {
  const key = 'friend' + frame;
  let c = cache.get(key);
  if (!c) { c = treeFriend(frame); cache.set(key, c); }
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
  if (!c) { c = beanDiver(frame); cache.set(key, c); }
  return c;
}
