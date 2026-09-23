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
      ctx.setTransform(-1, 0, 0, 1, Math.round(x), Math.round(fi.y + Math.sin(this.t * 3 + fi.ph) * 3));
      ctx.drawImage(img, -img.ox, -img.oy);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// Bubble curtain rising from the bottom (the "dive in" moment).
export class BubbleCurtain {
  constructor(W, H, dur = 2.2) {
    this.W = W; this.H = H; this.dur = dur; this.t = 0; this.done = false;
    this.b = [];
    const n = Math.round((W * H) / 260);
    for (let i = 0; i < n; i++) {
      const rr = Math.random();
      this.b.push({ x: Math.random() * W, u: Math.random() * 1.4, r: rr < 0.5 ? 1 + ((Math.random() * 2) | 0) : rr < 0.85 ? 3 + ((Math.random() * 3) | 0) : 6 + ((Math.random() * 5) | 0), w: Math.random() * TAU, sp: 0.8 + Math.random() * 0.5 });
    }
  }
  get k() { return clamp(this.t / this.dur); }
  covered() { return this.k >= 0.5; }
  update(dt) { this.t += dt; if (this.t >= this.dur) this.done = true; }
  draw(ctx) {
    const W = this.W, H = this.H, k = this.k;
    const front = lerp(H + 30, -H * 1.5, ease.inOutSine(k));
    // bright foam body
    const top = front, bot = front + H * 1.25;
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, bot); y++) {
      const d = Math.min(y - top, bot - y);
      const a = clamp(d / 60);
      ctx.fillStyle = `rgba(${Math.round(lerp(120, 200, a))},${Math.round(lerp(200, 240, a))},255,${a * 0.92})`;
      ctx.fillRect(0, y, W, 1);
    }
    for (const b of this.b) {
      const y = front + b.u * H * 0.9 / b.sp + Math.sin(this.t * 4 + b.w) * 2;
      if (y < -12 || y > H + 12) continue;
      const s = bubbleSprite(b.r);
      ctx.drawImage(s, Math.round(b.x + Math.sin(this.t * 3 + b.w) * 3) - s.o, Math.round(y) - s.o);
    }
  }
}

export { textWidth, LINE_H };
