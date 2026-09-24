// Guests for the happy ending: dolphins and seahorses that swim a heart
// together around the couple, leaving sparkles behind them.
import { TAU, heartPoint, ramp, hex } from '../util.js';
import { sculpt, dome, tube } from '../art/sculpt.js';

const up = (hh, off) => (hh > 0 ? hh + off : -1);

const cache = new Map();
const SEA = ramp(['#3a1406', '#6a2a0c', '#9a4412', '#c8621c', '#e8862c', '#f8aa44', '#ffcc70', '#ffe8a8'], 8);
const SEAFIN = ramp(['#9a5a24', '#d89a52', '#f6cc86', '#fff0cc'], 4);
const BACK = ramp(['#0a1022', '#121c34', '#1c2a48', '#28395c', '#354a70', '#465e86', '#5a749c', '#728cb2'], 8);
const FLANK = ramp(['#26344e', '#364a68', '#4a6284', '#627ea2', '#809cc0', '#a2bcd8'], 6);
const BELLY = ramp(['#7e8aa0', '#a0acc0', '#c2ccdc', '#dee4ee', '#f4f6fa', '#ffffff'], 6);
const INK = [hex('#0a0810')], WHITE = [hex('#ffffff')], BLUSH = [hex('#ff8aa6')];
export const DOLPHIN_FRAMES = 6;

// piecewise-smooth profile lookup: pts = [[u, value], ...]
function prof(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) {
    const [u0, v0] = pts[i - 1], [u1, v1] = pts[i], t = (u - u0) / (u1 - u0);
    return v0 + (v1 - v0) * t * t * (3 - 2 * t);
  }
  return pts[pts.length - 1][1];
}
// A bottlenose's side profile, tail (0) to beak tip (1): a sturdy torpedo
// with a rounded melon, a crease where the short beak starts, and a firm
// tail stock.
const TOP = [[0, 1.9], [0.1, 2.9], [0.22, 4.4], [0.38, 7.0], [0.52, 8.7], [0.64, 8.9], [0.74, 8.2], [0.8, 7.5], [0.845, 6.6], [0.87, 5.0], [0.885, 3.2], [0.9, 2.6], [0.97, 2.1], [1, 1.4]];
const BOT = [[0, 1.6], [0.1, 2.5], [0.22, 3.9], [0.38, 6.4], [0.52, 7.9], [0.64, 7.6], [0.74, 6.5], [0.82, 5.0], [0.88, 3.3], [0.92, 2.4], [1, 1.2]];
const CAPE = ramp(['#081226', '#0e1c38', '#16294c'], 3);

// A bottlenose dolphin facing right: dark cape along the back, grey flanks,
// a pale belly from chin to tail, a curved dorsal fin, swept-back flippers,
// and flukes seen edge-on that beat up and down as the body flexes. A little
// smile, a bright eye, a blowhole. frame 0..5.
export function dolphinSprite(frame) {
  const k = 'd' + frame;
  if (cache.has(k)) return cache.get(k);
  const W = 112, H = 48, cy = 24, X0 = 15, L = 92;
  const beat = Math.sin((frame / DOLPHIN_FRAMES) * Math.PI * 2);
  // the spine: a gentle arch, flexing most towards the tail
  const mid = (u) => cy - Math.sin(u * Math.PI) * 1.2 + beat * 4 * Math.pow(1 - u, 2.4) - beat * 0.5 * u;
  const slope = (u) => (mid(u + 0.01) - mid(u - 0.01)) / (0.02 * L);
  const finBase = (u) => mid(u) - prof(TOP, u);
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    const u = (x - X0) / L;
    if (u >= 0 && u <= 1) {
      const t = prof(TOP, u), b = prof(BOT, u), mu = mid(u);
      if (y > mu - t && y < mu + b) {
        const c = mu + (b - t) / 2, half = (t + b) / 2;
        const d = Math.sqrt(Math.max(0, 1 - ((y - c) / half) ** 2)) * half * 1.2;
        // colour bands: cape on the back, flank, and the pale belly, whose
        // edge sweeps up behind the eye and fades out towards the tail
        const belly = mu + b * (0.1 - 0.5 * Math.max(0, Math.min(1, (u - 0.72) / 0.14)) + 0.25 * Math.max(0, 0.3 - u) / 0.3);
        const cape = mu - t * (0.45 + 0.2 * Math.sin(u * 7));
        put(d, y > belly && u > 0.12 ? 3 : y < cape && u > 0.2 && u < 0.82 ? 4 : y < mu - t * 0.1 ? 1 : 2);
      }
    }
    // the dorsal fin: curved, its tip swept back
    const u0 = 0.47, u1 = 0.61, fh = 10;
    {
      const v = finBase(0.55) + 1 - y;
      if (v > -1 && v < fh) {
        const f = v / fh;
        const lead = X0 + L * (u1 - f * 0.1 - f * f * 0.06), trail = X0 + L * (u0 + f * 0.04 - f * f * 0.1);
        if (x > trail && x < lead) put(2.4 + (1 - f) * 1.4, 4);
      }
    }
    // pectoral flipper, angled back and down
    {
      const ax = X0 + 0.77 * L, ay = mid(0.77) + 3.2;
      put(up(tube(x, y, ax, ay, ax - 8, ay + 6.5, 2.1, 0.6, 1), 5), 1);
    }
    // the flukes: two swept lobes with a notch between, flattening and
    // opening as they beat
    {
      const tx = X0 + 1, ty = mid(0), tilt = -beat * 0.35 + slope(0) * 0.6;
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      const lx = (x - tx) * c + (y - ty) * sn, ly = -(x - tx) * sn + (y - ty) * c;
      const open = 0.55 + 0.45 * Math.abs(beat);
      if (lx < 1.5 && lx > -14) {
        const q = -lx / 14;                        // 0 at the root, 1 at the tips
        const spread = open * (1.4 + q * 6.2);     // how far the lobes reach up/down
        const thick = 1.3 + 1.6 * Math.sin(Math.PI * Math.min(1, q * 1.3));
        // one solid swept shape: wide at the tips, a notch in the middle of
        // the trailing edge
        const reach = spread * q + thick * (1 - q * 0.6);
        const edge = 0.74 + 0.26 * Math.min(1, Math.abs(ly) / Math.max(1, spread * 0.7));
        if (Math.abs(ly) < reach && q < edge) put(2.2 + (1 - q) * 0.8, ly < 0 ? 1 : 2);
      }
    }
    if (h <= 0) return null;
    // eye, blowhole and the smile
    const ue = 0.855, ex = X0 + ue * L, ey = mid(ue) - 0.6;
    if (((x - ex) / 1.4) ** 2 + ((y - ey) / 1.2) ** 2 < 1) return [h, Math.hypot(x - ex + 0.5, y - ey + 0.5) < 0.6 ? 6 : 5];
    if (u > 0.76 && u < 0.78 && y < mid(u) - prof(TOP, u) + 1.2) return [h, 5];
    if (u > 0.865 && u < 0.995) {
      const ym = mid(u) + 0.6 - Math.max(0, 0.905 - u) * 22;
      if (Math.abs(y - ym) < 0.5) return [h, 5];
    }
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BACK, gloss: 0.9, dither: 0.5 }, 2: { pal: FLANK, gloss: 0.8, dither: 0.5 }, 3: { pal: BELLY, gloss: 0.6, bias: -0.3, dither: 0.5 },
    4: { pal: CAPE, gloss: 0.9, bias: 0.3, dither: 0.4 }, 5: { pal: INK, flat: true }, 6: { pal: WHITE, flat: true },
  });
  c.ox = 56; c.oy = cy;
  cache.set(k, c);
  return c;
}

// A seahorse facing right: curled tail, ridged belly rings, a crown of
// little spikes, a long snout, and a see-through back fin that flutters.
// SK scales it (small in the tank, bigger for the encyclopedia picture).
export function seahorseSprite(frame, SK = 0.6) {
  const k = 's' + frame + '|' + SK;
  if (cache.has(k)) return cache.get(k);
  const W = Math.round(32 * SK), H = Math.round(48 * SK);   // small, but carrying the same detail
  const P = [[16, 11, 5.4], [14.5, 16.5, 3.8], [16.8, 22, 5.8], [17.4, 28, 5.9], [15, 33.5, 4.3], [12.4, 38, 3.2], [11, 42, 2.5], [8.4, 45, 2.1], [5, 44.4, 1.8], [3.4, 41.2, 1.5], [4.8, 38.4, 1.2], [7.4, 38.6, 1]];
  let acc = 0;
  const seg = P.slice(1).map((q, i) => { const p0 = P[i]; const l = Math.hypot(q[0] - p0[0], q[1] - p0[1]); const o = { a: p0, b: q, t0: acc, l }; acc += l; return o; });
  const flap = [0, 1, 2, 1][frame];
  const field0 = (x, y) => {
    let h = -1, m = 0, tb = 0;
    for (const sg of seg) {
      const hh = tube(x, y, sg.a[0], sg.a[1], sg.b[0], sg.b[1], sg.a[2], sg.b[2], 1.1);
      if (hh > h) {
        h = hh; m = 1;
        const vx = sg.b[0] - sg.a[0], vy = sg.b[1] - sg.a[1];
        const t = Math.max(0, Math.min(1, ((x - sg.a[0]) * vx + (y - sg.a[1]) * vy) / (sg.l * sg.l)));
        tb = sg.t0 + t * sg.l;
      }
    }
    // body rings: little ridges all the way down
    if (h > 0 && tb > 8) { const f = (tb * 0.55) % 1; if (f < 0.22) h -= 0.9; else if (f < 0.5) h += 0.3; }
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    // snout and crown
    put(up(tube(x, y, 19, 12.5, 27.5, 14.5, 1.9, 1.5, 1), 2), 1);
    put(up(dome(x - 28, y - 14.6, 1.7, 1.9, 1.6), 2), 1);
    for (const [cx0, cy0] of [[13, 5.2], [15.8, 4.6], [18.4, 5.6]]) put(up(tube(x, y, cx0, cy0 + 2.5, cx0 + 0.3, cy0, 1.2, 0.7, 1), 3), 1);
    // back fin: fan of rays behind the body
    // a fan-shaped back fin whose rays ripple
    const fx = x - 12, fy = y - 25, fa = Math.atan2(fy, fx), fr = Math.hypot(fx, fy);
    if (h <= 0 && Math.abs(fa) > 1.9 && fr < 6.2 + Math.sin(fa * 9 + flap * 1.6) * 0.6) {
      const ray = Math.floor((fa + Math.PI) * 6 + flap) % 2;
      return [1.2 + (6 - fr) * 0.15, ray ? 3 : 4];
    }
    if (h <= 0) return null;
    // eye and a blush
    if (Math.hypot(x - 18, y - 10) < 2) return [h, 5];
    if (((x - 16.6) / 1.5) ** 2 + ((y - 13.6) / 0.9) ** 2 < 1) return [h, 7];
    return [h, m];
  };
  const field = (x, y) => { const v = field0(x / SK, y / SK); return v ? [v[0] * SK, v[1]] : null; };
  const c = sculpt(W, H, field, {
    1: { pal: SEA, gloss: 0.6, dither: 0.5 }, 3: { pal: SEAFIN, gloss: 0.2 }, 4: { pal: SEAFIN, bias: -1 }, 5: { pal: INK, flat: true },
    6: { pal: WHITE, flat: true }, 7: { pal: BLUSH, flat: true }, 8: { pal: SEA, bias: 2.5 },
  });
  c.ox = Math.round(16 * SK); c.oy = Math.round(22 * SK);
  cache.set(k, c);
  return c;
}

// Swims the heart outline around (cx, cy) at depth z, starting at phase u.
class HeartSwimmer {
  constructor(kind, o) {
    this.kind = kind;
    this.cx = o.cx; this.cy = o.cy; this.z = o.z; this.s = o.s;
    this.u = o.u; this.speed = o.speed ?? 0.09;
    this.len = kind === 'dolphin' ? 100 : 18;
    const [hx, hy] = heartPoint(this.u * TAU);
    this.x = o.fromX ?? this.cx + hx * this.s; this.y = o.fromY ?? this.cy + hy * this.s;
    this.enter = 0; this.t = Math.random() * 5; this.face = 1; this.ang = 0; this.hopT = 0;
  }
  react() { this.hopT = 1; }
  update(dt, aq) {
    this.t += dt;
    this.enter = Math.min(1, this.enter + dt * 0.35);
    this.hopT = Math.max(0, this.hopT - dt * 2);
    this.u = (this.u + this.speed * dt) % 1;
    const [hx, hy] = heartPoint(this.u * TAU);
    const tx = this.cx + hx * this.s, ty = this.cy + hy * this.s;
    const k = this.enter < 1 ? dt * 1.5 : 1;
    const nx = this.x + (tx - this.x) * k, ny = this.y + (ty - this.y) * k;
    const vx = nx - this.x, vy = ny - this.y;
    if (Math.abs(vx) > 0.01) this.face += ((vx > 0 ? 1 : -1) - this.face) * Math.min(1, dt * 4);
    if (Math.hypot(vx, vy) > 0.01) this.ang += (Math.atan2(vy, Math.abs(vx)) - this.ang) * Math.min(1, dt * 5);
    this.x = nx; this.y = ny;
    if (Math.random() < dt * 8) aq.fx.add({ kind: 'spark', x: this.x - this.face * 6, y: this.y, z: this.z, vx: 0, vy: -4, age: 0, life: 0.9, size: 1 + (Math.random() * 2 | 0), col: Math.random() < 0.5 ? '#ffffff' : '#ffe6a0' });
  }
  draw(ctx, aq) {
    const [sx, sy] = aq.toScreen(this.x, this.y, this.z);
    const dolphin = this.kind === 'dolphin';
    const img = dolphin ? dolphinSprite(Math.floor(this.t * 7) % DOLPHIN_FRAMES) : seahorseSprite(Math.floor(this.t * 10) % 4);
    let f = this.face;
    if (Math.abs(f) < 0.2) f = 0.2 * Math.sign(f || 1);
    const a = dolphin ? this.ang * f : Math.sin(this.t * 2) * 0.12;
    const bob = dolphin ? 0 : Math.sin(this.t * 3) * 1.5;
    const hop = Math.sin(this.hopT * Math.PI) * -6;
    const c = Math.cos(a), s = Math.sin(a);
    const k = 1;
    ctx.setTransform(f * c * k, f * s * k, -s * k, c * k, Math.round(sx), Math.round(sy + bob + hop));
    ctx.drawImage(img, -img.ox, -img.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// Two dolphins and two seahorses spaced around one heart.
export function heartFriends(cx, cy, z, s, fromX) {
  return [['dolphin', 0], ['seahorse', 0.25], ['dolphin', 0.5], ['seahorse', 0.75]].map(([k, u], i) =>
    new HeartSwimmer(k, { cx, cy, z: z + i * 0.005, s, u, fromX: fromX + (i % 2 ? 60 : -60), fromY: cy - 140 }));
}
