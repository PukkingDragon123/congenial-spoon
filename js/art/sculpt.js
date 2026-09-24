// Sculpted pixel art: characters are described as a height field with a
// material per pixel, then lit the same way as the fish and the stone head:
// a normal from the height, light from above-left, soft occlusion in the
// creases, a bright rim where the top edge catches the surface light, a
// Bayer-dithered colour ramp per material, and a coloured outline (a dark
// shade of whatever it borders, never flat black).
import { clamp, bayer, Buf, mixRGB } from '../util.js';

const LD = (() => { const v = [-0.45, -0.78, 0.52]; const l = Math.hypot(...v); return v.map((a) => a / l); })();

// Height of an ellipsoid cap at offset (dx, dy), or -1 outside it.
export function dome(dx, dy, rx, ry, hmax) {
  const r = (dx / rx) ** 2 + (dy / ry) ** 2;
  return r < 1 ? hmax * Math.sqrt(1 - r) : -1;
}
// Height of a capsule (a rounded tube) from a to b, radius ra -> rb.
export function tube(x, y, ax, ay, bx, by, ra, rb, hk = 1) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / l2);
  const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t)), r = ra + (rb - ra) * t;
  return d < r ? r * hk * Math.sqrt(1 - (d / r) ** 2) : -1;
}

/**
 * field(x, y) -> null | [height, material]   (x, y at pixel centres)
 * mats[id] = { pal: [[r,g,b],...] (dark -> light), flat?: true, bias?: n, rim?: n }
 */
export function sculpt(w, h, field, mats, o = {}) {
  const H = new Float32Array(w * h), M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = field(x + 0.5, y + 0.5);
    if (v && v[0] > 0) { H[y * w + x] = v[0]; M[y * w + x] = v[1]; }
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : H[y * w + x]);
  const mt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : M[y * w + x]);
  // occlusion: how far below its neighbourhood each pixel sits
  const blur = new Float32Array(w * h);
  const R = o.cavR ?? 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!M[y * w + x]) continue;
    let s = 0, n = 0;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { s += at(x + i, y + j); n++; }
    blur[y * w + x] = s / n;
  }
  const buf = new Buf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = M[i];
    if (!m) continue;
    const mat = mats[m];
    const pal = mat.pal, n = pal.length;
    if (mat.flat) { buf.set(x, y, pal[Math.min(n - 1, mat.lvl ?? 0)]); continue; }
    const hc = H[i];
    // edges fall away so silhouettes read as rounded
    const hs = (xx, yy) => (mt(xx, yy) ? at(xx, yy) : hc - 3);
    const gx = hs(x + 1, y) - hs(x - 1, y), gy = hs(x, y + 1) - hs(x, y - 1);
    let nx = -gx * 0.5, ny = -gy * 0.5, nz = 1;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const dif = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
    const spec = Math.pow(Math.max(0, nz * 0.9 + (nx * LD[0] + ny * LD[1]) * 0.6), 12) * (mat.gloss ?? 0.4);
    const cav = clamp((blur[i] - hc) * 0.3, -0.2, 0.7);
    let b = 0.14 + dif * 0.78 + spec - cav * 0.55;
    b -= (y / h) * (o.fall ?? 0.12);
    let lvl = b * (n - 1) + (mat.bias ?? 0);
    // rim of light along the top edge, soft shade on the lower edges
    if (!mt(x, y - 1)) lvl += mat.rim ?? 1.2;
    else if (mt(x, y - 1) !== m && at(x, y - 1) < hc - 1.5) lvl += 0.6;
    if (!mt(x, y + 1)) lvl -= 0.8;
    // a crease where one part sits in front of another
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const mm = mt(x + dx, y + dy);
      if (mm && mm !== m && at(x + dx, y + dy) > hc + 1.6) { lvl -= 1.6; break; }
    }
    buf.set(x, y, pal[clamp(Math.round(lvl + (bayer(x, y) - 0.5) * (mat.dither ?? 0.85)), 0, n - 1)]);
  }
  // coloured outline around the whole shape
  const out = new Buf(w, h);
  out.d.set(buf.d);
  const dark = o.outline;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (M[y * w + x]) continue;
    let best = 0, bh = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const mm = mt(x + dx, y + dy);
      if (mm && at(x + dx, y + dy) > bh) { bh = at(x + dx, y + dy); best = mm; }
    }
    if (best) out.set(x, y, dark || mixRGB(mats[best].pal[0], [6, 8, 20], 0.45).map(Math.round));
  }
  return out.toCanvas();
}
