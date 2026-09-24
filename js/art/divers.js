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

const BARK = ramp(['#3a2010', '#5a321a', '#7a4826', '#976036', '#b07a4a', '#c69462', '#d8ae7e', '#eccaa0'], 8);
const CUT = ramp(['#8a6038', '#b08458', '#d0a878', '#ecd0a4'], 4);
const LEAF = ramp(['#12300e', '#1e4a16', '#2e681e', '#428a2a', '#5aa838', '#76c24a', '#9ad866', '#c4ee92'], 8);
const SPOT = ramp(['#7a5a08', '#b08a10', '#d8b020', '#f0cc30', '#fce65a'], 5);
const INK = [hex('#140a10')], WHITE = [hex('#ffffff')], PINK = [hex('#e87888')], PINKD = [hex('#b04a60')];

// The tree friend, front view, waving: a leaning log with a forked twig on
// top, little dot eyes and a wide pink smile, yellow spots, a wide bow-legged
// stance, and three round leaf balls on each twiggy hand. frame 0..3 is the
// wave; a blink on frame 3. Origin at his feet.
function treeFriend(frame) {
  const W = 62, H = 80;
  const cxAt = (y) => 30 + (46 - y) * 0.11;       // the trunk leans a little
  const wave = [-0.45, -0.05, 0.4, -0.05][frame];
  const shR = [cxAt(32) + 6.5, 32];
  const handR = [shR[0] + Math.cos(-0.62 + wave) * 18, shR[1] + Math.sin(-0.62 + wave) * 18];
  const handL = [8, 25];
  const ballsAt = (x, y, hx, hy, flip) => {
    let best = -1;
    for (const [dx, dy] of [[-2.2 * flip, -5], [-3.2 * flip, 3.6], [4 * flip, -0.8]]) {
      const hh = dome(x - hx - dx, y - hy - dy, 4.5, 4.5, 4.6);
      if (hh > best) best = hh;
    }
    return best > 0 ? best + (fbm(x * 0.5, y * 0.5, 9, 2) - 0.5) * 0.35 : -1;
  };
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    const cx = cxAt(y);
    // bow legs and flat feet pointing outward
    put(tube(x, y, cxAt(57) - 4, 57, cxAt(57) - 10.5, 65, 3.6, 3), 2);
    put(tube(x, y, cxAt(57) - 10.5, 65, cxAt(57) - 14, 72, 3, 2.8), 2);
    put(tube(x, y, cxAt(57) + 4.5, 57, cxAt(57) + 11, 65, 3.6, 3), 2);
    put(tube(x, y, cxAt(57) + 11, 65, cxAt(57) + 14.5, 72, 3, 2.8), 2);
    put(dome(x - (cxAt(57) - 16.5), y - 74.5, 5.6, 2.4, 3), 2);
    put(dome(x - (cxAt(57) + 17), y - 74.5, 5.6, 2.4, 3), 2);
    // the log: long, rounded at the top, hips a touch wider at the bottom
    if (y > 13 && y < 61) {
      const hw = 7.6 + (y > 50 ? (y - 50) * 0.3 : 0);
      let t = dome(x - cx, Math.max(0, 19 - y), hw, 6.5, 8.5);
      if (t > 0) {
        if (ridge(x * 0.3, y * 0.06, 5) < 0.09) t -= 0.9;             // faint grain
        put(t, y > 50 + Math.abs(x - cx) * 0.15 ? 2 : 1);
      }
    }
    // forked twig on top, cut flat and pale at the ends
    put(up(tube(x, y, cxAt(14), 15, cxAt(14) + 1, 8.5, 2.2, 1.9, 1.1), 5), 1);
    put(up(tube(x, y, cxAt(14) + 0.6, 9.5, cxAt(14) - 5.5, 4, 1.9, 1.7, 1.1), 5), 1);
    put(up(tube(x, y, cxAt(14) + 1, 9.5, cxAt(14) + 7, 2.5, 1.9, 1.7, 1.1), 5), 1);
    put(up(dome(x - (cxAt(14) - 6.3), y - 3.3, 1.8, 1.8, 1.2), 7.5), 3);
    put(up(dome(x - (cxAt(14) + 7.8), y - 1.8, 1.8, 1.8, 1.2), 7.5), 3);
    // thin twiggy arms, each ending in three leaf balls
    put(up(tube(x, y, cxAt(32) - 6.5, 32, handL[0] + 2, handL[1] + 1, 1.8, 1.2, 1.2), 7), 1);
    put(up(ballsAt(x, y, handL[0], handL[1], 1), 8), 4);
    put(up(tube(x, y, shR[0], shR[1], handR[0] - 1, handR[1] + 1, 1.8, 1.2, 1.2), 7), 1);
    put(up(ballsAt(x, y, handR[0], handR[1], -1), 8), 4);
    if (h <= 0) return null;
    if (m !== 1 && m !== 2) return [h, m];
    // tall oval yellow spots
    for (const [sx, sy, rx, ry] of [[3.5, 34, 1.3, 2.9], [-3, 40, 1.3, 2.9], [4, 42.5, 0.9, 1.9], [-1.5, 48, 1.3, 2.7], [-5, 55.5, 1.2, 2.6]]) {
      if (((x - cxAt(sy) - sx) / rx) ** 2 + ((y - sy) / ry) ** 2 < 1) return [h + 0.5, 6];
    }
    // face: little dot eyes (a blink on frame 3) and a wide pink smile
    for (const ex of [-3, 3.6]) {
      const exx = cxAt(21) + ex, ey = 21;
      if (frame === 3) { if (Math.abs(y - ey - 0.5) < 0.6 && Math.abs(x - exx) < 1.5) return [h, 8]; }
      else if (((x - exx) / 1.2) ** 2 + ((y - ey) / 1.9) ** 2 < 1) return [h, x < exx && y < ey ? 9 : 8];
    }
    const dx = x - cxAt(26) - 0.6;
    if (Math.abs(dx) < 6.4) {
      const top = 25.4 - 0.02 * dx * dx, bot = 27.6 - 0.06 * dx * dx;
      if (y > top && y < bot) return [h - 0.4, y > bot - 0.8 ? 11 : 10];
    }
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BARK, gloss: 0.2 }, 2: { pal: BARK, bias: -1.1, gloss: 0.15 }, 3: { pal: CUT, gloss: 0.2 }, 4: { pal: LEAF, gloss: 0.35 },
    6: { pal: SPOT, gloss: 0.3 }, 8: { pal: INK, flat: true }, 9: { pal: WHITE, flat: true }, 10: { pal: PINK, flat: true }, 11: { pal: PINKD, flat: true },
  });
  c.ox = Math.round(cxAt(57)); c.oy = 76;
  return c;
}

export function treeSprite(frame) {
  const key = 'friend' + frame;
  let c = cache.get(key);
  if (!c) { c = treeFriend(frame); cache.set(key, c); }
  return c;
}

// Mameshiba: a plump lime-green bean with a puppy face, swimming side-on to
// the right. A big dark floppy ear at the back, a little one at the front,
// round shiny eyes, a tiny nose and a cat-like mouth. frame 0..3 flops the
// ear a little; a blink on frame 3.
const BEAN = ramp(['#3c5a0e', '#5a7c16', '#7a9e1e', '#98ba28', '#b2d232', '#c6e240', '#d8ee66', '#ecf8a6'], 8);
const EAR = ramp(['#1c4a0c', '#2c6612', '#3e8418', '#56a022', '#72ba2e'], 5);
function mameshiba(frame) {
  const W = 44, H = 32, cy = 17;
  const flop = [0, 0.5, 0, -0.5][frame];
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    // the bean: long and round, with a gentle dip along its tummy
    const dy = y - cy;
    const face = Math.max(0, (x - 24) / 14) * 1.2;   // the face end is a little fuller
    const ry = (dy > 0 ? 10.6 - 1.8 * Math.exp(-(((x - 19) / 6) ** 2)) : 11 - 0.8 * Math.exp(-(((x - 15) / 7) ** 2))) + face;
    put(dome(x - 21.5, dy, 19, ry, 11), 1);
    // the little front ear, peeking out at the top of the face
    put(up(dome(x - 37.6, y - (cy - 7.5), 2.4, 3.4, 2.6), 6), 2);
    if (h <= 0) return null;
    // the big floppy ear lying on the back of the head
    const ex = (x - (12 + flop * 0.5)) / 3.4, ey = (y - (cy - 5 + flop)) / 5.4;
    if (ex * ex + ey * ey < 1 && m === 1) return [h + 1.2 * Math.sqrt(1 - ex * ex - ey * ey), 2];
    if (m !== 1) return [h, m];
    // face
    const nx = x - 31, ny = y - (cy + 1.2);
    if (ny > -0.8 && ny < 1.2 && Math.abs(nx) < 1.6 - ny * 0.6) return [h, 3];                         // nose
    if (Math.abs(y - (cy + 3.2 + Math.abs(Math.abs(nx) - 1.5) * -0.5)) < 0.55 && Math.abs(nx) < 3) return [h, 3]; // mouth
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BEAN, gloss: 0.45, dither: 0.35 }, 2: { pal: EAR, gloss: 0.3, dither: 0.35 }, 3: { pal: INK, flat: true }, 4: { pal: WHITE, flat: true },
  }, { outline: hex('#16240a') });
  // round shiny eyes, placed by hand so they stay perfectly round
  const g = c.getContext('2d');
  for (const ex of [25, 34]) {
    const ey = cy - 5;
    g.fillStyle = '#140a10';
    if (frame === 3) { g.fillRect(ex, ey + 2, 4, 1); continue; }
    g.fillRect(ex + 1, ey, 2, 1); g.fillRect(ex, ey + 1, 4, 2); g.fillRect(ex + 1, ey + 3, 2, 1);
    g.fillStyle = '#ffffff'; g.fillRect(ex + 1, ey + 1, 1, 1);
  }
  c.ox = 22; c.oy = cy; c.mouth = [31, cy + 3];
  return c;
}

export function diverSprite(kind, frame) {
  const key = kind + frame;
  let c = cache.get(key);
  if (!c) { c = mameshiba(frame); cache.set(key, c); }
  return c;
}

// A fat grey seal dressed up as Cupid, sitting on a rock: little white
// feathered wings, a pink sash, a bow in one flipper and a heart-tipped
// arrow drawn back with the other. Big shiny eyes and puffy whisker pads.
// frame 0 = eyes open, 1 = blink. Origin at the bottom centre of the rock.
const SEAL = ramp(['#1a1e2a', '#262c3c', '#343c50', '#444e64', '#56627a', '#6a7890', '#8290a6', '#9eaabc', '#bcc6d4', '#dae0ea'], 10);
const WING = ramp(['#6a7488', '#98a2b6', '#c2cad8', '#e2e8f0', '#fafcff'], 5);
const WOOD = ramp(['#4a2c0c', '#744818', '#a06c26', '#cc9838', '#ecc458', '#fce690'], 6);
const SASH = ramp(['#6a1030', '#a01e4a', '#d03c6c', '#f06e96', '#ffa6c0'], 5);
const HEART = ramp(['#7a1024', '#b8203c', '#e84860', '#ff8a9a'], 4);
const STONE = ramp(['#0c1428', '#15203a', '#20304e', '#2c4064', '#3a527a', '#4c6690', '#6280a8'], 7);
export function sealCupidSprite(frame) {
  const key = 'seal' + frame;
  if (cache.has(key)) return cache.get(key);
  const SK = 1.3, W = Math.round(100 * SK), H = Math.round(104 * SK), cx = 50;
  const bowTop = [22, 34], bowBot = [22, 80], bowMid = [11, 57], hand = [44, 58];
  const field0 = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    // the rock it sits on
    const rk = dome(x - cx, y - 96, 36, 13, 12);
    if (rk > 0) put(rk + (fbm(x * 0.2, y * 0.2, 31, 3) - 0.5) * 4, 7);
    // wings behind the shoulders, rows of little scalloped feathers
    for (const s of [-1, 1]) {
      const ox = (x - (cx + s * 22)) * s, oy = y - 36;
      const u = ox * 0.8 + oy * 0.6, v = -ox * 0.6 + oy * 0.8;
      const top = -7 * Math.sqrt(Math.max(0, 1 - (u / 12) ** 2));
      if (u > -9 && u < 12 && v > top && v < 5 + 2 * Math.abs(Math.sin(u * 0.9))) {
        let wh = 5 - (v - top) * 0.15;
        if ((((v - top) + 2 * Math.abs(Math.sin(u * 0.9))) / 3.2) % 1 < 0.22 && v > top + 2) wh -= 1;
        put(wh, 3);
      }
    }
    // tail flippers splayed on the rock
    put(up(dome(x - (cx - 17), y - 86, 10, 3.6, 4), 5), 1);
    put(up(dome(x - (cx + 17), y - 86, 10, 3.6, 4), 5), 1);
    // the round, heavy body and head (seals don't really have necks)
    put(dome(x - cx, y - 63, 25, 21, 20), 1);
    put(dome(x - cx, y - 46, 19, 17, 18), 1);
    put(dome(x - cx, y - 30, 15.5, 14.5, 17), 1);
    // pink sash across the tummy
    if (h > 12 && Math.abs(y - (44 + (x - 30) * 0.65)) < 2.4 && m === 1 && y > 38) put(h + 1.3, 5);
    // left flipper out holding the bow, right flipper drawing the arrow
    put(up(tube(x, y, cx - 15, 50, bowMid[0] + 6, bowMid[1], 5, 3.2, 1), 14), 1);
    put(up(tube(x, y, cx + 15, 50, hand[0] + 2, hand[1], 5, 3.2, 1), 16), 1);
    // the bow: a curved arc of golden wood, and its string
    const bc = [bowMid[0] + 28, bowMid[1]], R = 28;
    const bd = Math.hypot(x - bc[0], y - bc[1]), ba = Math.atan2(y - bc[1], -(x - bc[0]));
    if (Math.abs(ba) < 0.95 && Math.abs(bd - R) < 1 + 0.8 * Math.cos(ba * 1.5)) put(19, 4);
    for (const tip of [bowTop, bowBot]) put(up(tube(x, y, tip[0], tip[1], hand[0], hand[1], 0.5, 0.5, 1), 18.5), 6);
    // the arrow, and its heart-shaped tip
    put(up(tube(x, y, hand[0], hand[1], 8, hand[1], 0.8, 0.8, 1), 20), 4);
    { const u = -(y - hand[1]) / 4.6, v = (x - 6) / 4.6 * 1.05 + 0.25; const q = u * u + v * v - 1; if (q * q * q - u * u * v * v * v <= 0) put(21, 8); }
    if (h <= 0) return null;
    if (m !== 1) return [h, m];
    // face: puffy whisker pads, a little nose, speckles on the body
    for (const s of [-1, 1]) {
      const wp = dome(x - (cx + s * 3.4), y - 37, 4, 3, 1.6);
      if (wp > 0) return [h + wp, 2];
    }
    if (Math.abs(x - cx) < 2.2 - (y - 33) * 0.5 && y > 32.5 && y < 35) return [h + 1, 9];
    if (y > 44 && ((Math.floor(x * 0.7) * 7 + Math.floor(y * 0.7) * 13) % 23) === 0) return [h, 10];
    return [h, m];
  };
  const field = (x, y) => { const v = field0(x / SK, y / SK); return v ? [v[0] * SK, v[1]] : null; };
  const c = sculpt(W, H, field, {
    1: { pal: SEAL, gloss: 0.7 }, 2: { pal: SEAL, bias: 1.5, gloss: 0.4 }, 3: { pal: WING, gloss: 0.3 }, 4: { pal: WOOD, gloss: 0.6 },
    5: { pal: SASH, gloss: 0.5 }, 6: { pal: [hex('#f0e8d8')], flat: true }, 7: { pal: STONE, gloss: 0.2 }, 8: { pal: HEART, gloss: 0.8 },
    9: { pal: INK, flat: true }, 10: { pal: SEAL, bias: -2 },
  });
  // big round shiny eyes, placed by hand
  const g = c.getContext('2d');
  for (const ex of [cx - 7, cx + 7]) {
    const X = Math.round(ex * SK), Y = Math.round(28 * SK);
    g.fillStyle = '#0a0810';
    if (frame === 1) { g.fillRect(X - 3, Y + 1, 6, 1); g.fillRect(X - 2, Y + 2, 4, 1); continue; }
    g.fillRect(X - 2, Y - 3, 4, 1); g.fillRect(X - 3, Y - 2, 6, 5); g.fillRect(X - 2, Y + 3, 4, 1);
    g.fillStyle = '#ffffff'; g.fillRect(X - 2, Y - 2, 2, 2); g.fillRect(X + 1, Y + 1, 1, 1);
  }
  c.ox = Math.round(cx * SK); c.oy = H - 2;
  cache.set(key, c);
  return c;
}
