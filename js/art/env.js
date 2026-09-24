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
  // Serene Sukhothai-style head: flame finial, curled ushnisha and hair,
  // arched brows, downcast eyes, long earlobes, neck folds and a robe.
  const curls = (x, y) => {
    // snail-shell curls on a staggered lattice: rounded bumps with dark seams
    const sp = 4.6, row = Math.round(y / (sp * 0.87));
    const off = (row % 2) * sp * 0.5;
    const cxl = Math.round((x - off) / sp) * sp + off, cyl = row * sp * 0.87;
    const d = Math.hypot(x - cxl, y - cyl);
    return d < 2.5 ? 1.9 * (1 - (d / 2.5) ** 2) + (d < 0.9 ? 0.5 : 0) : -0.6;
  };
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, adx = Math.abs(dx);
      let h = -1;
      // flame finial (rasmi)
      if (y >= 3 && y < 31) {
        const f = (y - 3) / 28;
        const hw = 0.9 + 6.2 * Math.pow(f, 1.15) + Math.sin(f * 9) * 0.5 * f;
        if (adx < hw) h = 7 + 8 * Math.sqrt(1 - (dx / hw) ** 2) + f * 4 + (Math.abs(Math.sin(y * 0.9 + dx * 0.4)) < 0.2 ? -0.8 : 0);
      }
      // ushnisha
      const ub = Math.hypot(dx / 16, (y - 42) / 13);
      if (ub < 1) h = Math.max(h, 17 * Math.sqrt(1 - ub * ub) + 7 + curls(x, y));
      // skull covered in curls down to the hairline
      const sk = Math.hypot(dx / 31, (y - 84) / 38);
      const hairline = 73 + 0.013 * dx * dx;
      if (sk < 1 && y < hairline + 1) h = Math.max(h, 21 * Math.sqrt(1 - sk * sk) + curls(x, y));
      // face
      const fx = dx / 27.5, fy = (y - 106) / 37;
      const fr = fx * fx + fy * fy;
      if (fr < 1 && y >= hairline - 1) {
        let fh = 21 * Math.sqrt(1 - fr);
        // arched brows flowing into the bridge of the nose
        const browY = 85 - 4.2 * Math.exp(-(((adx - 12) / 7) ** 2));
        if (adx < 23) fh += 2.3 * Math.exp(-(((y - browY) / 1.6) ** 2)) * (1 - adx / 26);
        for (const sd of [-1, 1]) {
          const ex = cx + sd * 12, ey = 95;
          fh -= 2.6 * g(x, y, ex, ey - 2.5, 7.5, 4);
          const lx = x + 0.5 - ex;
          if (Math.abs(lx) < 7.5) {
            // heavy downcast lid, then a thin crescent slit
            const slit = ey + 0.035 * lx * lx - 0.4;
            fh += 1.9 * Math.exp(-(((y - slit + 1.8) / 1.9) ** 2));
            if (Math.abs(y + 0.5 - slit) < 0.65) fh -= 2.6;
          }
        }
        if (y > 86 && y < 119) {
          const t = (y - 86) / 33;
          fh += (1.8 + 4 * t) * Math.exp(-((dx / (1.8 + 2.4 * t)) ** 2));
        }
        fh += 3.4 * g(x, y, cx, 117, 4.4, 3.2);
        fh += 1.8 * g(x, y, cx - 4.6, 118, 2.4, 2) + 1.8 * g(x, y, cx + 4.6, 118, 2.4, 2);
        fh -= 1.8 * g(x, y, cx - 2.6, 120.5, 1.1, 0.8) + 1.8 * g(x, y, cx + 2.6, 120.5, 1.1, 0.8);
        // gentle closed smile, corners lifted
        const my = 127.5 - 0.028 * dx * dx;
        if (adx < 12) {
          fh += 2.2 * Math.exp(-(((y - (my - 2)) / 1.6) ** 2)) * (1 - adx / 13);
          fh += 2.8 * Math.exp(-(((y - (my + 2.3)) / 2) ** 2)) * (1 - adx / 11);
          if (Math.abs(y + 0.5 - my) < 0.6 && adx < 10) fh -= 2.2;
        }
        fh += 2.2 * g(x, y, cx, 137.5, 7, 3.6);
        fh += 2.4 * g(x, y, cx - 17, 111, 8, 10) + 2.4 * g(x, y, cx + 17, 111, 8, 10);
        h = Math.max(h, fh);
      }
      // long earlobes joined to the head
      for (const sd of [-1, 1]) {
        const ex = (x + 0.5 - (cx + sd * 29)) / 5.4, ey = (y - 114) / 30;
        if (ex * ex + ey * ey < 1) {
          let eh = 8 * Math.sqrt(1 - ex * ex - ey * ey) + 4;
          if (Math.abs(ex + sd * 0.15) < 0.35 && ey > -0.8 && ey < -0.1) eh -= 2.6;
          if (Math.abs(ex) < 0.28 && ey > 0.35 && ey < 0.78) eh -= 3.2;
          h = Math.max(h, eh);
        }
      }
      // short neck with three folds
      if (y > 138 && y < 162 && adx < 15.5) {
        let nh = 13 * Math.sqrt(Math.max(0, 1 - (dx / 15.5) ** 2));
        for (const fy2 of [146, 151.5, 157]) nh -= 1.3 * Math.exp(-(((y - fy2 + 0.028 * dx * dx) / 0.9) ** 2));
        h = Math.max(h, nh);
      }
      // shoulders and robe draped over the left shoulder
      if (y >= 158) {
        const hw = 16 + (y - 158) * 2.3;
        if (adx < hw) {
          let rh = 15 * Math.sqrt(Math.max(0, 1 - (dx / hw) ** 2)) + 2;
          if (dx < 8 - (y - 158) * 0.9) {
            const fold = ((x + y * 0.9) % 7 + 7) % 7;
            rh += fold < 1.2 ? -1.1 : fold < 3 ? 0.4 : 0;
          }
          if (Math.abs(dx - 8 + (y - 158) * 0.9) < 1) rh += 1.4;
          h = Math.max(h, rh);
        }
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
      if (mossy[y * W + x] > 0.7 && up > 0.25) col = mixRGB(col, MOSS[clamp(Math.round(dif * 4 + (bayer(x, y) - 0.5)), 0, 4)], 0.4);
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
const KELP = ramp(['#142a18', '#24401c', '#3a5c22', '#56782a', '#789636', '#9cb246', '#c4cc66'], 7);
export const KELP_FRAMES = 32;
export function genKelp(height, seed) {
  const r = rng(seed);
  const W = Math.ceil(height * 0.55) + 24;
  const frames = [];
  const stipes = [];
  const n = r.int(1, 3);
  for (let k = 0; k < n; k++) {
    const h = height * (k === 0 ? 1 : r.range(0.55, 0.85));
    const blades = [];
    for (let sy = 8; sy < h - 2; sy += r.range(4.5, 7.5)) blades.push({ s: sy, side: blades.length % 2 ? 1 : -1, len: r.range(9, 17) * (1 - (sy / h) * 0.35), w: r.range(1.6, 2.4), droop: r.range(0.9, 1.4), ph: r() * TAU });
    stipes.push({ h, off: (k - (n - 1) / 2) * 5 + r.range(-1, 1), blades, amp: r.range(5, 9), k: r.range(0.035, 0.055), ph: r() * TAU });
  }
  for (let f = 0; f < KELP_FRAMES; f++) {
    const t = (f / KELP_FRAMES) * TAU;
    const buf = new Buf(W, height + 4);
    const base = W / 2;
    for (const st of stipes) {
      const X = (s) => base + st.off + Math.sin(t + st.ph - s * st.k) * st.amp * Math.pow(s / height, 1.5) + Math.sin(t * 2 + s * 0.1) * 0.5 * (s / height);
      for (let s = 0; s < st.h; s++) {
        const x = Math.round(X(s)), y = height + 2 - s;
        buf.set(x, y, KELP[s < st.h * 0.3 ? 1 : 2]);
      }
      for (const b of st.blades) {
        const bx = X(b.s), by = height + 2 - b.s;
        const sway = Math.sin(t + st.ph - b.s * st.k) * 0.45 + Math.sin(t * 2 + b.ph) * 0.12;
        // blade starts angled up/out, then droops with the current
        const a0 = -Math.PI / 2 + b.side * 0.75 + sway;
        for (let i = 0; i < b.len; i++) {
          const u = i / b.len;
          const ang = a0 + b.side * u * b.droop * 0.9 + sway * u;
          const cx = bx + Math.cos(ang) * i * 0.95, cy = by + Math.sin(ang) * i * 0.8 + u * u * 3;
          const w = Math.sin(Math.min(1, u * 1.4 + 0.08) * Math.PI) * b.w;
          for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) {
            if (Math.abs(j) > w + 0.2) continue;
            const px = Math.round(cx - Math.sin(ang) * j * 0.7), py = Math.round(cy + Math.cos(ang) * j * 0.7);
            let l = 3.4 + (j * b.side < 0 ? 1.3 : -0.3) + u * 1.2 - (Math.abs(j) > w - 0.7 ? 0.9 : 0);
            if (Math.abs(j) < 0.5 && u > 0.1 && u < 0.85) l -= 0.8; // midrib
            buf.set(px, py, KELP[clamp(Math.round(l), 0, 6)], u > 0.8 ? 200 : 245);
          }
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
// On tall (portrait) screens the window grows upward so the tank fills the view.
export function tallExtra(H) { return clamp((H - 380) * 0.55, 0, 150); }
export function frameCurves(W, H, CY) {
  const k = clamp(W / 640, 0.45, 1.25);
  const extra = tallExtra(H);
  const camY0 = CY - extra * 0.3;
  const off = H / 2 - camY0; // world y -> screen y at the glass plane
  const top = (x) => { const u = (x - W / 2) / (W / 2); return 32 - extra + off + 36 * k * (1 - u * u); };
  const sill = (x) => { const u = (x - W / 2) / (W / 2); return 306 + off - 13 * k * (1 - u * u); };
  return { top, sill, off, extra, camY0, topWorld: 32 - extra };
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

// ------------------------------------------------------------------ cupid --
// A stone cherub on a fluted pedestal, drawing a bow with a heart-tipped
// arrow, little wings behind, a sash round the hips and curls on his head.
// Height-field sculpted and lit like the carved head; pale rose marble with
// coral growing on the pedestal.
const MARBLE = ramp(['#0b0f26', '#151b3a', '#22294f', '#333a66', '#474e7e', '#5f6596', '#7a7fad', '#989bc2', '#b8b6d6', '#d8d0e8', '#f2eaf6'], 11);
const ROSE = ramp(['#4a1030', '#7a1c46', '#b02e5c', '#e0507a', '#ff86a4'], 5);
export function genCupid(k = 1.35) {
  const W = Math.round(104 * k), Ht = Math.round(156 * k), cx = 52;
  const g = (x, y, mx, my, sx, sy) => Math.exp(-(((x - mx) / sx) ** 2) - (((y - my) / sy) ** 2));
  const heights = new Float32Array(W * Ht), part = new Uint8Array(W * Ht), coral = new Float32Array(W * Ht);
  const tubeH = (x, y, ax, ay, bx, by, ra, rb) => {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / l2);
    const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t)), r = ra + (rb - ra) * t;
    return d < r ? r * Math.sqrt(1 - (d / r) ** 2) : -1;
  };
  const add = (v, o) => (v > 0 ? v + o : -1);
  const curl = (x, y) => {
    const sp = 3.8, row = Math.round(y / (sp * 0.87)), off = (row % 2) * sp * 0.5;
    const d = Math.hypot(x - (Math.round((x - off) / sp) * sp + off), y - row * sp * 0.87);
    return d < 2 ? 2 * (1 - (d / 2) ** 2) : -0.7;
  };
  // the bow: an arc of a circle, tips at the top and bottom
  const BX = cx - 4, BY = 60, bowR = 26, bowA = 0.95;   // circle the bow is an arc of
  const tipT = [BX - Math.cos(bowA) * bowR, BY - Math.sin(bowA) * bowR];
  const tipB = [tipT[0], BY + Math.sin(bowA) * bowR];
  const hand = [cx + 3, 60];                              // the hand drawing the string
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    // sample the design at 1/k so the bigger statue keeps crisp detail
    const X = (x + 0.5) / k, Y = (y + 0.5) / k, dx = X - cx;
    let h = -1, p = 0;
    const put = (hh, pp) => { if (hh > h) { h = hh; p = pp; } };
    // wings, behind everything: rounded on top, rows of scalloped feathers,
    // the long flight feathers fanning out at the bottom
    for (const s of [-1, 1]) {
      const ox = (X - (cx + s * 18)) * s, oy = Y - 45;
      const ca = Math.cos(0.55), sa = Math.sin(0.55);
      const u = ox * ca + oy * sa, v = -ox * sa + oy * ca;   // u along the wing, v across it
      const top = -8.5 * Math.sqrt(Math.max(0, 1 - (u / 15) ** 2));
      const bot = 7 + 2.2 * Math.abs(Math.sin(u * 0.75));
      if (u > -13 && u < 15 && v > top && v < bot * Math.sqrt(Math.max(0, 1 - (u / 16) ** 2)) + 1) {
        let wh = 6 - (v - top) * 0.12;
        const row = ((v - top) + 2.4 * Math.abs(Math.sin(u * 0.75))) / 3.6;
        if (row % 1 < 0.2 && v > top + 2) wh -= 1.3;
        put(wh, 0);
      }
    }
    // chubby legs: one standing, one kicked back
    put(add(tubeH(X, Y, cx - 5, 80, cx - 6, 101, 6, 3.8), 2), 0);
    put(add(tubeH(X, Y, cx - 6, 101, cx - 3, 104, 3.6, 3), 2), 0);
    put(tubeH(X, Y, cx + 5, 80, cx + 11, 90, 5.6, 4.2), 0);
    put(tubeH(X, Y, cx + 11, 90, cx + 16, 96, 4.2, 3), 0);
    // round belly and chest
    const tb = Math.hypot(dx / 13.5, (Y - 64) / 17);
    if (tb < 1) put(13 * Math.sqrt(1 - tb * tb) + 2 - 1.2 * g(X, Y, cx, 70, 1, 1), 0);
    // sash across the hips, with folds
    const sd = (Y - (76 + dx * 0.28));
    if (Math.abs(sd) < 3.4 && Math.abs(dx) < 15) put(h + 1.6 - (((X * 0.8 + Y) % 4) < 1 ? 0.9 : 0), 0);
    // head with curls
    const hd = Math.hypot(dx / 12, (Y - 32) / 12.5);
    if (hd < 1) {
      let hh = 12 * Math.sqrt(1 - hd * hd) + 4;
      if (Y < 30 - 0.04 * dx * dx || hd > 0.82) hh += curl(X, Y);
      else {
        hh += 2 * g(X, Y, cx - 5, 37, 3.4, 2.6) + 2 * g(X, Y, cx + 5, 37, 3.4, 2.6);   // cheeks
        hh += 1.3 * g(X, Y, cx, 34.5, 1.4, 1.8);                                       // nose
        for (const s of [-1, 1]) {                                                     // closed, smiling eyes
          const ex = X - (cx + s * 4.6);
          if (Math.abs(ex) < 2.6 && Math.abs(Y - (31.2 + 0.22 * ex * ex)) < 0.55) hh -= 1.8;
        }
        if (Math.abs(dx) < 3.2 && Math.abs(Y - (39.5 - 0.1 * dx * dx)) < 0.55) hh -= 1.6;   // smile
      }
      put(hh, 0);
    }
    put(add(tubeH(X, Y, cx, 44, cx, 50, 4.5, 5), 6), 0); // neck
    // left arm out to the side holding the bow
    put(add(tubeH(X, Y, cx - 10, 53, cx - 24, 60, 3.6, 2.8), 9), 0);
    put(add(tubeH(X, Y, cx - 25, 60, cx - 26, 60, 3.2, 3.2), 10), 0);
    // right arm drawing the string back to the chest
    put(add(tubeH(X, Y, cx + 10, 53, cx + 13, 63, 3.6, 3), 9), 0);
    put(add(tubeH(X, Y, cx + 13, 63, hand[0], hand[1], 3, 2.6), 10), 0);
    put(add(tubeH(X, Y, hand[0], hand[1], hand[0] - 1, hand[1], 2.8, 2.8), 11), 0);
    // the bow itself: thick at the grip, tapering to the tips
    const bd = Math.hypot(X - BX, Y - BY), ba = Math.atan2(Y - BY, -(X - BX));
    if (Math.abs(ba) < bowA && Math.abs(bd - bowR) < 0.9 + 0.9 * Math.cos(ba * 1.4)) put(13, 0);
    // bowstring: from each tip back to the drawing hand
    for (const tip of [tipT, tipB]) put(add(tubeH(X, Y, tip[0], tip[1], hand[0], hand[1], 0.6, 0.6), 12), 0);
    // the arrow, flying left, with a heart-shaped tip
    put(add(tubeH(X, Y, hand[0], 60, 11, 60, 0.9, 0.9), 13), 0);
    const hx = (X - 7) / 5.4, hy = (Y - 60) / 5.4;
    { const u = -hy * 1.1, v = hx * 1.1 + 0.25; const q = u * u + v * v - 1; if (q * q * q - u * u * v * v * v <= 0) put(14.5, 2); }
    // fletching near the hand
    for (const s of [-1, 1]) put(add(tubeH(X, Y, hand[0] - 9, 60, hand[0] - 5, 60 + s * 2.8, 1, 0.5), 13), 2);
    // pedestal: a capital slab, a fluted column with a heart relief, a base
    if (Y >= 104 && Y < 110 && Math.abs(dx) < 23 - (Y < 106 ? 0 : 1)) put(12 + (Y < 105 ? -1 : 0), 1);
    if (Y >= 110 && Y < 144 && Math.abs(dx) < 17) {
      let ch = 14 * Math.sqrt(1 - (dx / 17.5) ** 2);
      if (Math.abs(Math.sin(dx * 0.62)) > 0.93) ch -= 1.4;
      put(ch, 1);
      const u = (dx) / 6.5, v = -(Y - 126) / 6.5 + 0.25;
      const q = u * u + v * v - 1;
      if (q * q * q - u * u * v * v * v <= 0) put(ch + 1.8, 2);
    }
    if (Y >= 144 && Math.abs(dx) < 25 - (Y > 150 ? 0 : (150 - Y) * 0.3)) put(15 - (Y < 146 ? 1 : 0), 1);
    if (h > 0) {
      h += (fbm(X * 0.25, Y * 0.25, 71, 2) - 0.5) * 1.2;
      heights[y * W + x] = h * k; part[y * W + x] = p + 1;
      coral[y * W + x] = p === 1 ? fbm(X * 0.12, Y * 0.12, 73, 3) + (Y > 130 ? 0.12 : 0) : fbm(X * 0.1, Y * 0.1, 79, 2) - 0.25;
    }
  }
  // occlusion from blurred height
  const blur = new Float32Array(W * Ht), R = 3;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    if (!part[y * W + x]) continue;
    let s = 0, n = 0;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Ht) continue;
      s += heights[yy * W + xx]; n++;
    }
    blur[y * W + x] = s / n;
  }
  const buf = new Buf(W, Ht), light = new Buf(W, Ht);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? 0 : heights[y * W + x]);
  const mk = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? 0 : part[y * W + x]);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!part[i]) continue;
    const hx = at(x + 1, y) - at(x - 1, y), hy = at(x, y + 1) - at(x, y - 1);
    let nx = -hx * 0.45, ny = -hy * 0.45, nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const dif = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
    const cav = clamp((blur[i] - heights[i]) * 0.22, -0.3, 0.6);
    let b = 0.14 + dif * 0.8 - cav * 0.55;
    b *= 1 - 0.28 * (y / Ht);
    b += (noise2(x * 0.6, y * 0.6, 81) - 0.5) * 0.07;
    let lvl = b * (MARBLE.length - 1) + (part[i] === 2 ? -1 : 0);
    if (!mk(x, y - 1) && dif > 0.3) lvl += 1.5;
    if (!mk(x, y + 1) || !mk(x - 1, y) || !mk(x + 1, y)) lvl -= 1.2;
    const idx = clamp(Math.round(lvl + (bayer(x, y) - 0.5) * 0.9), 0, MARBLE.length - 1);
    let col = MARBLE[idx];
    if (part[i] === 3) col = mixRGB(col, ROSE[clamp(Math.round(dif * 4.5 + (bayer(x, y) - 0.5)), 0, 4)], 0.6);
    else if (coral[i] > 0.62 && -ny > 0.1) col = mixRGB(col, ROSE[clamp(Math.round(dif * 4 + (bayer(x, y) - 0.5)), 0, 4)], 0.55);
    buf.set(x, y, col);
    if (-ny > 0.2 && dif > 0.35) light.set(x, y, [255, 255, 255], Math.round(clamp((-ny - 0.2) * 1.6) * 255));
  }
  // dark outline so it holds its shape against the reef
  const out = new Buf(W, Ht);
  out.d.set(buf.d);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    if (part[y * W + x]) continue;
    if (mk(x + 1, y) || mk(x - 1, y) || mk(x, y + 1) || mk(x, y - 1)) out.set(x, y, [6, 8, 24], 230);
  }
  const c = out.toCanvas();
  c.light = light.toCanvas();
  return c;
}
