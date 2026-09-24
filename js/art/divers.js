// Two little friends, sculpted and lit like the fish: a tall tree fellow
// with leafy ball hands who waves from the reef, and Mameshiba, a round
// green bean pup paddling about in a snorkel mask.
import { ramp, ridge, fbm, hex } from '../util.js';
import { sculpt, dome, tube } from './sculpt.js';

export const DIVER_FRAMES = 4;
export const TREE_FRAMES = 4;
const cache = new Map();
// raise a part by `off` only where it exists (parts are -1 outside)
const up = (hh, off) => (hh > 0 ? hh + off : -1);

const BARK = ramp(['#26140a', '#43250f', '#643818', '#834c22', '#a2632f', '#bd7e44', '#d59d62', '#ecc08a'], 8);
const LEAF = ramp(['#0c2410', '#16401a', '#245e24', '#347e2e', '#4a9e3a', '#6abc4c', '#94d86a', '#c2f098'], 8);
const SPOT = ramp(['#5e460c', '#9a7a18', '#caa42a', '#ecca46', '#fff086'], 5);
const INK = [hex('#140a10')], WHITE = [hex('#ffffff')], PINK = [hex('#ff7a9a')], TONGUE = [hex('#e0506e')];

// The tree friend, front view, waving. frame 0..3 = wave cycle, a blink on
// frame 3. Origin at his feet.
function treeFriend(frame) {
  const W = 50, H = 66, cx = 25;
  const wave = [-0.5, -0.1, 0.35, -0.1][frame];
  const hand = [cx + 8 + Math.cos(-1.05 + wave) * 14, 30 + Math.sin(-1.05 + wave) * 14];
  const lhand = [8, 17];
  const balls = (x, y, hx, hy, flip) => {
    let best = -1;
    for (const [dx, dy] of [[0, -3], [-3.3 * flip, 1.2], [3 * flip, 2.4]]) {
      const hh = dome(x - hx - dx, y - hy - dy, 3.5, 3.5, 3.6);
      if (hh > best) best = hh;
    }
    // bumpy leaves
    return best > 0 ? best + (fbm(x * 0.9, y * 0.9, 7, 2) - 0.5) * 1.6 : -1;
  };
  const field = (x, y) => {
    const dx = x - cx;
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    // stubby legs and round feet
    for (const s of [-1, 1]) {
      put(tube(x, y, cx + s * 4.5, 50, cx + s * 5.5, 59, 3.4, 3.2) * 0.9, 2);
      put(dome(x - (cx + s * 6.5), y - 61, 4.6, 2.6, 3), 2);
    }
    // the trunk: a tall rounded column, a little wider at the belly
    if (y > 18 && y < 53) {
      const hw = 8.2 + 1.4 * Math.exp(-(((y - 40) / 9) ** 2)) - (y > 49 ? (y - 49) * 0.4 : 0);
      let t = dome(dx, 0, hw, 1, 8);
      if (t > 0) {
        // bark cracks running up and down
        if (ridge(x * 0.32, y * 0.07, 3) < 0.13) t -= 1.3;
        put(t, y > 47 ? 2 : 1);
      }
    }
    put(dome(dx, y - 20, 9.2, 9.5, 8.6), 1);   // round head top
    // yellow spots on the belly
    for (const [sx, sy, rx, ry] of [[cx + 3, 33, 2.6, 2.6], [cx - 3.5, 39, 2.4, 2.4], [cx + 2.5, 45, 2.2, 2.2], [cx - 4, 30, 2, 2]]) {
      const s = dome(x - sx, y - sy, rx, ry, 1);
      if (s > 0 && h > 0) put(h + s * 0.8, 3);
    }
    // forked twig on his head with little leaf tips
    put(up(tube(x, y, cx, 13, cx, 6, 1.5, 1.3, 1.2), 5), 1);
    put(up(tube(x, y, cx, 7, cx - 5, 2.5, 1.3, 1.1, 1.2), 5), 1);
    put(up(tube(x, y, cx, 7, cx + 5, 1.5, 1.3, 1.1, 1.2), 5), 1);
    put(up(dome(x - (cx - 5.6), y - 2.2, 2.2, 2.2, 2.4), 5), 4);
    put(up(dome(x - (cx + 5.6), y - 1.2, 2.2, 2.2, 2.4), 5), 4);
    // arms: one held up, one waving, both ending in leafy balls
    put(up(tube(x, y, cx - 7, 30, lhand[0] + 1, lhand[1] + 3, 1.9, 1.4, 1.3), 6), 1);
    put(up(balls(x, y, lhand[0], lhand[1], 1), 7), 4);
    put(up(tube(x, y, cx + 7, 30, hand[0], hand[1] + 2, 1.9, 1.4, 1.3), 6), 1);
    put(up(balls(x, y, hand[0] + 1, hand[1] - 1, -1), 7), 4);
    if (h <= 0) return null;
    // face: shiny eyes (a blink on frame 3) and a big open smile
    for (const s of [-1, 1]) {
      const ex = cx + s * 4, ey = 19;
      if (frame === 3) { if (Math.abs(y - ey - 0.5) < 0.6 && Math.abs(x - ex) < 1.8) return [h, 5]; }
      else if (((x - ex) / 1.6) ** 2 + ((y - ey) / 2.2) ** 2 < 1) return [h, x < ex && y < ey ? 6 : 5];
    }
    const mTop = 23.5, mBot = 27.2 - 0.07 * dx * dx;
    if (Math.abs(dx) < 5 && y > mTop && y < mBot) return [h, y > mBot - 1.4 && Math.abs(dx) < 3 ? 8 : 7];
    if (Math.hypot(Math.abs(dx) - 6.4, y - 23.4) < 1.1) return [h, 9];
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BARK, gloss: 0.15 }, 2: { pal: BARK, bias: -1.4, gloss: 0.1 }, 3: { pal: SPOT, gloss: 0.3 }, 4: { pal: LEAF, gloss: 0.35 },
    5: { pal: INK, flat: true }, 6: { pal: WHITE, flat: true }, 7: { pal: INK, flat: true }, 8: { pal: TONGUE, flat: true }, 9: { pal: PINK, flat: true },
  });
  c.ox = cx; c.oy = 63;
  return c;
}

export function treeSprite(frame) {
  const key = 'friend' + frame;
  let c = cache.get(key);
  if (!c) { c = treeFriend(frame); cache.set(key, c); }
  return c;
}

// Mameshiba: a plump green bean pup, swimming side-on to the right in a
// snorkel mask, paws paddling. frame 0..3 paddles; a blink on frame 3.
const BEAN = ramp(['#16300a', '#264e10', '#3a6e18', '#528e22', '#6eae2e', '#90ca42', '#b6e46c', '#dcf6a6'], 8);
const MASK = ramp(['#10141f', '#222a3a', '#3a465c', '#5c6c86', '#8898b0'], 5);
const GLASS = ramp(['#3a86b0', '#62aed6', '#92d2f0', '#c4ecff', '#f2fcff'], 5);
const TUBE = ramp(['#7a5a0c', '#b88e18', '#e6bc30', '#fce066', '#fff6b8'], 5);
const TIP = ramp(['#7a200c', '#c44418', '#ee6a30', '#ff9a62'], 4);
function mameshiba(frame) {
  const W = 40, H = 34, cy = 20;
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    // paws paddling underneath (behind the body)
    for (const [px, ph] of [[26, 0], [21, 2], [12, 1], [8, 3]]) {
      const k = Math.sin((frame + ph) * Math.PI / 2);
      put(dome(x - px - k * 1.2, y - (cy + 8 + k * 0.8), 2.1, 2.6, 2.5), 10);
    }
    // a little round tail
    put(up(dome(x - 5.4, y - (cy - 4), 2.4, 2.3, 2.4), 3), 1);
    // the bean: plump, with a gentle dip along its back
    const dip = 1.5 * Math.exp(-(((x - 14) / 5) ** 2));
    const dy = y - cy;
    put(dome(x - 18, dy, 13, dy < 0 ? 9.6 - dip : 9.2, 10), 1);
    // pointy shiba ears
    for (const [ex, lean] of [[21.5, -0.5], [27, 0.6]]) {
      const t = (cy - 7.5 - y) / 4.6;
      if (t > -0.3 && t < 1 && Math.abs(x - ex - lean * Math.max(0, t) * 2) < 2.5 * (1 - t) + 0.3) put(5.5 + (1 - t) * 2.5, 3);
    }
    // snorkel up behind the mask, orange mouthpiece on top
    put(up(tube(x, y, 20.5, cy - 4, 19.8, cy - 15, 1.25, 1.2, 1), 9), 7);
    if (Math.abs(x - 19.8) < 2 && y > cy - 18 && y < cy - 14.5) put(10.5, 8);
    if (h <= 0) return null;
    if (m !== 1) return [h, m];
    // oval mask with glass over the eyes, strap round the head
    const box = Math.hypot((x - 26) / 5, (y - (cy - 2.5)) / 3.4);
    if (box < 1) return [h + (box > 0.72 ? 1.4 : 0.6), box > 0.72 ? 4 : 5];
    if (Math.abs(y - (cy - 3.2 + (x - 21) * 0.06)) < 0.8 && x > 7.5 && x < 21.3) return [h + 0.8, 4];
    // nose, a little 'w' mouth and pink cheeks
    if (Math.hypot(x - 29.3, y - (cy + 1.6)) < 1.05) return [h, 6];
    if (y > cy + 2.9 && y < cy + 3.9 && x > 27 && x < 30.6 && (Math.floor(x) !== 28 || y > cy + 3.4)) return [h, 6];
    if (((x - 23.6) / 1.7) ** 2 + ((y - (cy + 2.3)) / 1.05) ** 2 < 1) return [h, 11];
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BEAN, gloss: 0.5 }, 3: { pal: BEAN, bias: -1.2 }, 10: { pal: BEAN, bias: -1.5 },
    4: { pal: MASK, gloss: 0.6 }, 5: { pal: GLASS, gloss: 1, bias: 0.5 }, 6: { pal: INK, flat: true },
    7: { pal: TUBE, gloss: 0.6 }, 8: { pal: TIP, gloss: 0.5 }, 11: { pal: PINK, flat: true },
  });
  // eyes behind the glass: big and shiny, or a happy blink
  const x = c.getContext('2d');
  for (const ex of [24.5, 28]) {
    if (frame === 3) { x.fillStyle = '#140a10'; x.fillRect(Math.round(ex) - 1, cy - 2, 3, 1); continue; }
    x.fillStyle = '#140a10'; x.fillRect(Math.round(ex) - 1, cy - 4, 2, 3);
    x.fillStyle = '#ffffff'; x.fillRect(Math.round(ex) - 1, cy - 4, 1, 1);
  }
  c.ox = 19; c.oy = cy; c.mouth = [19.8, cy - 17];
  return c;
}

export function diverSprite(kind, frame) {
  const key = kind + frame;
  let c = cache.get(key);
  if (!c) { c = mameshiba(frame); cache.set(key, c); }
  return c;
}
