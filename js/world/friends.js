// Guests for the happy ending: dolphins and seahorses that swim a heart
// together around the couple, leaving sparkles behind them.
import { TAU, makeCanvas, heartPoint } from '../util.js';

const cache = new Map();
function px(rows, pal) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = makeCanvas(w, h), x = c.ctx;
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { x.fillStyle = pal[row[i]]; x.fillRect(i, j, 1, 1); } });
  return c;
}

// Mask-based pixel art: fill shapes into a mask, then shade and outline it.
function shaped(w, h, fill, shade) {
  const c = makeCanvas(w, h), x = c.ctx;
  const m = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = fill(i + 0.5, j + 0.5);
  const d = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = m[j * w + i];
    const edge = !v && ((i > 0 && m[j * w + i - 1]) || (i < w - 1 && m[j * w + i + 1]) || (j > 0 && m[(j - 1) * w + i]) || (j < h - 1 && m[(j + 1) * w + i]));
    const col = v ? shade(i, j, v) : edge ? [16, 24, 50] : null;
    if (!col) continue;
    const o = (j * w + i) * 4;
    d.data[o] = col[0]; d.data[o + 1] = col[1]; d.data[o + 2] = col[2]; d.data[o + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

// A bottlenose dolphin facing right, with a curved dorsal fin, a beak and a
// smile; frame 0..3 beats the tail flukes up and down.
function dolphinSprite(frame) {
  const k = 'd' + frame;
  if (cache.has(k)) return cache.get(k);
  const W = 40, H = 22, cy = 12, beat = [0, 2, 0, -2][frame];
  const c = shaped(W, H, (x, y) => {
    // body: a long teardrop from tail (x 6) to melon (x 32)
    const u = (x - 6) / 26;
    if (u >= 0 && u <= 1) {
      const half = Math.sin(Math.PI * Math.pow(u, 0.7)) * 5.2 + 0.6;
      const mid = cy + (u - 0.5) * -1 + beat * (1 - u) * 0.6;
      if (Math.abs(y - mid) < half) return y > mid + half * 0.25 ? 2 : 1;
    }
    // beak
    if (x >= 31 && x < 37 && y > cy + 0.3 && y < cy + 2.8) return y > cy + 1.6 ? 2 : 1;
    // dorsal fin, leaning back
    const fx = x - 17, fy = cy - 5 - y;
    if (fy > 0 && fy < 5 && fx > -fy * 0.9 && fx < 4 - fy * 1.1) return 1;
    // flipper
    const px = x - 22, py = y - (cy + 4);
    if (py > 0 && py < 4 && px < 1 && px > -3 - py * 0.3) return 1;
    // flukes at the tail, moving with the beat
    const tx = x - 5, ty = y - (cy + beat);
    if (tx > -5 && tx < 2 && Math.abs(ty) < 1.2 + (2 - tx) * 0.55 && Math.abs(ty) > (tx + 5) * 0.2 - 1) return 1;
    return 0;
  }, (i, j, v) => (v === 2 ? [214, 234, 255] : j < cy - 3 ? [70, 102, 160] : [104, 142, 204]));
  const x = c.ctx;
  x.fillStyle = '#10182e'; x.fillRect(29, cy - 2, 2, 2);
  x.fillStyle = '#ffffff'; x.fillRect(29, cy - 2, 1, 1);
  x.fillStyle = '#10182e'; x.fillRect(31, cy + 2, 4, 1);
  c.ox = 20; c.oy = cy;
  cache.set(k, c);
  return c;
}

// A seahorse facing right; frame 0..3 flutters the back fin.
function seahorseSprite(frame) {
  const k = 's' + frame;
  if (cache.has(k)) return cache.get(k);
  const fin = frame % 2 ? 'f' : 'F';
  const rows = [
    '...kk.....',
    '..kyyk....',
    '..kyykkkk.',
    '.kyyyyyyyk',
    '.kyyekkkk.',
    `k${fin}kyyk....`,
    `k${fin}kyyyk...`,
    `.k${fin}yyyyk..`,
    '..kyyyyk..',
    '..kyyyyk..',
    '...kyyyk..',
    '....kyyk..',
    '..kk.kyk..',
    '.kyk.kyk..',
    '.kyykyyk..',
    '..kyyyk...',
    '...kkk....',
  ];
  const pal = { k: '#5a2a10', y: '#ffb040', e: '#1a1020', f: '#ffe08a', F: '#ffd060' };
  const c = px(rows, pal);
  c.ox = 5; c.oy = 8;
  cache.set(k, c);
  return c;
}

// Swims the heart outline around (cx, cy) at depth z, starting at phase u.
class HeartSwimmer {
  constructor(kind, o) {
    this.kind = kind;
    this.cx = o.cx; this.cy = o.cy; this.z = o.z; this.s = o.s;
    this.u = o.u; this.speed = o.speed ?? 0.09;
    this.len = kind === 'dolphin' ? 36 : 16;
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
    const k = dolphin ? 1 : 1.5; // seahorses are tiny: draw them bigger
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
