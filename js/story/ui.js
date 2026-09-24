// UI-layer art: message bottle, parchment letter, bubble buttons, speaker
// icon, and full-screen transitions (fish-school sweep, bubble curtain).
import { TAU, clamp, lerp, R, rng, Buf, hex, ramp, bayer, hash2, fbm, makeCanvas, ease, mixRGB } from '../util.js';
import { fishSprite } from '../art/fish.js';
import { bubbleSprite, heartSprite } from '../world/fx.js';
import { drawText, textWidth, LINE_H } from '../font.js';

// ------------------------------------------------------------------ bottle --
const GLASS = ramp(['#0e3a52', '#1c6a7e', '#34a0a8', '#6ad2cc', '#b8f4ea'], 5);
const bottleCache = new Map();
export function bottleSprite(ang) {
  const k = Math.round(ang * 20);
  if (bottleCache.has(k)) return bottleCache.get(k);
  ang = k / 20;
  const box = 52, K = 1.35;
  const b = new Buf(box, box);
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let py = 0; py < box; py++) for (let px = 0; px < box; px++) {
    const x0 = px + 0.5 - box / 2, y0 = py + 0.5 - box / 2;
    const u = (x0 * c + y0 * s) / K, v = (-x0 * s + y0 * c) / K; // local: u along bottle (cork at +u)
    let col = null, a = 255;
    const bodyHalf = 5.4;
    if (u > -13 && u < 5 && Math.abs(v) < bodyHalf - (u < -11.5 ? (u + 11.5) * -1.6 : 0)) {
      const t = (v + bodyHalf) / (bodyHalf * 2);
      let l = 1.2 + (1 - Math.abs(t - 0.35) * 2.2) * 2.4;
      col = GLASS[clamp(Math.round(l + (bayer(px, py) - 0.5) * 0.8), 0, 4)];
      a = 200;
      // rolled scroll inside
      if (u > -10 && u < 2 && Math.abs(v) < 2.6) { col = hex(Math.abs(v) > 1.9 ? '#b89868' : v < -0.6 ? '#fff4dc' : '#ecd8b0'); a = 255; if (Math.abs(u + 4) < 0.7) col = hex('#d8305a'); }
      if (Math.abs(t - 0.2) < 0.09 && u > -11 && u < 3) { col = hex('#e8fffa'); a = 255; }
    } else if (u >= 5 && u < 8 && Math.abs(v) < bodyHalf - (u - 5) * 1.1) {
      col = GLASS[2]; a = 210;
    } else if (u >= 8 && u < 11.5 && Math.abs(v) < 2.2) {
      col = GLASS[3]; a = 220;
      if (u > 9.5) { col = hex(v < 0 ? '#c49a62' : '#8e6a3c'); a = 255; }
    } else if (u >= 11.5 && u < 13.5 && Math.abs(v) < 2.4) {
      col = hex(v < -0.8 ? '#d8b078' : '#9c7444'); a = 255;
    }
    if (col) b.set(px, py, col, a);
  }
  // outline for readability
  const out = new Buf(box, box);
  out.d.set(b.d);
  for (let y = 0; y < box; y++) for (let x = 0; x < box; x++) {
    if (b.alpha(x, y)) continue;
    if (b.alpha(x + 1, y) || b.alpha(x - 1, y) || b.alpha(x, y + 1) || b.alpha(x, y - 1)) out.set(x, y, [6, 26, 40], 200);
  }
  const cv = out.toCanvas();
  cv.o = box / 2;
  bottleCache.set(k, cv);
  return cv;
}

// ------------------------------------------------------------------ paper --
const PAPER = ramp(['#b89464', '#d6b886', '#e9d4a8', '#f4e6c6', '#fbf3e0'], 5);
export function makePaper(w, h) {
  const b = new Buf(w, h);
  const r = rng(7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    let l = 3.2 + (fbm(x * 0.08, y * 0.08, 3, 3) - 0.5) * 1.2;
    if (edge < 1) l = 0.6; else if (edge < 3) l -= 1.2; else if (edge < 6) l -= 0.45;
    if (hash2(x, y, 5) < 0.03) l -= 0.6;
    b.set(x, y, PAPER[clamp(Math.round(l + (bayer(x, y) - 0.5) * 0.9), 0, 4)]);
  }
  // inset decorative border with tiny hearts in the corners
  const ink = hex('#c9a27a');
  for (let x = 7; x < w - 7; x++) { if ((x & 1) === 0) { b.set(x, 7, ink); b.set(x, h - 8, ink); } }
  for (let y = 7; y < h - 7; y++) { if ((y & 1) === 0) { b.set(7, y, ink); b.set(w - 8, y, ink); } }
  const hs = ['.#.#.', '#####', '.###.', '..#..'];
  const hc = hex('#e0708e');
  for (const [cx, cy] of [[5, 5], [w - 10, 5], [5, h - 10], [w - 10, h - 10]])
    hs.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === '#') b.set(cx + xx, cy + yy, hc); }));
  void r;
  return b.toCanvas();
}

export function drawRoll(ctx, x, y, w) {
  // rolled scroll end (cylinder)
  const cols = ['#6e5030', '#a8834e', '#d2b27c', '#efdcae', '#d2b27c', '#a8834e', '#6e5030'];
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - 3, y + i - 3, w + 6, 1); });
  ctx.fillStyle = '#4a321c';
  ctx.fillRect(x - 4, y - 3, 1, 7);
  ctx.fillRect(x + w + 3, y - 3, 1, 7);
  ctx.fillStyle = '#d8305a';
  ctx.fillRect(x + Math.round(w / 2) - 1, y - 3, 3, 7);
}

export function drawSeal(ctx, x, y, t) {
  const R0 = 7;
  for (let dy = -R0; dy <= R0; dy++) for (let dx = -R0; dx <= R0; dx++) {
    const d = Math.hypot(dx, dy) + Math.sin(Math.atan2(dy, dx) * 7) * 0.6;
    if (d > R0) continue;
    ctx.fillStyle = d > R0 - 1.2 ? '#7e1030' : dy < -2 && dx < 0 ? '#e84a6e' : '#c2284e';
    ctx.fillRect(x + dx, y + dy, 1, 1);
  }
  const h = heartSprite(1);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(h, x - h.ox, y - h.oy);
  ctx.globalAlpha = 1;
  void t;
}

// ----------------------------------------------------------------- button --
export function drawBubbleButton(ctx, b, t) {
  const wob = Math.sin(t * 3 + b.ph) * 0.8 * (b.hover ? 1.5 : 1);
  const w = Math.round(b.w + (b.hover ? 4 : 0)), h = Math.round(b.h + (b.hover ? 2 : 0));
  const x = Math.round(b.x - w / 2), y = Math.round(b.y - h / 2 + wob);
  const pal = b.pink
    ? { fill: 'rgba(255,90,150,0.55)', rim: '#ffd0e4', dark: '#9a1a52', hi: '#ffffff' }
    : { fill: 'rgba(90,170,255,0.35)', rim: '#cfeaff', dark: '#1a4a8a', hi: '#ffffff' };
  const r = Math.floor(h / 2);
  ctx.globalAlpha = b.alpha ?? 1;
  // body
  for (let yy = 0; yy < h; yy++) {
    const dy = yy - (h - 1) / 2;
    const inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillStyle = pal.fill;
    ctx.fillRect(x + inset, y + yy, w - inset * 2, 1);
    ctx.fillStyle = yy < h / 2 ? pal.rim : pal.dark;
    ctx.fillRect(x + inset, y + yy, 1, 1);
    ctx.fillRect(x + w - inset - 1, y + yy, 1, 1);
    if (yy === 0 || yy === h - 1) { ctx.fillRect(x + inset, y + yy, w - inset * 2, 1); }
  }
  ctx.fillStyle = pal.hi;
  ctx.fillRect(x + r - 1, y + 2, Math.max(2, Math.round(w * 0.25)), 1);
  ctx.fillRect(x + r - 2, y + 3, 1, 1);
  drawText(ctx, b.label, b.x, y + Math.round((h - 7) / 2), { align: 'center', color: '#ffffff', shadow: pal.dark, alpha: b.alpha ?? 1 });
  ctx.globalAlpha = 1;
}

export function drawSpeaker(ctx, x, y, on, hover) {
  const rows = ['...#....', '..##..#.', '####.#.#', '####.#.#', '####.#.#', '..##..#.', '...#....'];
  const rowsOff = ['...#....', '..##....', '####.#.#', '####..#.', '####.#.#', '..##....', '...#....'];
  const rr = on ? rows : rowsOff;
  ctx.fillStyle = hover ? '#ffffff' : 'rgba(170,215,255,0.75)';
  rr.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === '#') ctx.fillRect(x + xx, y + yy, 1, 1); }));
}

// -------------------------------------------------------------- transitions --
// A massive school + deep-water wall sweeping right -> left across the screen.
export class Sweep {
  constructor(W, H, dur = 2.6) {
    this.W = W; this.H = H; this.dur = dur; this.t = 0; this.done = false; this.fired = false;
    const r = rng((Math.random() * 1e6) | 0);
    this.fish = [];
    const band = W * 1.1;
    this.band = band;
    for (let i = 0; i < 260; i++) {
      const depth = r();
      const L = depth < 0.15 ? 60 + ((r() * 3) | 0) * 12 : depth < 0.5 ? 34 + ((r() * 3) | 0) * 4 : 18 + ((r() * 3) | 0) * 3;
      this.fish.push({ u: r() * (band + 160) - 80, y: r() * H, L, depth, ph: r() * 8, v: 0.85 + r() * 0.3, pi: 2 + (r() < 0.2 ? r.sign() : 0) });
    }
    this.fish.sort((a, b) => b.depth - a.depth);
  }
  // front edge position in screen x
  get front() { return lerp(this.W + 40, -this.band - 120, ease.inOutSine(clamp(this.t / this.dur))); }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.done = true; }
  covered() { return this.t / this.dur >= 0.5; }
  draw(ctx) {
    const f = this.front;
    const W = this.W, H = this.H;
    // water wall body with ragged edges
    const x0 = f + 40, x1 = f + this.band - 40;
    for (let y = 0; y < H; y += 2) {
      const e0 = Math.sin(y * 0.09 + this.t * 5) * 14 + Math.sin(y * 0.23) * 6;
      const e1 = Math.sin(y * 0.07 - this.t * 4) * 16 + Math.sin(y * 0.19 + 2) * 7;
      const a = Math.round(clamp(x0 + e0, -10, W + 10)), b = Math.round(clamp(x1 + e1, -10, W + 10));
      if (b > a) {
        ctx.fillStyle = y % 4 === 0 ? '#0b3a8e' : '#0a3480';
        ctx.fillRect(a, y, b - a, 2);
      }
      // dithered fringes
      ctx.fillStyle = '#1452b0';
      for (let k = 0; k < 14; k += 2) {
        if (((y >> 1) + k) % 3 === 0) {
          ctx.fillRect(Math.round(x0 + e0 - 14 + k), y, 1, 2);
          ctx.fillRect(Math.round(x1 + e1 + k), y, 1, 2);
        }
      }
    }
    for (const fi of this.fish) {
      const x = f + fi.u * fi.v + (1 - fi.v) * this.band * 0.5;
      if (x < -120 || x > W + 120) continue;
      const img = fishSprite('trevally', fi.L, Math.floor(this.t * 14 + fi.ph) % 8, fi.pi, (Math.floor(this.t * 6 + fi.ph) % 9 === 0) ? 1 : 0);
      ctx.globalAlpha = fi.depth > 0.5 ? 0.75 : 1;
      // the wall travels left and the sprites are drawn nose-left: no mirroring
      ctx.setTransform(1, 0, 0, 1, Math.round(x), Math.round(fi.y + Math.sin(this.t * 3 + fi.ph) * 3));
      ctx.drawImage(img, -img.ox, -img.oy);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// Bubble curtain rising from the bottom (the "dive in" moment): an arched,
// wobbling wall of foam packed with bubbles, sparkling at its crest, with the
// bubbles at the top edge popping as it clears the screen.
export class BubbleCurtain {
  constructor(W, H, dur = 3) {
    this.W = W; this.H = H; this.dur = dur; this.t = 0; this.done = false;
    this.b = [];
    const n = Math.round((W * H) / 120);
    for (let i = 0; i < n; i++) {
      const rr = Math.random();
      const r = rr < 0.45 ? 1 + ((Math.random() * 2) | 0) : rr < 0.82 ? 3 + ((Math.random() * 3) | 0) : 6 + ((Math.random() * 6) | 0);
      this.b.push({ x: Math.random() * W, u: Math.pow(Math.random(), 0.7) * 1.5, r, w: Math.random() * TAU, sp: 0.75 + Math.random() * 0.6 });
    }
    this.sparks = [];
    for (let i = 0; i < Math.round(W / 5); i++) this.sparks.push({ x: Math.random() * W, ph: Math.random() * TAU, d: Math.random() * 18 });
  }
  get k() { return clamp(this.t / this.dur); }
  covered() { return this.k >= 0.5; }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.done = true; }
  front(x) {
    const base = lerp(this.H + 60, -this.H * 1.7, ease.inOutCubic(this.k));
    const u = x / this.W;
    return base - Math.sin(u * Math.PI) * this.H * 0.16 + Math.sin(x * 0.045 + this.t * 7) * 5 + Math.sin(x * 0.11 - this.t * 5) * 2.5;
  }
  draw(ctx) {
    const W = this.W, H = this.H;
    const len = H * 1.35;
    // foam body: a wavy-edged polygon filled with a cool bright gradient
    const mid = this.front(W / 2);
    const g = ctx.createLinearGradient(0, mid - H * 0.2, 0, mid + len);
    g.addColorStop(0, 'rgba(200,245,255,0)');
    g.addColorStop(0.08, 'rgba(210,248,255,0.95)');
    g.addColorStop(0.22, 'rgba(120,205,255,0.92)');
    g.addColorStop(0.7, 'rgba(60,150,235,0.9)');
    g.addColorStop(1, 'rgba(40,110,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, this.front(0));
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, this.front(x));
    for (let x = W; x >= 0; x -= 4) ctx.lineTo(x, this.front(x) + len + Math.sin(x * 0.06 + this.t * 4) * 10);
    ctx.closePath();
    ctx.fill();
    // bubbles, brighter and bigger toward the crest
    for (const b of this.b) {
      const x = b.x + Math.sin(this.t * 3 + b.w) * 3;
      const y = this.front(x) + (b.u * H) / b.sp + Math.sin(this.t * 4 + b.w) * 2;
      if (y < -14 || y > H + 14) continue;
      if (y < 6 && b.r >= 3) {
        // pop at the top of the screen
        ctx.strokeStyle = 'rgba(230,250,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, b.r + 2 + (6 - y) * 0.4, 0, TAU); ctx.stroke();
        continue;
      }
      const s = bubbleSprite(b.r);
      ctx.drawImage(s, Math.round(x) - s.o, Math.round(y) - s.o);
    }
    // glitter along the crest
    ctx.fillStyle = '#ffffff';
    for (const sp of this.sparks) {
      const y = this.front(sp.x) + sp.d;
      if (y < 0 || y > H) continue;
      if (Math.sin(this.t * 9 + sp.ph) > 0.4) {
        ctx.fillRect(Math.round(sp.x), Math.round(y), 1, 1);
        if (Math.sin(this.t * 9 + sp.ph) > 0.9) { ctx.fillRect(Math.round(sp.x) - 1, Math.round(y), 3, 1); ctx.fillRect(Math.round(sp.x), Math.round(y) - 1, 1, 3); }
      }
    }
  }
}

// A soft flood of light from the centre with drifting sparkles: used to
// move between galleries so it feels like walking through a dream.
export class LightBloom {
  constructor(W, H, dur = 2.6, col = [200, 230, 255]) {
    this.W = W; this.H = H; this.dur = dur; this.t = 0; this.done = false; this.col = col;
    this.sp = [];
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU;
      this.sp.push({ a, r: Math.random(), v: 0.4 + Math.random() * 0.9, s: Math.random() < 0.2 ? 2 : 1, ph: Math.random() * TAU });
    }
  }
  get k() { return clamp(this.t / this.dur); }
  covered() { return this.k >= 0.5; }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.done = true; }
  draw(ctx) {
    const W = this.W, H = this.H, k = this.k;
    const a = Math.sin(k * Math.PI);
    const R0 = Math.hypot(W, H) * 0.62;
    const r = R0 * (0.15 + 0.85 * ease.outCubic(Math.min(1, k * 1.6)));
    const [cr, cg, cb] = this.col;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.45, `rgba(${cr},${cg},${cb},${a * 0.95})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},${a * (k < 0.5 ? 0.0 : 0.85)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (k > 0.35 && k < 0.65) { ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(k - 0.5) / 0.15})`; ctx.fillRect(0, 0, W, H); }
    for (const p of this.sp) {
      const d = (p.r + this.t * p.v * 0.5) % 1;
      const x = W / 2 + Math.cos(p.a) * d * W * 0.7, y = H * 0.45 + Math.sin(p.a) * d * H * 0.7;
      ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(this.t * 5 + p.ph)));
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(Math.round(x), Math.round(y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }
}

export { textWidth, LINE_H };

// ------------------------------------------------------------ bubble title --
// One bubble of a bubble-lettered word: a dark ring so it reads over the
// bright tank, a pale glassy fill, and a white glint.
const letterCache = new Map();
export function bubbleLetter(r) {
  let c = letterCache.get(r);
  if (c) return c;
  const s = r * 2 + 5, o = s / 2;
  const b = new Buf(s, s);
  const ring = hex('#08265e'), rim = hex('#7fd0ff'), fill = hex('#d6f2ff'), deep = hex('#a8e0ff'), hi = [255, 255, 255];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x + 0.5 - o, y + 0.5 - o);
    if (d <= r + 1.2) b.set(x, y, ring, 235);
    if (d <= r + 0.3) b.set(x, y, d > r - 0.7 ? rim : y + 0.5 > o + r * 0.2 ? deep : fill, 255);
  }
  const g = Math.round(o - r * 0.45 - 0.5);
  b.set(g, g, hi, 255);
  if (r >= 3) { b.set(g + 1, g, hi, 200); b.set(g, g + 1, hi, 200); }
  c = b.toCanvas();
  c.o = Math.floor(s / 2);
  letterCache.set(r, c);
  return c;
}

// A little fish whose body is a heart: the point is its nose, the two lobes
// are its back, a tail wags behind and an eye peeks out near the front.
export function heartFish(size, t) {
  const tail = size * 0.55, w = Math.ceil(size * 2.2 + tail + 4), h = Math.ceil(size * 2.3 + 4);
  const c = makeCanvas(w, h), x = c.ctx;
  const cx = tail + size * 1.1 + 2, cy = h / 2;
  const d = x.createImageData(w, h);
  const body = hex('#ff5a8a'), shadow = hex('#d8336a'), light = hex('#ffb4cc'), ink = hex('#08265e'), fin = hex('#ff8ab0');
  const wag = Math.sin(t * 9) * 0.45;
  const inside = (px, py) => {
    // heart with its tip pointing right, lobes to the left
    const u = (px - cx) / size, v = (py - cy) / size;
    const X = v * 1.05, Y = -u * 1.05 + 0.2;
    const q = X * X + Y * Y - 1;
    if (q * q * q - X * X * Y * Y * Y <= 0) return 1;
    // the tail: a fan behind the lobes, swinging
    const tx = px - (cx - size * 1.05), ty = py - cy - wag * (cx - size * 1.05 - px) * 0.8;
    if (tx < 0 && tx > -tail && Math.abs(ty) < (-tx / tail) * size * 0.75 + 1) return 2;
    // a small dorsal fin
    const fx = px - (cx - size * 0.1), fy = py - (cy - size * 1.02);
    if (fy < 0 && fy > -size * 0.35 && fx > -size * 0.35 && fx < size * 0.25 + fy * 0.6) return 2;
    return 0;
  };
  const m = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) m[py * w + px] = inside(px + 0.5, py + 0.5);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const k = m[py * w + px];
    const i = (py * w + px) * 4;
    let col = null;
    if (k) {
      const edge = !m[py * w + px - 1] || !m[py * w + px + 1] || !m[(py - 1) * w + px] || !m[(py + 1) * w + px];
      if (edge) col = ink;
      else if (k === 2) col = fin;
      else col = py > cy + size * 0.35 ? shadow : (px < cx - size * 0.2 && py < cy - size * 0.2) ? light : body;
    }
    if (col) { d.data[i] = col[0]; d.data[i + 1] = col[1]; d.data[i + 2] = col[2]; d.data[i + 3] = 255; }
  }
  x.putImageData(d, 0, 0);
  // eye and a blush near the nose
  const ex = Math.round(cx + size * 0.28), ey = Math.round(cy - size * 0.28);
  x.fillStyle = '#ffffff'; x.fillRect(ex - 1, ey - 1, 3, 3);
  x.fillStyle = '#08265e'; x.fillRect(ex, ey, 2, 2);
  x.fillStyle = '#ffffff'; x.fillRect(ex, ey, 1, 1);
  x.fillStyle = '#ff9ab8'; x.fillRect(Math.round(cx + size * 0.1), Math.round(cy + size * 0.12), 2, 1);
  c.mouth = [Math.round(cx + size * 1.0), Math.round(cy)];
  c.cx = cx; c.cy = cy;
  return c;
}
