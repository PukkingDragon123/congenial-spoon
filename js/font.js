// Hand-built bitmap pixel font (cap height 7, descenders 2) plus a
// thresholded canvas-text fallback so any script (e.g. Thai) still renders
// as crisp pixels in the same style.
import { makeCanvas } from './util.js';

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['', '', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['', '', '.###', '#...', '#...', '#...', '.###'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['', '', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..'],
  g: ['', '', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['#', '', '#', '#', '#', '#', '#'],
  j: ['..#', '', '..#', '..#', '..#', '..#', '..#', '#.#', '.#.'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  m: ['', '', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['', '', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['', '', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['', '', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['', '', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['', '', '#.##', '##..', '#...', '#...', '#...'],
  s: ['', '', '.###', '#...', '.##.', '...#', '###.'],
  t: ['.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##'],
  u: ['', '', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['', '', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['', '', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['', '', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['', '', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['', '', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['', '', '', '', '', '', '#'],
  ',': ['', '', '', '', '', '', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '', '#'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '', '..#..'],
  "'": ['#', '#'],
  '"': ['#.#', '#.#'],
  '-': ['', '', '', '###'],
  ':': ['', '', '#', '', '', '', '#'],
  ';': ['', '', '.#', '', '', '', '.#', '#.'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '/': ['..#', '..#', '.#.', '.#.', '.#.', '#..', '#..'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '+': ['', '..#..', '..#..', '#####', '..#..', '..#..'],
  '~': ['', '', '', '.#...', '#.#.#', '...#.'],
  '*': ['', '..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
  '♥': ['', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  '♡': ['', '.##.##.', '#..#..#', '#.....#', '.#...#.', '..#.#..', '...#...'],
  '·': ['', '', '', '#'],
  '★': ['', '..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'],
  '✦': ['', '..#..', '..#..', '.###.', '#####', '.###.', '..#..', '..#..'],
  '×': ['', '', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '<': ['', '...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['', '#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '#': ['', '.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.'],
};
// Common typographic lookalikes
const ALIAS = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '❤': '♥', '♥️': '♥' };

export const LINE_H = 11;
const glyphs = new Map();

const EMOJI = /\p{Extended_Pictographic}/u;
const PIXEL_FIRST = new Set(['★', '✦', '♥', '♡']); // drawn as pixel glyphs, never as emoji

// Emoji keep their colours: drawn small with the system emoji font, then
// snapped to hard pixels so they sit in the pixel text.
function buildEmoji(ch) {
  const size = 10;
  const c = makeCanvas(size * 2, size * 2);
  const ctx = c.ctx;
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 1, size);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 90) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const img = makeCanvas(w, h);
  const out = img.ctx.createImageData(w, h);
  const px = [];
  const top = 7 - h; // sit on the baseline like the letters
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y + y0) * c.width + x + x0) * 4, o = (y * w + x) * 4;
    if (d[i + 3] > 90) {
      const a = d[i + 3] / 255;
      out.data[o] = Math.min(255, d[i] / a); out.data[o + 1] = Math.min(255, d[i + 1] / a); out.data[o + 2] = Math.min(255, d[i + 2] / a); out.data[o + 3] = 255;
      px.push([x, y + top]);
    }
  }
  img.ctx.putImageData(out, 0, 0);
  img.top = top;
  return { w, px, img };
}

function buildGlyph(ch) {
  if (EMOJI.test(ch) && !PIXEL_FIRST.has(ch)) { const e = buildEmoji(ch); if (e) return e; }
  const rows = G[ch];
  if (rows) {
    const w = Math.max(...rows.map((r) => r.length), 1);
    const px = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') px.push([x, y]); });
    return { w, px };
  }
  // Fallback: rasterize with a system font and threshold to hard pixels.
  const size = 11;
  const c = makeCanvas(size * 2, size * 2);
  const ctx = c.ctx;
  ctx.font = `${size}px "Loma","Tahoma","Leelawadee UI","Noto Sans Thai","Thonburi",sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(ch, 1, 9);
  const w = Math.ceil(ctx.measureText(ch).width);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 110) px.push([x - 1, y - 2]);
  return { w: Math.max(1, w), px, zero: w === 0 };
}

export function glyph(ch) {
  ch = ALIAS[ch] || ch;
  if (ch === ' ') return { w: 3, px: [] };
  let g = glyphs.get(ch);
  if (!g) { g = buildGlyph(ch); glyphs.set(ch, g); }
  return g;
}

// Split into grapheme-ish units so Thai combining marks stay with their base.
export function chars(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter().segment(str)].map((s) => s.segment);
  return [...str];
}

export function textWidth(str, spacing = 1) {
  let w = 0;
  const cs = chars(str);
  cs.forEach((c, i) => { const g = glyph(c); w += g.w + (i < cs.length - 1 && !g.zero ? spacing : 0); });
  return w;
}

export function wrap(str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (textWidth(t) <= maxW || !line) line = t;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// Pixel list for a string at scale 1 (used by fish formations).
export function textPixels(str) {
  const px = [];
  let x = 0;
  for (const c of chars(str)) {
    const g = glyph(c);
    for (const [gx, gy] of g.px) px.push([x + gx, gy]);
    x += g.w + 1;
  }
  return { px, w: Math.max(0, x - 1), h: 7 };
}

// Bold (horizontally dilated) pixels with wider spacing, for fish lettering.
export function textPixelsBold(str) {
  const set = new Set();
  const px = [];
  let x = 0;
  for (const c of chars(str)) {
    const g = glyph(c);
    for (const [gx, gy] of g.px) for (const dx of [0, 1]) {
      const k = (x + gx + dx) + ',' + gy;
      if (!set.has(k)) { set.add(k); px.push([x + gx + dx, gy]); }
    }
    x += g.w + (g.px.length ? 3 : 1);
  }
  return { px, w: Math.max(0, x - 2), h: 7 };
}

/**
 * Draw pixel text. opts: { color, scale, align ('left'|'center'|'right'),
 * shadow, outline, count (reveal first N chars), wave: (i)=>dy, alpha }
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const s = opts.scale || 1;
  const cs = chars(str);
  const w = textWidth(str) * s;
  let cx = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
  const n = opts.count ?? cs.length;
  const layers = [];
  if (opts.outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) layers.push([ox * s, oy * s, opts.outline]);
  if (opts.shadow) layers.push([0, s, opts.shadow]);
  layers.push([0, 0, opts.color || '#fff']);
  const prevA = ctx.globalAlpha;
  if (opts.alpha != null) ctx.globalAlpha = prevA * opts.alpha;
  for (const [lx, ly, col] of layers) {
    ctx.fillStyle = col;
    let px = cx;
    const main = lx === 0 && ly === 0 && col === (opts.color || '#fff');
    for (let i = 0; i < cs.length && i < n; i++) {
      const g = glyph(cs[i]);
      const dy = opts.wave ? Math.round(opts.wave(i)) : 0;
      const gs = opts.charScale ? opts.charScale(i) : 1;
      if (g.img && main) {
        const sm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(g.img, px, Math.round(y) + g.img.top * s + dy, g.img.width * s, g.img.height * s);
        ctx.imageSmoothingEnabled = sm;
      } else for (const [gx, gy] of g.px) ctx.fillRect(px + gx * s + lx, Math.round(y) + gy * s + ly + dy, s, s * gs);
      px += (g.w + (g.zero ? 0 : 1)) * s;
    }
  }
  ctx.globalAlpha = prevA;
  return w;
}

// Position of the i-th character (for per-char effects).
export function charX(str, i, scale = 1) {
  let x = 0;
  const cs = chars(str);
  for (let k = 0; k < i && k < cs.length; k++) x += (glyph(cs[k]).w + 1) * scale;
  return x;
}
