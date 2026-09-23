// Particles: bubbles, marine snow, sparkles, hearts, glow blobs.
import { TAU, clamp, lerp, R, Buf, hex, makeCanvas } from '../util.js';

// ---------------------------------------------------------------- sprites --
const bubbleCache = [];
export function bubbleSprite(r) {
  r = clamp(Math.round(r), 1, 12);
  if (bubbleCache[r]) return bubbleCache[r];
  const s = r * 2 + 3;
  const b = new Buf(s, s);
  const c = s / 2;
  const rim = [200, 240, 255], mid = [120, 200, 255], hi = [255, 255, 255];
  if (r === 1) {
    b.set(1, 1, mid, 200); b.set(2, 1, rim, 230); b.set(1, 2, rim, 230); b.set(2, 2, mid, 150);
  } else {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > r + 0.5) continue;
      if (d > r - 0.6) b.set(x, y, rim, d > r ? 150 : 235);
      else b.set(x, y, mid, 38 + (y > c ? 30 : 0));
    }
    const hx = Math.round(c - r * 0.45), hy = Math.round(c - r * 0.45);
    b.set(hx, hy, hi, 255);
    if (r >= 3) { b.set(hx + 1, hy, hi, 200); b.set(hx, hy + 1, hi, 200); }
    if (r >= 5) b.set(Math.round(c + r * 0.4), Math.round(c + r * 0.35), rim, 220);
  }
  const cv = b.toCanvas();
  cv.o = Math.floor(s / 2);
  bubbleCache[r] = cv;
  return cv;
}

const HEARTS = [
  ['.#.#.', '#####', '.###.', '..#..'],
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  ['.###.###.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  ['..###...###..', '.#####.#####.', '#############', '#############', '#############', '#############', '.###########.', '..#########..', '...#######...', '....#####....', '.....###.....', '......#......'],
];
const heartCache = new Map();
export function heartSprite(size, palette = 'pink') {
  const key = size + palette;
  if (heartCache.has(key)) return heartCache.get(key);
  const rows = HEARTS[clamp(size, 0, 3)];
  const w = rows[0].length, h = rows.length;
  const b = new Buf(w + 2, h + 2);
  const P = palette === 'pink'
    ? { out: hex('#7a1a4a'), dark: hex('#e0407e'), base: hex('#ff6aa6'), light: hex('#ffb3d4'), hi: hex('#ffffff') }
    : { out: hex('#1a3a7a'), dark: hex('#4a90e0'), base: hex('#8ccaff'), light: hex('#c8ecff'), hi: hex('#ffffff') };
  const on = (x, y) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] === '#';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (on(x, y)) {
      let c = P.base;
      if (y > h * 0.55 || x > w * 0.7) c = P.dark;
      if (!on(x, y - 1) || !on(x - 1, y)) c = P.light;
      b.set(x + 1, y + 1, c);
    } else if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) b.set(x + 1, y + 1, P.out, 230);
  }
  if (size >= 1) { b.set(2, 2 + (size > 1 ? 1 : 0), P.hi); if (size >= 2) b.set(3, 2, P.hi); }
  const cv = b.toCanvas();
  cv.ox = Math.floor((w + 2) / 2); cv.oy = Math.floor((h + 2) / 2);
  heartCache.set(key, cv);
  return cv;
}

const glowCache = new Map();
export function glowSprite(r, col) {
  const key = r + col;
  if (glowCache.has(key)) return glowCache.get(key);
  const s = r * 2;
  const c = makeCanvas(s, s);
  const g = c.ctx.createRadialGradient(r, r, 0, r, r, r);
  const [cr, cg, cb] = hex(col);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
  g.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.35)`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  c.ctx.fillStyle = g;
  c.ctx.fillRect(0, 0, s, s);
  glowCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- systems --
// Generic particle pool drawn in screen space (UI) or through a projector.
export class Particles {
  constructor() { this.list = []; }
  add(p) { this.list.push(p); return p; }
  clear() { this.list.length = 0; }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vx += (p.ax || 0) * dt; p.vy += (p.ay || 0) * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.wob) p.x += Math.sin(p.age * p.wobF + p.ph) * p.wob * dt;
    }
  }
  // proj(p) -> [sx, sy] or null
  draw(ctx, proj = null) {
    for (const p of this.list) {
      const t = p.age / p.life;
      let x = p.x, y = p.y;
      if (proj) { const s = proj(p); if (!s) continue; x = s[0]; y = s[1]; }
      const fadeIn = p.fin ? clamp(p.age / p.fin) : 1;
      const a = (p.fade === false ? 1 : 1 - Math.pow(t, 3)) * fadeIn * (p.alpha ?? 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (p.kind === 'bubble') {
        const s = bubbleSprite(p.r);
        ctx.drawImage(s, Math.round(x) - s.o, Math.round(y) - s.o);
      } else if (p.kind === 'heart') {
        const s = heartSprite(p.size, p.pal);
        const bob = Math.round(Math.sin(p.age * 3 + p.ph) * 0.6);
        ctx.drawImage(s, Math.round(x) - s.ox, Math.round(y) - s.oy + bob);
      } else if (p.kind === 'spark') {
        const tw = Math.sin(t * Math.PI);
        const r = Math.round(p.size * tw);
        ctx.fillStyle = p.col || '#fff';
        const X = Math.round(x), Y = Math.round(y);
        ctx.fillRect(X, Y, 1, 1);
        if (r >= 1) { ctx.fillRect(X - r, Y, r * 2 + 1, 1); ctx.fillRect(X, Y - r, 1, r * 2 + 1); }
        if (r >= 3) { ctx.globalAlpha = a * 0.5; ctx.fillRect(X - 1, Y - 1, 3, 3); }
      } else if (p.kind === 'dot') {
        ctx.fillStyle = p.col || '#fff';
        ctx.fillRect(Math.round(x), Math.round(y), p.size || 1, p.size || 1);
      } else if (p.kind === 'glow') {
        const s = glowSprite(p.r, p.col);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(s, Math.round(x - p.r), Math.round(y - p.r));
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'ring') {
        // cartoon impact ring: a thin circle that expands and thins out
        const r = (p.r0 || 2) + (p.r1 || 30) * (1 - Math.pow(1 - t, 2));
        ctx.strokeStyle = p.col || '#cfeaff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'star') {
        // four-point twinkle that spins up then shrinks away
        const tw = Math.sin(t * Math.PI);
        const r = (p.size || 4) * tw;
        const a2 = (p.spin || 0) + p.age * (p.spinF || 3);
        ctx.strokeStyle = p.col || '#fff6c0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const an = a2 + (k * Math.PI) / 2;
          ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
          ctx.lineTo(Math.round(x + Math.cos(an) * r) + 0.5, Math.round(y + Math.sin(an) * r) + 0.5);
        }
        ctx.stroke();
      } else if (p.kind === 'sprite') {
        ctx.drawImage(p.img, Math.round(x - p.img.width / 2), Math.round(y - p.img.height / 2));
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function burstSparks(sys, x, y, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, sp = (opts.speed || 40) * (0.3 + R() * 0.7);
    sys.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, age: 0, life: (opts.life || 0.9) * (0.6 + R() * 0.8), size: opts.size || (1 + (R() * 3) | 0), col: opts.col || (R() < 0.5 ? '#ffffff' : '#ffd6ec') });
  }
}

export function popRing(sys, x, y, opts = {}) {
  sys.add({ kind: 'ring', x, y, vx: 0, vy: opts.vy || 0, age: 0, life: opts.life || 0.55, r0: opts.r0 ?? 2, r1: opts.r1 ?? 26, col: opts.col || '#cfeaff' });
}

export function burstStars(sys, x, y, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, sp = (opts.speed || 40) * (0.3 + R() * 0.8);
    sys.add({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.4, age: 0, life: (opts.life || 0.8) * (0.7 + R() * 0.6), size: opts.size || (3 + R() * 4), spin: R() * TAU, spinF: (R() - 0.5) * 8, col: opts.col || (R() < 0.5 ? '#fff6c0' : '#ffd6ec') });
  }
}

export function burstHearts(sys, x, y, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * (opts.spread ?? 2.4), sp = (opts.speed || 50) * (0.4 + R() * 0.8);
    sys.add({ kind: 'heart', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: opts.ay ?? -6, drag: 1.4, age: 0, life: (opts.life || 2.4) * (0.7 + R() * 0.6), size: opts.size ?? (R() < 0.6 ? 1 : R() < 0.7 ? 0 : 2), ph: R() * TAU, wob: 10, wobF: 3, pal: opts.pal || 'pink' });
  }
}
