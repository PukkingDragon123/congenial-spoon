// Environment art: faceted boulder formations, the carved stone head,
// sand, caustics, kelp, decor, and the curved panoramic viewing hall.
import { TAU, clamp, lerp, smoothstep, ramp, bayer, hash2, noise2, fbm, ridge, rng, Buf, makeCanvas, hex, mixRGB } from '../util.js';

export const ROCK = ramp(['#040a20', '#091634', '#0f2248', '#16305d', '#1e3f73', '#294f89', '#36629f', '#4677b4', '#5a8ec8', '#77a9dc', '#9ec8ee'], 11);
const STONE = ramp(['#050b1c', '#0a1630', '#112244', '#1a3058', '#243f6c', '#314f80', '#416294', '#5477a8', '#6b8ebc', '#87a8d0', '#aac6e4'], 11);
const MOSS = ramp(['#07201f', '#0d3130', '#16453e', '#215a4c', '#2e705a'], 5);

// Light direction (toward the light) in screen space: x right, y down, z to viewer.
const LD = (() => { const v = [-0.38, -0.82, 0.48]; const l = Math.hypot(...v); return v.map((a) => a / l); })();

// ----------------------------------------------------------- formations --
/**
 * Pile of faceted boulders filling an envelope.
 * profile(xn) -> fraction of height (0..1) of the envelope at xn in [0,1].
 */
export function genFormation({ w, h, seed = 1, profile, size = [16, 46], density = 1.2, decor = 1, dark = 0, ramp: pal = ROCK, taper = [0.1, 0.1] }) {
  const r = rng(seed);
  const boulders = [];
  const tp = (x) => (taper[0] ? smoothstep(0, taper[0], x) : 1) * (taper[1] ? smoothstep(1, 1 - taper[1], x) : 1);
  const env = (x) => h - clamp(profile(x / w) * (0.25 + 0.75 * tp(x / w)), 0, 1) * h;
  const tries = Math.floor(((w * h) / (size[1] * size[1])) * 3.2 * density);
  for (let i = 0; i < tries; i++) {
    const x = r() * w;
    const top = env(x);
    const y = lerp(top, h, Math.pow(r(), 0.8));
    const depthFrac = (y - top) / Math.max(1, h - top);
    const rad = lerp(size[0], size[1], Math.pow(r(), 1.6)) * (0.6 + 0.6 * depthFrac) * (0.7 + 0.5 * (1 - y / h));
    if (y - rad * 0.4 < top - 2) continue;
    if ((taper[0] && x - rad * 0.8 < 0) || (taper[1] && x + rad * 0.8 > w)) continue;
    const nF = r.int(6, 9);
    const facets = [];
    const a0 = r() * TAU;
    for (let k = 0; k < nF; k++) {
      const a = a0 + (k / nF) * TAU + r.range(-0.25, 0.25);
      const s = r.range(0.7, 1.8) * (Math.sin(a) < -0.3 ? 0.7 : 1);
      const R = rad * r.range(0.75, 1.15) * (Math.abs(Math.sin(a)) > 0.7 ? 0.8 : 1);
      facets.push([Math.cos(a), Math.sin(a), s, R]);
    }
    boulders.push({ x, y, rad, facets, top: rad * r.range(0.35, 0.7), z: y * 0.6 + rad * 0.3 + r() * 6, ns: r.int(0, 999) });
  }
  // Keep only boulders that rest on the ground or on another boulder.
  boulders.sort((a, b) => b.y + b.rad - (a.y + a.rad));
  const kept = [];
  for (const b of boulders) {
    if (b.y + b.rad * 0.7 >= h - 4 || kept.some((o) => o.y > b.y - 2 && Math.hypot(o.x - b.x, o.y - b.y) < (o.rad + b.rad) * 0.85)) kept.push(b);
  }
  boulders.length = 0;
  boulders.push(...kept);
  // Rasterize with z-buffer
  const N = w * h;
  const owner = new Int16Array(N).fill(-1);
  const H = new Float32Array(N);
  const zval = new Float32Array(N).fill(-1e9);
  boulders.forEach((b, bi) => {
    const R = b.rad * 1.25;
    const x0 = Math.max(0, Math.floor(b.x - R)), x1 = Math.min(w - 1, Math.ceil(b.x + R));
    const y0 = Math.max(0, Math.floor(b.y - R)), y1 = Math.min(h - 1, Math.ceil(b.y + R));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - b.x, dy = y - b.y;
        let hh = b.top;
        for (const [fx, fy, s, Rf] of b.facets) hh = Math.min(hh, s * (Rf - (fx * dx + fy * dy)));
        hh += (fbm(x * 0.09, y * 0.09, b.ns, 3) - 0.5) * 5;
        if (hh <= 0) continue;
        const i = y * w + x;
        const zz = b.z + Math.min(hh, 6);
        if (zz > zval[i]) { zval[i] = zz; owner[i] = bi; H[i] = hh; }
      }
    }
  });
  const buf = new Buf(w, h);
  const light = new Buf(w, h);
  const own = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : owner[y * w + x]);
  const tops = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = owner[i];
      if (o < 0) continue;
      const hc = H[i];
      const hx = (own(x + 1, y) === o ? H[i + 1] : hc) - (own(x - 1, y) === o ? H[i - 1] : hc);
      const hy = (own(x, y + 1) === o ? H[i + w] : hc) - (own(x, y - 1) === o ? H[i - w] : hc);
      let nx = -hx * 0.5, ny = -hy * 0.5, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
      let b = 0.1 + Math.pow(dif, 1.3) * 0.86;
      b *= 0.55 + 0.45 * smoothstep(0, 5, hc);
      b *= 1 - 0.42 * Math.pow(y / h, 1.3);
      b += (fbm(x * 0.12, y * 0.12, 5, 3) - 0.5) * 0.22 + (noise2(x * 0.5, y * 0.5, 9) - 0.5) * 0.08;
      if (ridge(x * 0.045 + noise2(x * 0.1, y * 0.1, 3) * 0.6, y * 0.06, 11) < 0.035 && hc > 2) b -= 0.22;
      if (hash2(x, y, 31) < 0.012) b -= 0.18;
      b -= dark;
      // Shadow cast by boulders in front
      for (const [ox, oy] of [[0, 1], [-1, 0], [1, 0], [0, 2], [-2, 1], [2, 1]]) {
        const o2 = own(x + ox, y + oy);
        if (o2 >= 0 && o2 !== o && boulders[o2].z > boulders[o].z) { b -= 0.16; break; }
      }
      let lvl = b * (pal.length - 1);
      const upO = own(x, y - 1);
      if (upO !== o && (upO < 0 || boulders[upO].z < boulders[o].z) && dif > 0.35) lvl += 2.2;
      else if (own(x, y - 2) !== o && own(x, y - 2) < 0 && dif > 0.4) lvl += 0.7;
      if (own(x, y + 1) < 0) lvl = Math.min(lvl, 1);
      const idx = clamp(Math.round(lvl + (bayer(x, y) - 0.5) * 1.1), 0, pal.length - 1);
      buf.set(x, y, pal[idx]);
      const up = -ny;
      if (up > 0.38 && dif > 0.4) light.set(x, y, [255, 255, 255], Math.round(clamp((up - 0.38) * 2) * 255));
      if (upO < 0 && up > 0.2 && x > 3 && x < w - 3) tops.push([x, y]);
    }
  }
  if (decor) addDecor(buf, tops, r, decor, w, h);
  const c = buf.toCanvas();
  c.light = light.toCanvas();
  return c;
}

// ---------------------------------------------------------------- decor --
const FAN = ramp(['#2a1840', '#4a2a66', '#6e3f8a', '#9660ac', '#c08ad0'], 5);
const CORAL = ramp(['#3a2a28', '#6a4a38', '#9a7048', '#c8a060', '#e8cc88'], 5);
const ANEM = ramp(['#4a1e44', '#7a3270', '#b04a9a', '#e07ac0', '#ffb0e0'], 5);
const SPONGE = ramp(['#1e1a44', '#2e2a66', '#44408a', '#5e5aaa'], 4);
const SOFT = ramp(['#1a3a3a', '#285a54', '#3c7a6c', '#58a088', '#88c8a8'], 5);
const STAR = ramp(['#6a2a1c', '#a8462a', '#e0703a', '#ffa860'], 4);

function drawFan(buf, x, y, r, s) {
  const branch = (bx, by, ang, len, depth) => {
    for (let i = 0; i < len; i++) {
      const px = Math.round(bx + Math.cos(ang) * i), py = Math.round(by + Math.sin(ang) * i);
      buf.set(px, py, FAN[clamp(4 - depth + (i < 2 ? -1 : 0), 0, 4)], 235);
    }
    if (depth < 4 && len > 2) {
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      branch(ex, ey, ang - r.range(0.3, 0.6), len * r.range(0.6, 0.8), depth + 1);
      branch(ex, ey, ang + r.range(0.3, 0.6), len * r.range(0.6, 0.8), depth + 1);
    }
  };
  branch(x, y, -Math.PI / 2 + r.range(-0.3, 0.3), 4 * s, 0);
}

function drawCoralClump(buf, x, y, r, s) {
  const n = r.int(3, 6);
  for (let k = 0; k < n; k++) {
    const cx = x + r.range(-4, 4) * s, cy = y - r.range(0, 3) * s, rad = r.range(1.5, 3.2) * s;
    for (let dy = -Math.ceil(rad); dy <= 0; dy++) {
      for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
        const d = Math.hypot(dx, dy * 1.2);
        if (d > rad) continue;
        const l = 1.5 + (-dy / rad) * 2 - (dx / rad) * 0.5 + (hash2(cx + dx, cy + dy, 3) < 0.3 ? -1 : 0);
        buf.set(Math.round(cx + dx), Math.round(cy + dy), CORAL[clamp(Math.round(l), 0, 4)]);
      }
    }
  }
}

function drawAnemone(buf, x, y, r, s) {
  const n = Math.round(5 * s + 3);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2;
    const len = r.range(3, 6) * s;
    for (let i = 0; i < len; i++) {
      const px = Math.round(x + Math.cos(a) * i + Math.sin(i * 0.8 + k) * 0.6), py = Math.round(y + Math.sin(a) * i);
      buf.set(px, py, ANEM[clamp(Math.round(1 + (i / len) * 3.4), 0, 4)]);
    }
  }
  for (let dx = -2; dx <= 2; dx++) buf.set(x + dx, y, ANEM[1]);
}

function drawSponge(buf, x, y, r, s) {
  const n = r.int(1, 3);
  for (let k = 0; k < n; k++) {
    const bx = x + k * 3 - n, hgt = Math.round(r.range(4, 9) * s);
    for (let i = 0; i < hgt; i++) {
      buf.set(bx, y - i, SPONGE[1]); buf.set(bx + 1, y - i, SPONGE[2]); buf.set(bx + 2, y - i, SPONGE[1]);
    }
    buf.set(bx + 1, y - hgt, SPONGE[0]); buf.set(bx, y - hgt, SPONGE[3]); buf.set(bx + 2, y - hgt, SPONGE[3]);
  }
}

function drawSoft(buf, x, y, r, s) {
  const hgt = Math.round(r.range(3, 6) * s), rad = r.range(3, 5) * s;
  for (let i = 0; i < hgt; i++) buf.set(x, y - i, SOFT[1]), buf.set(x + 1, y - i, SOFT[2]);
  for (let dy = -Math.ceil(rad * 0.6); dy <= 0; dy++) {
    for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
      if (Math.hypot(dx / rad, dy / (rad * 0.6)) > 1) continue;
      const l = 2 + (-dy / rad) * 3 + (hash2(dx, dy, x) < 0.25 ? 1 : 0);
      buf.set(x + dx, y - hgt + dy, SOFT[clamp(Math.round(l), 0, 4)]);
    }
  }
}

function drawStar(buf, x, y) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU - Math.PI / 2;
    for (let i = 0; i < 3; i++) buf.set(Math.round(x + Math.cos(a) * i), Math.round(y + Math.sin(a) * i), STAR[clamp(3 - i, 0, 3)]);
  }
  buf.set(x, y, STAR[3]);
}

function addDecor(buf, tops, r, amount, w, h) {
  const n = Math.floor(tops.length * 0.09 * amount);
  for (let i = 0; i < n; i++) {
    const [x, y] = r.pick(tops);
    const s = 0.8 + (y / h) * 0.6;
    const k = r();
    if (k < 0.22) drawFan(buf, x, y, r, s * 1.1);
    else if (k < 0.45) drawCoralClump(buf, x, y, r, s);
    else if (k < 0.6) drawAnemone(buf, x, y, r, s);
    else if (k < 0.75) drawSponge(buf, x, y, r, s);
    else if (k < 0.92) drawSoft(buf, x, y, r, s);
    else drawStar(buf, x, y + 3);
  }
}

// --------------------------------------------------------------- statue --
// A Bayon-style serene stone head, sculpted as a height field and lit.
export function genStatue() {
  const W = 124, Ht = 184, cx = 62;
  const g = (x, y, mx, my, sx, sy) => Math.exp(-(((x - mx) / sx) ** 2) - (((y - my) / sy) ** 2));
  const heights = new Float32Array(W * Ht);
  const mask = new Uint8Array(W * Ht);
  const mossy = new Float32Array(W * Ht);
  const tiers = [
    // [yTop, yBot, hwTop, hwBot]
    [10, 21, 5, 9],
    [21, 33, 8, 15],
    [33, 45, 13, 21],
    [45, 56, 18, 26],
    [56, 66, 25, 31],
  ];
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, adx = Math.abs(dx);
      let h = -1, m = 0;
      // Crown tiers
      for (let t = 0; t < tiers.length; t++) {
        const [y0, y1, w0, w1] = tiers[t];
        if (y >= y0 && y < y1) {
          const f = (y - y0) / (y1 - y0);
          const hw = lerp(w0, w1, Math.pow(f, 0.7)) + Math.sin(f * Math.PI) * 2.2;
          if (adx < hw) {
            h = 16 * Math.sqrt(1 - (dx / hw) ** 2) + 4 + t * 2;
            if (t > 0) {
              // bead band along the bottom of each tier
              if (y1 - y < 3) h += 1.6 * Math.abs(Math.sin(dx * 0.9));
              // lotus petals on the tier face
              const pw = 5.5, pi = Math.round(dx / pw), pc = pi * pw;
              const pf = (y - y0) / (y1 - y0 - 3);
              const petal = Math.abs(dx - pc) < (pw * 0.48) * Math.sin(Math.min(1, pf) * Math.PI * 0.95);
              if (petal && pf < 1) h += 1.3 * (1 - pf * 0.4);
              else if (pf < 1) h -= 0.6;
            } else h += 1.5 * Math.sin(y * 0.8);
          }
        }
      }
      // Finial bulb
      const fb = Math.hypot(dx / 5, (y - 8) / 6);
      if (fb < 1) h = Math.max(h, 10 * Math.sqrt(1 - fb * fb) + 8);
      if (y < 5 && adx < 1.5) h = Math.max(h, 12);
      // Face oval
      const fx = dx / 30, fy = (y - 104) / 44;
      const fr = fx * fx + fy * fy;
      if (fr < 1 && y > 60) {
        let fh = 20 * Math.sqrt(1 - fr);
        const browY = 85 + 0.014 * dx * dx;
        if (adx < 25) fh += 2.8 * Math.exp(-(((y - browY) / 2.4) ** 2)) * (1 - adx / 30);
        // eye sockets and heavy lidded closed eyes
        for (const s of [-1, 1]) {
          const ex = cx + s * 12.5, ey = 93;
          fh -= 3.4 * g(x, y, ex, ey, 7.5, 4.2);
          const lx = x - ex;
          const lidY = ey - 0.2 + 0.035 * lx * lx;
          if (Math.abs(lx) < 7) {
            fh += 1.6 * Math.exp(-(((y - lidY + 1.6) / 1.8) ** 2));
            if (Math.abs(y - lidY) < 0.7) fh -= 2.2;
          }
        }
        // nose
        if (y > 86 && y < 118) {
          const t = (y - 86) / 32;
          fh += (1.5 + 4.5 * t) * Math.exp(-((dx / (2 + 2.6 * t)) ** 2));
        }
        fh += 4.2 * g(x, y, cx, 116, 4.6, 3.6);
        fh += 2.2 * g(x, y, cx - 5.2, 117.5, 2.6, 2.4) + 2.2 * g(x, y, cx + 5.2, 117.5, 2.6, 2.4);
        fh -= 2.2 * g(x, y, cx - 2.8, 120, 1.2, 0.9) + 2.2 * g(x, y, cx + 2.8, 120, 1.2, 0.9);
        // serene smile
        const my = 128 - 0.022 * dx * dx;
        if (adx < 13) {
          fh += 2.6 * Math.exp(-(((y - (my - 2.2)) / 1.8) ** 2)) * (1 - adx / 14);
          fh += 3.0 * Math.exp(-(((y - (my + 2.4)) / 2.2) ** 2)) * (1 - adx / 12);
          if (Math.abs(y - my) < 0.7 && adx < 11) fh -= 2.6;
        }
        fh += 2 * g(x, y, cx, 141, 6, 4);
        fh += 2.6 * g(x, y, cx - 18, 112, 8, 9) + 2.6 * g(x, y, cx + 18, 112, 8, 9);
        fh -= 1.2 * g(x, y, cx, 123, 1.4, 2);
        h = Math.max(h, fh);
      }
      // Ears
      for (const s of [-1, 1]) {
        const ex = (x + 0.5 - (cx + s * 31.5)) / 5.8, ey = (y - 111) / 27;
        if (ex * ex + ey * ey < 1) {
          let eh = 9 * Math.sqrt(1 - ex * ex - ey * ey) + 3;
          if (Math.abs(ex + s * 0.1) < 0.4 && ey > -0.75 && ey < 0.55) eh -= 3.2;
          if (Math.hypot(ex, (ey - 0.72) * 2) < 0.35) eh -= 3;
          h = Math.max(h, eh);
        }
      }
      // Neck / shoulders base
      if (y > 136 && adx < 21 + Math.max(0, y - 166) * 1.6) {
        const nhw = 21 + Math.max(0, y - 166) * 1.6;
        h = Math.max(h, 14 * Math.sqrt(Math.max(0, 1 - (dx / nhw) ** 2)) + (y > 160 ? 2 * Math.sin(dx * 0.4) : 0));
      }
      if (h > 0) {
        h += (fbm(x * 0.2, y * 0.2, 41, 3) - 0.5) * 2.2;
        if (fbm(x * 0.07, y * 0.07, 43, 2) > 0.68) h -= 2.4;
        heights[y * W + x] = h;
        mask[y * W + x] = 1;
        mossy[y * W + x] = fbm(x * 0.09, y * 0.09, 47, 3);
      }
    }
  }
  // Cavity (ambient occlusion) from blurred height
  const blur = new Float32Array(W * Ht);
  const R = 3;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Ht) continue;
      s += heights[yy * W + xx]; n++;
    }
    blur[y * W + x] = s / n;
  }
  const buf = new Buf(W, Ht);
  const light = new Buf(W, Ht);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? 0 : heights[y * W + x]);
  const mk = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? 0 : mask[y * W + x]);
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const hx = at(x + 1, y) - at(x - 1, y), hy = at(x, y + 1) - at(x, y - 1);
      let nx = -hx * 0.45, ny = -hy * 0.45, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
      const cav = clamp((blur[y * W + x] - heights[y * W + x]) * 0.22, -0.3, 0.6);
      let b = 0.12 + dif * 0.78 - cav * 0.5;
      b *= 1 - 0.3 * (y / Ht);
      b += (noise2(x * 0.6, y * 0.6, 51) - 0.5) * 0.08;
      if (ridge(x * 0.05, y * 0.03 + noise2(x * 0.1, y * 0.1, 5), 53) < 0.03) b -= 0.2;
      let lvl = b * (STONE.length - 1);
      if (!mk(x, y - 1) && dif > 0.3) lvl += 1.5;
      if (!mk(x, y + 1) || !mk(x - 1, y) || !mk(x + 1, y)) lvl -= 1.2;
      const idx = clamp(Math.round(lvl + (bayer(x, y) - 0.5) * 0.9), 0, STONE.length - 1);
      let col = STONE[idx];
      const up = -ny;
      if (mossy[y * W + x] > 0.58 && up > 0.15) col = mixRGB(col, MOSS[clamp(Math.round(dif * 4 + (bayer(x, y) - 0.5)), 0, 4)], 0.6);
      buf.set(x, y, col);
      if (up > 0.2 && dif > 0.35) light.set(x, y, [255, 255, 255], Math.round(clamp((up - 0.2) * 1.6) * 255));
    }
  }
  const c = buf.toCanvas();
  c.light = light.toCanvas();
  return c;
}

// Ruined carved pillar for the background.
export function genPillar(seed, h = 150) {
  const r = rng(seed);
  const W = 44, cx = 22;
  const buf = new Buf(W, h);
  const broken = h * r.range(0.0, 0.12);
  for (let y = 0; y < h; y++) {
    const band = (y % 26) < 4;
    const hw = band ? 14 : 13;
    const topCut = broken + (noise2(0, y * 0.1, seed) - 0.5) * 6;
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > hw) continue;
      const tb = broken + (fbm(x * 0.3, 0, seed, 2) - 0.5) * 14;
      if (y < tb) continue;
      const n = dx / hw;
      const dif = clamp(0.25 + (-n * 0.5 + 0.5) * 0.65 - (band ? 0 : 0.05));
      let b = dif * (1 - 0.35 * (y / h)) + (fbm(x * 0.2, y * 0.2, seed, 3) - 0.5) * 0.2;
      if (!band && (y % 26) > 8 && (y % 26) < 20 && Math.abs(dx) < 8 && ((y + (x >> 2)) % 5 === 0)) b -= 0.15;
      let lvl = b * (STONE.length - 1);
      if (y < tb + 1.5) lvl += 1.5;
      if (Math.abs(dx) > hw - 1) lvl -= 1.2;
      buf.set(x, y, STONE[clamp(Math.round(lvl + (bayer(x, y) - 0.5)), 0, STONE.length - 1)]);
    }
  }
  return buf.toCanvas();
}

// ----------------------------------------------------------------- sand --
const SAND = ramp(['#12306e', '#1c448c', '#2a5aa8', '#3b72c0', '#528cd4', '#70a8e6', '#94c4f2', '#bcdcf8'], 8);
export function genSand(w = 640, h = 48, seed = 3) {
  const buf = new Buf(w, h);
  for (let y = 0; y < h; y++) {
    const depth = y / (h - 1); // 0 far, 1 near
    const sc = 0.35 + depth * 0.9;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      // tileable noise via circular sampling
      const a = nx * TAU;
      const tn = (fx, fy, s, o) => fbm(Math.cos(a) * fx + 50, Math.sin(a) * fx + y * fy, s, o);
      let b = 0.5 + depth * 0.18;
      const rip = Math.sin(x * (0.35 / sc) + tn(3, 0.2, seed, 2) * 7 + y * 0.6);
      b += rip * 0.06 * (0.4 + depth);
      b += (tn(18, 0.25 / sc, seed + 1, 3) - 0.5) * 0.25;
      if (hash2(x, y, seed) < 0.02 + depth * 0.02) b += hash2(x, y, seed + 1) < 0.5 ? -0.18 : 0.14;
      b -= (1 - depth) * 0.12;
      const idx = clamp(Math.round(b * (SAND.length - 1) + (bayer(x, y) - 0.5) * 0.9), 0, SAND.length - 1);
      buf.set(x, y, SAND[idx]);
    }
  }
  // pebbles & shells, bigger toward the front
  const r = rng(seed + 9);
  for (let i = 0; i < w * 0.25; i++) {
    const y = Math.floor(Math.pow(r(), 0.6) * (h - 2)) + 1;
    const x = Math.floor(r() * w);
    const s = 0.5 + (y / h) * 2;
    const rad = Math.max(1, Math.round(r.range(0.5, 1.4) * s));
    const light = r() < 0.4;
    for (let dy = -rad; dy <= 0; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy * 2 > rad * rad) continue;
      const l = light ? 6 - (dy + rad > rad ? 1 : 0) + (dy === -rad ? 1 : 0) : 1 + (dy === -rad ? 2 : 0);
      buf.set((x + dx + w) % w, y + dy, SAND[clamp(l, 0, 7)]);
    }
    if (!light) buf.set((x + rad + 1) % w, y, SAND[1]);
  }
  return buf.toCanvas();
}

// ------------------------------------------------------------- caustics --
export function genCaustics(size = 96, frames = 24, seed = 4) {
  const r = rng(seed);
  const pts = [];
  const n = 34;
  for (let i = 0; i < n; i++) pts.push({ x: r() * size, y: r() * size, rx: r.range(2, 6), ry: r.range(2, 6), f: r.int(1, 2), p: r() * TAU });
  const out = [];
  for (let f = 0; f < frames; f++) {
    const t = (f / frames) * TAU;
    const P = pts.map((p) => [p.x + Math.cos(t * p.f + p.p) * p.rx, p.y + Math.sin(t * p.f + p.p) * p.ry]);
    const buf = new Buf(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let d1 = 1e9, d2 = 1e9;
        for (const [px, py] of P) {
          let dx = Math.abs(x - px) % size, dy = Math.abs(y - py) % size;
          if (dx > size / 2) dx = size - dx;
          if (dy > size / 2) dy = size - dy;
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        const e = Math.sqrt(d2) - Math.sqrt(d1);
        const v = 1 - smoothstep(0, 2.4, e);
        if (v > 0.66) buf.set(x, y, [210, 245, 255], 255);
        else if (v > 0.33) buf.set(x, y, [170, 225, 255], 140);
        else if (v > 0.12) buf.set(x, y, [140, 205, 255], 55);
      }
    }
    out.push(buf.toCanvas());
  }
  return out;
}

// ----------------------------------------------------------------- kelp --
const KELP = ramp(['#12301e', '#1e4a28', '#2e6432', '#46803a', '#66a046', '#90be5a', '#bcd878'], 7);
export const KELP_FRAMES = 32;
export function genKelp(height, seed) {
  const r = rng(seed);
  const W = Math.ceil(height * 0.5) + 16;
  const frames = [];
  const leaves = [];
  for (let s = 6; s < height - 2; s += r.range(4, 7)) leaves.push({ s, side: leaves.length % 2 ? 1 : -1, len: r.range(6, 11) * (1 - (s / height) * 0.4), ang: r.range(0.5, 0.9) });
  const amp = r.range(5, 9), k = r.range(0.035, 0.06), ph0 = r() * TAU;
  for (let f = 0; f < KELP_FRAMES; f++) {
    const t = (f / KELP_FRAMES) * TAU;
    const buf = new Buf(W, height + 4);
    const base = W / 2;
    const X = (s) => base + Math.sin(t + ph0 - s * k) * amp * Math.pow(s / height, 1.5) + Math.sin(t * 2 + s * 0.1) * 0.6 * (s / height);
    for (let s = 0; s < height; s++) {
      const x = Math.round(X(s)), y = height + 2 - s;
      buf.set(x, y, KELP[2]);
      buf.set(x + 1, y, KELP[1]);
    }
    for (const L of leaves) {
      const bx = X(L.s), by = height + 2 - L.s;
      const sway = Math.sin(t + ph0 - L.s * k) * 0.35;
      const ang = -Math.PI / 2 + L.side * L.ang + sway;
      for (let i = 0; i < L.len; i++) {
        const w = Math.sin((i / L.len) * Math.PI) * 1.8;
        const cx = bx + Math.cos(ang) * i, cy = by + Math.sin(ang) * i + (i * i) * 0.02;
        for (let j = -Math.floor(w); j <= Math.ceil(w); j++) {
          const px = Math.round(cx - Math.sin(ang) * j * 0.8), py = Math.round(cy + Math.cos(ang) * j * 0.5);
          const l = 3 + (j < 0 ? 1.4 : -0.4) + (i / L.len) * 1.5 - (Math.abs(j) > w - 0.6 ? 1 : 0);
          buf.set(px, py, KELP[clamp(Math.round(l), 0, 6)], 240);
        }
      }
    }
    const c = buf.toCanvas();
    c.ox = Math.round(base); c.oy = height + 2;
    frames.push(c);
  }
  return frames;
}

// ------------------------------------------------------------- backdrop --
export function genFarRidge(w, h, seed) {
  const r = rng(seed);
  const buf = new Buf(w, h);
  const col = hex('#1a55b4'), col2 = hex('#2266c4');
  for (let x = 0; x < w; x++) {
    const top = h * (0.25 + 0.55 * fbm(x * 0.008, 0, seed, 4)) + Math.sin(x * 0.03) * 4;
    for (let y = Math.floor(top); y < h; y++) {
      const edge = y - top < 1.5;
      buf.set(x, y, edge ? col2 : col, edge ? 200 : 255);
    }
  }
  return buf.toCanvas();
}

// ----------------------------------------------------------------- room --
// Curved panoramic window set in a dark hall, built in screen space so the
// glass always bows around the viewer like the real walk-through hall.
export const CX = 1200;
export function frameCurves(W, H, CY) {
  const k = clamp(W / 640, 0.45, 1.25);
  const off = H / 2 - CY; // world y -> screen y at the glass plane
  const top = (x) => { const u = (x - W / 2) / (W / 2); return 32 + off + 36 * k * (1 - u * u); };
  const sill = (x) => { const u = (x - W / 2) / (W / 2); return 306 + off - 13 * k * (1 - u * u); };
  return { top, sill, off };
}

export function genFrame(W, H, CY) {
  const M = 4; // margin for vertical camera drift
  const buf = new Buf(W, H + M * 2);
  const { top, sill } = frameCurves(W, H, CY);
  const floorPal = ramp(['#010208', '#02040e', '#040918', '#071126', '#0c1a3a', '#12265a'], 6);
  const ceilMask = new Buf(W, H + M * 2);
  for (let x = 0; x < W; x++) {
    const wt = Math.round(top(x)) + M, ws = Math.round(sill(x)) + M;
    for (let y = 0; y < H + M * 2; y++) {
      let c = null, a = 255;
      if (y < wt) {
        const d = wt - y;
        if (d <= 1) c = hex('#5a9cf0');
        else if (d <= 2) c = hex('#2452a8');
        else if (d <= 4) c = hex('#0e2464');
        else if (d < 20) c = mixRGB(hex('#0a1a4e'), hex('#060e30'), (d - 4) / 16);
        else if (d < 22) c = hex('#02050f');
        else {
          // ceiling: transparent so the scrolling panel texture shows, with a light spill
          const g = clamp(1 - (d - 22) / 110);
          ceilMask.set(x, y, [255, 255, 255], 255);
          c = [40, 110, 220]; a = Math.round(g * g * 60);
        }
      } else if (y > ws) {
        const d = y - ws;
        if (d <= 1) c = hex('#a8dcff');
        else if (d <= 2) c = hex('#4a90e8');
        else if (d <= 4) c = hex('#1c4aa0');
        else if (d <= 6) c = hex('#0e2a6a');
        else if (d < 19) c = mixRGB(hex('#0b1c4c'), hex('#050c26'), (d - 6) / 13);
        else if (d < 21) c = hex('#010309');
        else {
          const g = clamp(1 - (d - 21) / 150);
          const u = (x - W / 2) / (W * 0.62);
          const pool = clamp(1 - u * u) * g;
          const l = g * g * 3.0 + pool * 1.6 + (bayer(x, y) - 0.5) * 0.9;
          c = floorPal[clamp(Math.round(l), 0, 5)];
        }
      } else {
        // glass: faint streak reflections and an inner edge glow
        const e1 = y - wt, e2 = ws - y;
        const streak = Math.max(0, Math.sin(x * 0.021 + 1.3) * Math.sin(x * 0.0071 + 0.4) - 0.35);
        const glow = Math.max(0, 1 - e1 / 5) * 0.8 + Math.max(0, 1 - e2 / 4);
        const alpha = Math.round(streak * 26 + glow * 70);
        if (alpha > 2) { c = [200, 236, 255]; a = Math.min(255, alpha); }
      }
      if (c) buf.set(x, y, c, a);
    }
  }
  const cv = buf.toCanvas();
  cv.M = M;
  cv.mask = ceilMask.toCanvas();
  return cv;
}

export function genCeilTile() {
  const w = 60, h = 36;
  const b = new Buf(w, h);
  const pal = ramp(['#020409', '#04070f', '#070c1a', '#0a1224'], 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let l = 1.6 + (bayer(x, y) - 0.5) * 0.8;
    if (x === 0 || y === 0) l = 0.2;
    else if (x === 1 || y === 1) l = 2.6;
    else if (x % 4 === 2 && y % 4 === 2) l = 0.6;
    b.set(x, y, pal[clamp(Math.round(l), 0, 3)]);
  }
  return b.toCanvas();
}
