// Guests for the happy ending: dolphins and seahorses that swim a heart
// together around the couple, leaving sparkles behind them.
import { TAU, heartPoint, ramp, hex } from '../util.js';
import { sculpt, dome, tube } from '../art/sculpt.js';

const up = (hh, off) => (hh > 0 ? hh + off : -1);

const cache = new Map();
const SEA = ramp(['#3a1406', '#6a2a0c', '#9a4412', '#c8621c', '#e8862c', '#f8aa44', '#ffcc70', '#ffe8a8'], 8);
const SEAFIN = ramp(['#9a5a24', '#d89a52', '#f6cc86', '#fff0cc'], 4);
const DOLPH = ramp(['#141e3a', '#22325a', '#34497c', '#4a649c', '#6682ba', '#88a4d2', '#b0c8e8', '#dcebfa'], 8);
const BELLY = ramp(['#56668a', '#8a9cbc', '#b8c8e0', '#e2ecf8', '#ffffff'], 5);
const INK = [hex('#140a10')], WHITE = [hex('#ffffff')], BLUSH = [hex('#ff8aa6')];

// A bottlenose dolphin facing right: a smooth grey-blue back over a pale
// belly, a curved dorsal fin, a beak with a smile; frame 0..3 beats the
// flukes up and down.
function dolphinSprite(frame) {
  const k = 'd' + frame;
  if (cache.has(k)) return cache.get(k);
  const W = 46, H = 26, cy = 14, beat = [0, 1.6, 0, -1.6][frame];
  const field = (x, y) => {
    let h = -1, m = 0;
    const put = (hh, mm) => { if (hh > h) { h = hh; m = mm; } };
    const u = (x - 7) / 29;
    if (u >= 0 && u <= 1) {
      const half = Math.sin(Math.PI * Math.pow(u, 0.62)) * 6 + 0.8;
      const mid = cy - (u - 0.55) * 1.5 + beat * Math.pow(1 - u, 2) * 0.9;
      const d = dome(0, y - mid, 1, half, half * 1.3);
      if (d > 0) put(d, y > mid + half * 0.3 && u > 0.2 ? 2 : 1);
    }
    // beak
    put(up(tube(x, y, 35, cy + 1.2, 41, cy + 1.8, 2, 1.4, 1), 1), y > cy + 1.9 ? 2 : 1);
    // curved dorsal fin leaning back
    const fx = x - 19, fy = cy - 5.5 - y;
    if (fy > -1 && fy < 6 && fx > -fy * 1.1 - 1 && fx < 4.5 - fy * 0.8) put(3 + fy * 0.2, 1);
    // pectoral flipper
    put(up(tube(x, y, 25, cy + 4.5, 21.5, cy + 8.5, 1.8, 1.1, 1), 4), 1);
    // flukes, moving with the beat
    const tx = x - 5.5, ty = y - (cy + 1.4 + beat * 1.8);
    if (tx > -5.5 && tx < 2.5 && Math.abs(ty) < 1 + (2.5 - tx) * 0.62 && Math.abs(ty) > (tx + 5.5) * 0.25 - 1.4) put(2.2, 1);
    if (h <= 0) return null;
    // eye and smile
    if (Math.hypot(x - 32.5, y - (cy - 0.8)) < 1.4) return [h, Math.hypot(x - 32, y - (cy - 1.4)) < 0.6 ? 6 : 5];
    if (Math.abs(y - (cy + 2.6 - (x - 36) * 0.12)) < 0.55 && x > 35 && x < 40.5) return [h, 5];
    return [h, m];
  };
  const c = sculpt(W, H, field, { 1: { pal: DOLPH, gloss: 0.7, bias: -1.6 }, 2: { pal: BELLY, gloss: 0.4, bias: -0.3 }, 5: { pal: INK, flat: true }, 6: { pal: WHITE, flat: true } });
  c.ox = 22; c.oy = cy;
  cache.set(k, c);
  return c;
}

// A seahorse facing right: curled tail, ridged belly rings, a crown of
// little spikes, a long snout, and a see-through back fin that flutters.
function seahorseSprite(frame) {
  const k = 's' + frame;
  if (cache.has(k)) return cache.get(k);
  const W = 32, H = 48;
  const P = [[16, 11, 5.4], [14.5, 16.5, 3.8], [16.8, 22, 5.8], [17.4, 28, 5.9], [15, 33.5, 4.3], [12.4, 38, 3.2], [11, 42, 2.5], [8.4, 45, 2.1], [5, 44.4, 1.8], [3.4, 41.2, 1.5], [4.8, 38.4, 1.2], [7.4, 38.6, 1]];
  let acc = 0;
  const seg = P.slice(1).map((q, i) => { const p0 = P[i]; const l = Math.hypot(q[0] - p0[0], q[1] - p0[1]); const o = { a: p0, b: q, t0: acc, l }; acc += l; return o; });
  const flap = [0, 1, 2, 1][frame];
  const field = (x, y) => {
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
    if (Math.hypot(x - 18, y - 10) < 1.5) return [h, Math.hypot(x - 17.4, y - 9.4) < 0.6 ? 6 : 5];
    if (((x - 16.6) / 1.5) ** 2 + ((y - 13.6) / 0.9) ** 2 < 1) return [h, 7];
    // pale speckles
    if (((x * 7 + y * 13) % 17) < 0.9 && m === 1) return [h + 0.3, 8];
    return [h, m];
  };
  const c = sculpt(W, H, field, {
    1: { pal: SEA, gloss: 0.6 }, 3: { pal: SEAFIN, gloss: 0.2 }, 4: { pal: SEAFIN, bias: -1 }, 5: { pal: INK, flat: true },
    6: { pal: WHITE, flat: true }, 7: { pal: BLUSH, flat: true }, 8: { pal: SEA, bias: 2.5 },
  });
  c.ox = 16; c.oy = 22;
  cache.set(k, c);
  return c;
}

// Swims the heart outline around (cx, cy) at depth z, starting at phase u.
class HeartSwimmer {
  constructor(kind, o) {
    this.kind = kind;
    this.cx = o.cx; this.cy = o.cy; this.z = o.z; this.s = o.s;
    this.u = o.u; this.speed = o.speed ?? 0.09;
    this.len = kind === 'dolphin' ? 40 : 26;
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
    const img = dolphin ? dolphinSprite(Math.floor(this.t * 8) % 4) : seahorseSprite(Math.floor(this.t * 10) % 4);
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
