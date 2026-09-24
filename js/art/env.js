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
  return shadeStone(W, Ht, heights, mask, mossy);
}

// Lights a carved height field as mossy stone (shared by the statues).
function shadeStone(W, Ht, heights, mask, mossy, PAL = STONE, mossAmt = 0.4) {
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
      let lvl = b * (PAL.length - 1);
      if (!mk(x, y - 1) && dif > 0.3) lvl += 1.5;
      if (!mk(x, y + 1) || !mk(x - 1, y) || !mk(x + 1, y)) lvl -= 1.2;
      const idx = clamp(Math.round(lvl + (bayer(x, y) - 0.5) * 0.9), 0, PAL.length - 1);
      let col = PAL[idx];
      const up = -ny;
      if (mossy[y * W + x] > 0.7 && up > 0.25) col = mixRGB(col, MOSS[clamp(Math.round(dif * 4 + (bayer(x, y) - 0.5)), 0, 4)], mossAmt);
      buf.set(x, y, col);
      if (up > 0.2 && dif > 0.35) light.set(x, y, [255, 255, 255], Math.round(clamp((up - 0.2) * 1.6) * 255));
    }
  }
  const c = buf.toCanvas();
  c.light = light.toCanvas();
  return c;
}


// The main tank's centrepiece: a round little candy character dressed as the
// Statue of Liberty, crown of spikes, torch held high, a tablet in the other
// arm and a draped robe, standing on a stepped plinth. All carved in stone.
// a chunky lowercase m inside the box (x0, y0, w, h)
function mGlyph(X, Y, x0, y0, w, h) {
  const u = (X - x0) / w, v = (Y - y0) / h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  const sw = 0.2;
  if (v > 0.35 && (u < sw || Math.abs(u - 0.5) < sw / 2 || u > 1 - sw)) return true;   // three legs
  for (const c of [0.28, 0.72]) { const d = Math.hypot((u - c) / 0.28, (v - 0.42) / 0.42); if (d < 1 && d > 0.45 && v < 0.42) return true; } // two arches
  return false;
}

export function genLiberty() {
  const W = 132, Ht = 214, cx = 66;
  const heights = new Float32Array(W * Ht), mask = new Uint8Array(W * Ht), mossy = new Float32Array(W * Ht);
  const g = (x, y, mx, my, sx, sy) => Math.exp(-(((x - mx) / sx) ** 2) - (((y - my) / sy) ** 2));
  const seg = (x, y, ax, ay, bx, by, r, hh) => {
    const vx = bx - ax, vy = by - ay, t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy));
    const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
    return d < r ? hh * Math.sqrt(1 - (d / r) ** 2) + 4 : -1;
  };
  const by0 = 104, bry = 36, brx = 31; // the round body
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const X = x + 0.5, dx = X - cx, adx = Math.abs(dx);
    let h = -1;
    // plinth: two steps and a block with a doorway
    if (y >= 176) {
      // a spiky star-shaped base under the plinth
      const step = y >= 204 ? Math.min(52, 42 + Math.abs(Math.sin(X * 0.35)) * 9) : y >= 196 ? 30 : 28;
      if (adx < step) {
        let ph = 10 - (adx / step) * 3;
        if (y < 204 && y > 194 && adx < 7) ph -= 5; // doorway
        if (y === 184 || y === 196 || y === 204) ph -= 1.5;
        if (y > 178 && y < 183 && adx < 22 && adx % 6 < 3) ph += 1; // little windows
        if (mGlyph(X, y, cx - 8, 186, 16, 7)) ph += 1.6;             // the m on the plinth
        if (y > 197 && y < 200 && (adx > 9 && adx < 20) && adx % 4 < 2) ph += 1; // little studs
        h = Math.max(h, ph);
      }
    }
    // robe falling from the body down to the plinth
    if (y > 120 && y < 178) {
      const t = (y - 120) / 58, hw = 30 - t * 6;
      if (adx < hw) {
        let rh = 13 * Math.sqrt(1 - (dx / hw) ** 2);
        const fold = ((X * 0.6 + y * 0.35 + 30) % 6);
        rh += fold < 1.3 ? -1.4 : fold < 3 ? 0.6 : 0;
        h = Math.max(h, rh);
      }
    }
    // body / face
    const bx = dx / brx, byy = (y - by0) / bry, br = bx * bx + byy * byy;
    if (br < 1) {
      let bh = 22 * Math.sqrt(1 - br);
      // big sassy eyes: bulging whites, heavy half-closed lids, big pupils
      // low in the eye, flicked lashes at the outer corners, thin brows
      for (const sd of [-1, 1]) {
        const ex = cx + sd * 11, ey = 91;
        const e = Math.hypot((X - ex) / 8, (y - ey) / 6.5);
        if (e < 1) {
          bh += 3 * Math.sqrt(1 - e * e);
          const lid = ey - 1.2 + 0.03 * (X - ex) ** 2;
          if (y < lid) bh += 1.6;                                        // the lid comes down over the top half
          if (Math.abs(y - lid) < 0.7) bh += 1.2;                        // lid edge
          if (y > lid && Math.hypot((X - ex + sd * 1.5) / 3, (y - ey - 2) / 2.6) < 1) bh -= 2.6; // pupil
        }
        for (let q = 0; q < 3; q++) { // lashes
          const lx = ex + sd * (6.5 + q * 1.2), ly = ey - 3 + q * 1.4;
          if (Math.hypot(X - lx - sd * 1.4, y - ly + 1.4) < 0.9) bh += 2.6;
        }
        const brow = ey - 10 - 0.05 * (X - ex) ** 2 + sd * (X - ex) * 0.1;
        if (Math.abs(y - brow) < 0.9 && Math.abs(X - ex) < 7) bh += 1.8;
      }
      // full, pouty lips in a little smile
      const lipY = 104 - 0.02 * dx * dx;
      if (adx < 11) {
        const up = Math.exp(-(((y - (lipY - 1.6)) / 1.6) ** 2)) * (1 - (adx / 11) ** 2);
        const lo = Math.exp(-(((y - (lipY + 2)) / 2) ** 2)) * (1 - (adx / 9.5) ** 2);
        bh += 3 * up + 3.6 * Math.max(0, lo);
        if (Math.abs(y - lipY) < 0.6) bh -= 2;
      }
      // the little "m" on the tummy, just above the robe
      if (mGlyph(X, y, cx - 7, 111, 14, 8)) bh += 2.2;
      // robe draped across from one shoulder
      if (y > 124 - dx * 0.5) { const f = ((X + y * 0.8) % 7); bh += 2 + (f < 1.2 ? -1.2 : 0); }
      h = Math.max(h, bh);
    }
    // crown band and seven spikes
    if (y > 64 && y < 74 && adx < 26 - Math.abs(y - 69) * 0.5) h = Math.max(h, 24 - adx * 0.2 + (Math.abs(y - 69) < 1 ? 1 : 0));
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.36, bxs = cx + Math.cos(a) * 20, bys = 66 + Math.sin(a) * 4;
      const tx = cx + Math.cos(a) * 44, ty = 70 + Math.sin(a) * 36;
      const vx = tx - bxs, vy = ty - bys, t = clamp(((X - bxs) * vx + (y - bys) * vy) / (vx * vx + vy * vy));
      const d = Math.hypot(X - bxs - vx * t, y - bys - vy * t), r = 3.6 * (1 - t) + 0.6;
      if (d < r) h = Math.max(h, 12 * (1 - t) + 10 + (1 - d / r) * 3);
    }
    // raised arm with the torch (viewer's left)
    h = Math.max(h, seg(X, y, cx - 26, 104, cx - 38, 62, 5.5, 8));
    h = Math.max(h, seg(X, y, cx - 38, 62, cx - 42, 36, 4.5, 7));
    const hand = Math.hypot((X - (cx - 42)) / 5.5, (y - 34) / 5);
    if (hand < 1) h = Math.max(h, 10 * Math.sqrt(1 - hand * hand) + 6);
    // torch handle, cup and flame
    if (Math.abs(X - (cx - 43)) < 2.4 && y > 16 && y < 34) h = Math.max(h, 9);
    if (y > 12 && y < 19 && Math.abs(X - (cx - 43)) < 6 - (19 - y) * 0.3) h = Math.max(h, 11 + ((X | 0) % 2));
    { const fy = (y - 6) / 8, fx = (X - (cx - 43)) / (5.5 * (1 - Math.max(0, -fy) * 0.9));
      if (y < 13 && fy > -1.1 && Math.abs(fx) < 1) h = Math.max(h, 12 * Math.sqrt(1 - fx * fx) + 6 + Math.sin(y * 1.3 + X) * 1.2); }
    // the other arm hugging a tablet (viewer's right)
    if (X > cx + 18 && X < cx + 46 && y > 96 && y < 142) {
      const u = X - (cx + 18) - (y - 96) * 0.12;
      if (u > 2 && u < 26) { let th = 17; if (y < 99 || u < 3.5 || u > 24.5) th += 1.2; if (Math.abs(y - 108) < 0.7 && u > 6 && u < 22) th -= 1.2; h = Math.max(h, th); }
    }
    const hand2 = Math.hypot((X - (cx + 20)) / 5.5, (y - 126) / 5);
    if (hand2 < 1) h = Math.max(h, 12 * Math.sqrt(1 - hand2 * hand2) + 12);
    if (h > 0) {
      h += (fbm(X * 0.2, y * 0.2, 61, 3) - 0.5) * 1.8;
      heights[y * W + x] = h; mask[y * W + x] = 1;
      mossy[y * W + x] = fbm(X * 0.09, y * 0.09, 67, 3);
    }
  }
  return shadeStone(W, Ht, heights, mask, mossy);
}

// Turns any sprite into carved stone: its shading is kept, its colours are
// swapped for the tank's blue-grey stone, with a little speckle.
export function toStone(img) {
  const c = makeCanvas(img.width, img.height);
  c.ctx.drawImage(img, 0, 0);
  const id = c.ctx.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (!d[i + 3]) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
    const n = (noise2(x * 0.7, y * 0.7, 77) - 0.5) * 0.9 + (bayer(x, y) - 0.5) * 0.7;
    const col = STONE[clamp(Math.round(1.5 + Math.pow(l, 0.8) * 8.5 + n), 0, STONE.length - 1)];
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  c.ctx.putImageData(id, 0, 0);
  c.ox = img.ox; c.oy = img.oy;
  return c;
}

// The chubby garden bunny: a near-perfect ball of a body with carved fur
// running all over it, a little smug face at the top, a heavy-lidded eye,
// long ears laid flat along its back, tiny paws folded on its tummy and a
// foot poking out underneath. Weathered cement with an olive-gold patina.
const PATINA = ramp(['#0e120a', '#1c2212', '#2c3218', '#3e4420', '#525828', '#686c30', '#80823c', '#9a9a4c', '#b4b262', '#cccb80', '#e2e0a4'], 11);
export function genBunny() {
  const W = 128, Ht = 122;
  const buf = new Buf(W, Ht);
  const P = STONE, N = P.length - 1;   // carved stone, like the tank's rocks
  const L = [-0.55, -0.62, 0.56];                      // light from the top left
  const idx = new Int8Array(W * Ht).fill(-1);          // ramp index per pixel
  const put = (x, y, i) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < Ht) idx[y * W + x] = clamp(Math.round(i), 0, N); };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? -1 : idx[y * W + x]);
  // a shaded ellipsoid blob: bias lightens or darkens it
  const blob = (cx, cy, rx, ry, bias = 0, rot = 0) => {
    const c = Math.cos(rot), s2 = Math.sin(rot), R = Math.max(rx, ry) + 1;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = (dx * c + dy * s2) / rx, v = (-dx * s2 + dy * c) / ry, r = u * u + v * v;
      if (r > 1) continue;
      const nz = Math.sqrt(1 - r), nx = dx / Math.max(rx, ry), ny = dy / Math.max(rx, ry);
      const l = clamp(nx * L[0] + ny * L[1] + nz * L[2]);
      put(x, y, 1.2 + l * (N - 2) + bias + (bayer(x, y) - 0.5) * 0.9);
    }
  };
  // the ball of a body
  const bx = 70, by = 64, br = 50;
  blob(bx, by, br, br * 1.02);
  // (smooth stone, no fur) the face looks out at you from the upper left
  const fx = 40, fy = 46;
  // ears: one flopped down the right side, the other just peeking over the top
  blob(80, 20, 9, 6, 0.4, -0.2);
  for (let i = 0; i <= 40; i++) { const t = i / 40; blob(lerp(84, 112, t), lerp(24, 50, t) - Math.sin(t * Math.PI) * 6, 8 - t * 2, 6 - t * 1.5, 0.7, 0.7); }
  for (let i = 6; i < 34; i++) { const t = i / 40; put(lerp(84, 112, t) - 1, lerp(24, 50, t) - Math.sin(t * Math.PI) * 6 + 1, 3); }
  // soft cheeks and a round snout
  blob(fx + 1, fy + 2, 11, 8, 1.1);
  // nose
  put(fx - 9, fy - 3, 1); put(fx - 8, fy - 3, 1); put(fx - 9, fy - 2, 2);
  // a little open smile
  for (let y = -3; y <= 4; y++) for (let x = -8; x <= 8; x++) {
    const m = (x / 6.5) ** 2 + ((y - 1) / 2.6) ** 2, top = -0.8 + 0.03 * x * x;
    if (m < 1 && y > top) put(fx - 3 + x, fy + 5 + y, m < 0.6 ? 0 : 1);
    if (Math.abs(y - top) < 0.8 && Math.abs(x) < 7) put(fx - 3 + x, fy + 5 + y, N - 2);
  }
  put(fx - 10, fy + 3, 1); put(fx + 4, fy + 4, 1);
  // a big glossy eye with a heavy lid
  const ex = fx + 20, ey = fy - 8;
  for (let y = -7; y <= 7; y++) for (let x = -10; x <= 10; x++) {
    const e = (x / 8.5) ** 2 + (y / 5.2) ** 2, lid = -4.4 + 0.05 * x * x;
    if (e < 1 && y > lid) put(ex + x, ey + y, e > 0.75 ? 1 : 0);
    if (Math.abs(y - lid) < 1.2 && Math.abs(x) < 9) put(ex + x, ey + y, y < lid ? N : N - 2);
    if (Math.abs(y - (lid - 2.4)) < 0.6 && Math.abs(x) < 7) put(ex + x, ey + y, 3);
  }
  put(ex - 3, ey - 1, N); put(ex - 2, ey - 1, N); put(ex - 3, ey, N - 1); put(ex + 3, ey + 2, 4);
  // an arm resting across the tummy, toes at its left end
  for (let i = 0; i <= 30; i++) { const t = i / 30; blob(lerp(52, 88, t), lerp(84, 98, t), 7 - t * 1.5, 5.5, 1.2); }
  for (let i = 0; i < 3; i++) put(47, 82 + i * 2, 2);
  // a foot underneath and a paw peeking round the left side
  blob(50, 112, 12, 6, 0.6);
  for (let i = 0; i < 3; i++) put(41 + i * 3, 114, 2);
  blob(18, 64, 5, 9, 0.3);
  // outline, then paint
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const i = get(x, y);
    if (i < 0) continue;
    const edge = get(x - 1, y) < 0 || get(x + 1, y) < 0 || get(x, y - 1) < 0 || get(x, y + 1) < 0;
    buf.set(x, y, P[edge ? Math.min(i, 1) : i]);
  }
  const c = buf.toCanvas();
  // a light mask for the water caustics: the lit upper faces
  const lb = new Buf(W, Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) { const i = get(x, y); if (i >= N - 3) lb.set(x, y, [255, 255, 255], 160); }
  c.light = lb.toCanvas();
  return c;
}

// A little stone frog sitting up, for the other side of the reef.
export function genFrog() {
  const W = 56, Ht = 46;
  const heights = new Float32Array(W * Ht), mask = new Uint8Array(W * Ht), mossy = new Float32Array(W * Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const X = x + 0.5, Y = y + 0.5;
    let h = -1;
    const b = Math.hypot((X - 28) / 20, (Y - 30) / 15);
    if (b < 1) h = 14 * Math.sqrt(1 - b * b) + (Math.abs(Y - 30 + 0.025 * (X - 28) ** 2) < 0.7 && Math.abs(X - 28) < 12 ? -1.8 : 0);
    for (const sd of [-1, 1]) {
      const e = Math.hypot((X - 28 - sd * 11) / 5.5, (Y - 16) / 5);
      if (e < 1) h = Math.max(h, 14 + 4 * Math.sqrt(1 - e * e) - (Math.hypot(X - 28 - sd * 11, Y - 16) < 2 ? 2.4 : 0));
      const l = Math.hypot((X - 28 - sd * 17) / 7, (Y - 40) / 5);
      if (l < 1) h = Math.max(h, 10 + 3 * Math.sqrt(1 - l * l));
    }
    if (h > 0) { h += (fbm(X * 0.3, Y * 0.3, 71, 2) - 0.5) * 1.4; heights[y * W + x] = h; mask[y * W + x] = 1; mossy[y * W + x] = fbm(X * 0.1, Y * 0.1, 73, 3); }
  }
  return shadeStone(W, Ht, heights, mask, mossy);
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
