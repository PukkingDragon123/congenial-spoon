// Your camera: five models, painted in your colours, covered in stickers
// and doodles, with a charm on its strap. Everything is drawn into a 48x32
// pixel canvas (cached until something changes); stickers and doodles are
// clipped to the body, and the lens and buttons sit on top of them.
import { makeCanvas, hex } from '../util.js';

export const CAM_W = 48, CAM_H = 32;

// model -> name, price, perk. mult scales points; frame widens the viewfinder;
// leak always adds a light leak; dream deepens the vignette; clean cuts grain.
export const MODELS = {
  instant: { name: 'Instant', price: 0, mult: 1, perk: 'the classic', frame: 0 },
  disposable: { name: 'Disposable', price: 40, mult: 1.1, perk: 'light leaks, x1.1', frame: 0, leak: true },
  toy: { name: 'Toy Cam', price: 120, mult: 1.25, perk: 'dreamy, x1.25', frame: 0, dream: true },
  range: { name: 'Rangefinder', price: 250, mult: 1.4, perk: 'sharp, wider, x1.4', frame: 0.03 },
  slr: { name: 'SLR', price: 480, mult: 1.7, perk: 'pro, widest, x1.7', frame: 0.06, clean: true },
};

// paint colours for the body and trim; the first few are free
export const PAINTS = {
  cream: '#efe4cc', black: '#2e2a36', silver: '#c8c8d0', brown: '#8a5a34',
  white: '#f6f6f2', pink: '#ff9ab8', mint: '#8ae0c0', sky: '#8ac8f0',
  lilac: '#b8a0f0', red: '#e84a4a', yellow: '#ffd84a', navy: '#3a4a8a',
};
export const FREE_PAINTS = ['cream', 'black', 'silver', 'brown'];
export const PAINT_PRICE = 15;

// stickers as tiny pixel sprites: rows of palette letters
const SPR = {
  heart: ['.pp.pp.', 'ppPpppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'],
  star: ['...y...', '..yYy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'],
  fish: ['..oo...', '.ooooo.o', 'oOoooooo', '.ooooo.o', '..oo...'],
  jelly: ['.lll.', 'lLlll', 'lllll', 'l.l.l', 'l.l.l', '.l.l.'],
  flower: ['.w.w.', 'wwpww', '.wpw.', 'wwpww', '.w.w.'],
  smile: ['.yyy.', 'yKyKy', 'yyyyy', 'yKKKy', '.yyy.'],
  note: ['..bbb', '..b.b', '..b.b', 'bbb.b', 'bbbbb', 'bbb..'],
  crab: ['r.....r', 'rr...rr', '.rrrrr.', 'rrKrKrr', '.rrrrr.', 'r.r.r.r'],
  sparkle: ['..w..', '..w..', 'wwWww', '..w..', '..w..'],
};
const SPR_COL = {
  p: '#ff5a8a', P: '#ffc4d8', y: '#ffcf3a', Y: '#fff4b0', o: '#ff8a3a', O: '#1a1020', l: '#b890ff', L: '#f0e4ff',
  w: '#ffffff', W: '#fff4b0', K: '#1a1020', b: '#4a8aff', r: '#e84a4a',
};
export const STICKERS = { heart: 10, star: 10, fish: 10, jelly: 10, flower: 10, smile: 10, note: 10, crab: 10, sparkle: 10, photo: 25 };

// charms hang from the strap lug and swing
const CHARM_SPR = {
  heart: ['.pp.pp.', 'ppPpppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'],
  star: ['...y...', '..yYy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'],
  bell: ['..y..', '.yYy.', '.yyy.', 'yyyyy', 'yyyyy', '..K..'],
  fish: ['..oo...', '.ooooo.o', 'oOoooooo', '.ooooo.o', '..oo...'],
  jelly: ['.lll.', 'lLlll', 'lllll', 'l.l.l', 'l.l.l', '.l.l.'],
  bean: ['.g..g.', 'gggggg', 'gKggKg', 'gggggg', '.gggg.'],
  tree: ['G.G.G', 'GGtGG', '.ttt.', '.tKt.', '.ttt.', '.t.t.'],
};
const CHARM_COL = { ...SPR_COL, g: '#b8dc3a', G: '#5cae3e', t: '#b27e54' };
export const CHARMS = { heart: 20, star: 20, bell: 30, fish: 30, jelly: 40, bean: 60, tree: 80 };

export const PENS = ['#ffffff', '#1a1020', '#ff5a8a', '#ffcf4a', '#5ad08a', '#4aa8ff', '#a07aff', '#ff8a3a', '#8a5a34'];
export const MARKER_PRICE = 30;

export function defaultCam() {
  return {
    model: 'instant', models: ['instant'], body: 'cream', trim: 'black', paints: FREE_PAINTS.slice(),
    stickers: [], stickerSet: [], charm: null, charms: [], markers: false, art: '',
  };
}

// ------------------------------------------------------------- drawing --
const shade = (h, k) => { const [r, g, b] = hex(h); const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
function rrect(x, px, py, w, h, r, col) {
  x.fillStyle = col;
  for (let j = 0; j < h; j++) {
    const dy = Math.min(j, h - 1 - j);
    const inset = dy < r ? Math.round(r - Math.sqrt(Math.max(0, r * r - (r - dy - 0.5) ** 2))) : 0;
    x.fillRect(px + inset, py + j, w - inset * 2, 1);
  }
}
function disc(x, cx, cy, r, col) {
  x.fillStyle = col;
  for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); x.fillRect(cx - w, cy + j, w * 2 + 1, 1); }
}
export function sprite(x, rows, cx, cy, cols = SPR_COL) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2);
  // a white die-cut border first, like a real sticker
  x.fillStyle = '#ffffff';
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') x.fillRect(ox + i - 1, oy + j - 1, 3, 3); });
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { x.fillStyle = cols[row[i]] || '#fff'; x.fillRect(ox + i, oy + j, 1, 1); } });
}
function lens(x, cx, cy, r, trim) {
  disc(x, cx, cy, r + 1, '#1a1020');
  disc(x, cx, cy, r, shade(trim, -0.25));
  disc(x, cx, cy, r - 1, '#2a2e3a');
  disc(x, cx, cy, Math.max(1, r - 2), '#3a4a6a');
  disc(x, cx, cy, Math.max(1, r - 3), '#1a2438');
  x.fillStyle = '#9ac8ff'; x.fillRect(cx - Math.ceil(r / 3), cy - Math.ceil(r / 3), 2, 1); x.fillRect(cx - Math.ceil(r / 3), cy - Math.ceil(r / 3) + 1, 1, 1);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(cx + 1, cy + Math.floor(r / 3), 1, 1);
}

// body shapes per model: draws the paint + trim, returns lens/buttons as a
// function to draw after the decorations, and where the strap lug is
const MODEL_DRAW = {
  instant(x, B, T) {
    rrect(x, 3, 8, 42, 22, 3, B);
    rrect(x, 3, 8, 42, 8, 3, T);
    x.fillStyle = T; x.fillRect(3, 12, 42, 4);
    x.fillStyle = shade(B, -0.18); x.fillRect(4, 27, 40, 2);
    return (x) => {
      // rainbow stripe, the classic
      ['#e84a4a', '#ff9a3a', '#ffd84a', '#5ad08a', '#4a8aff'].forEach((c, i) => { x.fillStyle = c; x.fillRect(27 + i, 16, 1, 11); });
      lens(x, 15, 20, 6, T);
      x.fillStyle = '#1a1020'; x.fillRect(30, 9, 11, 5); x.fillStyle = '#e8f4ff'; x.fillRect(31, 10, 9, 3);
      x.fillStyle = '#1a1020'; x.fillRect(7, 9, 5, 4); x.fillStyle = '#6aa8e8'; x.fillRect(8, 10, 3, 2);
      x.fillStyle = '#e8403a'; x.fillRect(38, 17, 3, 3);
      x.fillStyle = '#1a1020'; x.fillRect(9, 28, 30, 1);
    };
  },
  disposable(x, B, T) {
    rrect(x, 3, 10, 42, 19, 2, B);
    x.fillStyle = T; x.fillRect(3, 18, 42, 6);
    x.fillStyle = shade(T, 0.4); for (let i = 6; i < 42; i += 4) x.fillRect(i, 20, 2, 2);
    x.fillStyle = '#3a3a44'; x.fillRect(5, 7, 8, 3);
    x.fillStyle = '#6a6a74'; for (let i = 5; i < 13; i += 2) x.fillRect(i, 7, 1, 3);
    return (x) => {
      lens(x, 14, 21, 4, T);
      x.fillStyle = '#1a1020'; x.fillRect(29, 11, 13, 6); x.fillStyle = '#f0f6ff'; x.fillRect(30, 12, 11, 4);
      x.fillStyle = '#1a1020'; x.fillRect(38, 8, 5, 2);
      x.fillStyle = '#1a1020'; x.fillRect(6, 12, 4, 3); x.fillStyle = '#6aa8e8'; x.fillRect(7, 13, 2, 1);
    };
  },
  toy(x, B, T) {
    rrect(x, 4, 9, 40, 21, 8, B);
    x.fillStyle = shade(B, 0.25); x.fillRect(10, 10, 28, 1);
    rrect(x, 20, 5, 8, 5, 1, T);
    return (x) => {
      disc(x, 24, 20, 10, T);
      disc(x, 24, 20, 9, shade(T, 0.2));
      lens(x, 24, 20, 7, T);
      x.fillStyle = '#1a1020'; x.fillRect(22, 6, 4, 3); x.fillStyle = '#6aa8e8'; x.fillRect(23, 7, 2, 1);
      x.fillStyle = '#e8403a'; x.fillRect(37, 10, 3, 2);
    };
  },
  range(x, B, T) {
    rrect(x, 2, 11, 44, 17, 2, B);
    x.fillStyle = shade(B, -0.2); for (let j = 16; j < 27; j += 2) for (let i = 4 + (j % 4); i < 45; i += 4) x.fillRect(i, j, 1, 1);
    rrect(x, 2, 8, 44, 7, 2, T);
    x.fillStyle = shade(T, 0.35); x.fillRect(4, 8, 40, 1);
    x.fillStyle = shade(T, -0.3); x.fillRect(36, 6, 6, 2); x.fillRect(7, 6, 7, 2);
    return (x) => {
      disc(x, 25, 21, 8, '#1a1020');
      disc(x, 25, 21, 7, shade(T, -0.1));
      lens(x, 25, 21, 5, T);
      x.fillStyle = '#1a1020'; x.fillRect(5, 9, 7, 4); x.fillStyle = '#e8f4ff'; x.fillRect(6, 10, 5, 2);
      x.fillStyle = '#1a1020'; x.fillRect(35, 9, 7, 4); x.fillStyle = '#e8f4ff'; x.fillRect(36, 10, 5, 2);
      x.fillStyle = '#e8403a'; x.fillRect(38, 5, 2, 1);
    };
  },
  slr(x, B, T) {
    rrect(x, 3, 13, 42, 15, 2, B);
    x.fillStyle = shade(B, -0.25); x.fillRect(3, 13, 7, 15);
    rrect(x, 3, 10, 42, 5, 1, T);
    x.fillStyle = T;
    for (let j = 0; j < 8; j++) x.fillRect(17 + Math.floor(j / 2), 3 + j, 14 - Math.floor(j / 2) * 2, 1);
    x.fillStyle = shade(T, 0.35); x.fillRect(19, 3, 10, 1); x.fillRect(4, 10, 40, 1);
    return (x) => {
      disc(x, 24, 22, 9, '#1a1020');
      disc(x, 24, 22, 8, '#2a2a34');
      x.fillStyle = '#4a4a56'; for (let a = 0; a < 6.28; a += 0.4) x.fillRect(Math.round(24 + Math.cos(a) * 8), Math.round(22 + Math.sin(a) * 8), 1, 1);
      lens(x, 24, 22, 6, T);
      x.fillStyle = '#e8403a'; x.fillRect(37, 8, 3, 2);
      x.fillStyle = '#1a1020'; x.fillRect(22, 5, 4, 2);
    };
  },
};
const LUG = { instant: [46, 11], disposable: [46, 12], toy: [44, 14], range: [47, 12], slr: [46, 14] };

// book: the album (for photo stickers), key -> { img }
export function renderCamera(cam, book) {
  const c = makeCanvas(CAM_W, CAM_H), x = c.ctx;
  const B = PAINTS[cam.body] || PAINTS.cream, T = PAINTS[cam.trim] || PAINTS.black;
  const top = (MODEL_DRAW[cam.model] || MODEL_DRAW.instant)(x, B, T);
  // doodles and stickers, only where there's camera
  const deco = makeCanvas(CAM_W, CAM_H), d = deco.ctx;
  if (cam.art) for (let i = 0; i < cam.art.length && i < CAM_W * CAM_H; i++) {
    const v = parseInt(cam.art[i], 16);
    if (v) { d.fillStyle = PENS[v - 1]; d.fillRect(i % CAM_W, Math.floor(i / CAM_W), 1, 1); }
  }
  for (const s of cam.stickers) {
    if (s.k === 'photo') {
      const im = book && book[s.key] && book[s.key].img;
      if (!im) continue;
      d.fillStyle = '#ffffff'; d.fillRect(s.x - 5, s.y - 4, 11, 10);
      d.imageSmoothingEnabled = true;
      d.drawImage(im, s.x - 4, s.y - 3, 9, 6);
      d.imageSmoothingEnabled = false;
    } else if (SPR[s.k]) sprite(d, SPR[s.k], s.x, s.y);
  }
  x.globalCompositeOperation = 'source-atop';
  x.drawImage(deco, 0, 0);
  x.globalCompositeOperation = 'source-over';
  top(x);
  // outline everything in dark ink
  const id = x.getImageData(0, 0, CAM_W, CAM_H), px = id.data;
  const on = (i, j) => i >= 0 && j >= 0 && i < CAM_W && j < CAM_H && px[(j * CAM_W + i) * 4 + 3] > 0;
  const edge = [];
  for (let j = 0; j < CAM_H; j++) for (let i = 0; i < CAM_W; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) edge.push([i, j]);
  x.fillStyle = '#1a1020';
  for (const [i, j] of edge) x.fillRect(i, j, 1, 1);
  c.lug = LUG[cam.model] || LUG.instant;
  return c;
}

// a charm dangling from (x, y) on a little chain, swung to angle a
export function drawCharm(ctx, charm, x, y, a, scale = 1) {
  if (!charm || !CHARM_SPR[charm]) return;
  const len = 5 * scale;
  ctx.fillStyle = '#d8d8e0';
  for (let k = 1; k <= len; k += 1.2 * scale) ctx.fillRect(Math.round(x + Math.sin(a) * k), Math.round(y + Math.cos(a) * k), Math.max(1, Math.round(scale)), Math.max(1, Math.round(scale)));
  const cx = x + Math.sin(a) * (len + 4 * scale), cy = y + Math.cos(a) * (len + 4 * scale);
  if (scale === 1) sprite(ctx, CHARM_SPR[charm], cx, cy, CHARM_COL);
  else {
    const rows = CHARM_SPR[charm], w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const ox = Math.round(cx - (w * scale) / 2), oy = Math.round(cy - (h * scale) / 2);
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { ctx.fillStyle = CHARM_COL[row[i]] || '#fff'; ctx.fillRect(ox + i * scale, oy + j * scale, scale, scale); } });
  }
}

export function drawStickerIcon(ctx, k, cx, cy) { if (SPR[k]) sprite(ctx, SPR[k], cx, cy); }
export function drawCharmIcon(ctx, k, cx, cy) { if (CHARM_SPR[k]) sprite(ctx, CHARM_SPR[k], cx, cy, CHARM_COL); }
