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
const TOP = [[0, 1.4], [0.12, 2.8], [0.25, 5.4], [0.4, 9.4], [0.55, 11.4], [0.68, 11], [0.78, 9.6], [0.85, 7.4], [0.885, 4.6], [0.9, 3.2], [1, 1.9]];
const BOT = [[0, 1.3], [0.12, 2.5], [0.25, 4.6], [0.4, 8.2], [0.55, 9.8], [0.68, 9], [0.78, 7], [0.86, 4.6], [0.92, 2.8], [1, 1.6]];

// A big bottlenose dolphin facing right: a rounded melon over a short beak
// with a smile, a swept-back dorsal fin, a pectoral flipper, dark back fading
// through the flank to a pale belly, and flukes that beat up and down while
// the body flexes. frame 0..5.
function dolphinSprite(frame) {
  const k = 'd' + frame;
  if (cache.has(k)) return cache.get(k);
  const W = 88, H = 48, cy = 24, X0 = 9, L = 74;
  const beat = Math.sin((frame / DOLPHIN_FRAMES) * Math.PI * 2);
  const mid = (u) => cy + beat * 3.4 * Math.pow(1 - u, 2.2) - beat * 0.6 * u;
  const finBase = mid(0.57) - prof(TOP, 0.57);
  const fa = -beat * 0.55, ca = Math.cos(fa), sa = Math.sin(fa);
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    const u = (x - X0) / L;
    if (u >= 0 && u <= 1) {
      const t = prof(TOP, u), b = prof(BOT, u), mu = mid(u);
      if (y > mu - t && y < mu + b) {
        const c = mu + (b - t) / 2, half = (t + b) / 2;
        const d = Math.sqrt(Math.max(0, 1 - ((y - c) / half) ** 2)) * half * 1.15;
        const bellyLine = mu + b * (0.05 + 0.18 * Math.sin(u * 9 + 0.6));
        put(d, y > bellyLine && u > 0.26 && u < 0.95 ? 3 : y > mu - t * 0.3 ? 2 : 1);
      }
    }
    // swept-back dorsal fin
    const v = finBase - y;
    if (v > -1 && v < 11) {
      const x0 = X0 + 0.5 * L, x1 = X0 + 0.64 * L;
      const lead = x1 - v * 0.75 - v * v * 0.02, trail = x0 + 2 * (v / 11) - 4 * (v / 11) ** 2;
      if (x > trail && x < lead) put(3 + (11 - v) * 0.12, 1);
    }
    // pectoral flipper, angled back and down
    put(up(tube(x, y, X0 + 0.74 * L, mid(0.74) + 5, X0 + 0.64 * L, mid(0.64) + 12, 2.3, 0.8, 1), 5), 1);
    // flukes, tilting with the beat
    const lx0 = x - X0, ly0 = y - mid(0);
    const lx = lx0 * ca + ly0 * sa, ly = -lx0 * sa + ly0 * ca;
    if (lx > -9 && lx < 1.5 && Math.abs(ly) < 1 + -lx * 0.9 && !(lx < -5.8 && Math.abs(ly) < (-lx - 5.8) * 1.4)) put(2.2, 1);
    if (h <= 0) return null;
    // eye, blowhole and the smile along the beak
    const ue = 0.835, ex = X0 + ue * L, ey = mid(ue) - 1.4;
    if (((x - ex) / 1.4) ** 2 + ((y - ey) / 1.1) ** 2 < 1) return [h, Math.hypot(x - ex + 0.4, y - ey + 0.4) < 0.5 ? 6 : 5];
    if (u > 0.755 && u < 0.775 && y < mid(u) - prof(TOP, u) + 1.3) return [h, 5];
    if (u > 0.855 && u < 0.99) {
      const ym = mid(u) + 0.9 - Math.max(0, 0.9 - u) * 14;
      if (Math.abs(y - ym) < 0.5) return [h, 5];
    }
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: BACK, gloss: 0.8 }, 2: { pal: FLANK, gloss: 0.7 }, 3: { pal: BELLY, gloss: 0.5, bias: -0.4 },
    5: { pal: INK, flat: true }, 6: { pal: WHITE, flat: true },
  });
  c.ox = 44; c.oy = cy;
  cache.set(k, c);
  return c;
}

// A seahorse facing right: curled tail, ridged belly rings, a crown of
// little spikes, a long snout, and a see-through back fin that flutters.
function seahorseSprite(frame) {
  const k = 's' + frame;
  if (cache.has(k)) return cache.get(k);
  const SK = 0.6, W = Math.round(32 * SK), H = Math.round(48 * SK);   // small, but carrying the same detail
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
    this.len = kind === 'dolphin' ? 80 : 18;
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
