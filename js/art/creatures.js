// Non-fish-shaped creatures: eagle ray (3D surface splatted to pixels),
// sea turtle (implicit shapes + voronoi scutes) and glowing jellyfish.
import { TAU, clamp, ramp, bayer, hash2, Buf, pointInPoly, mixRGB, smoothstep, fract } from '../util.js';
import { B, timed } from './budget.js';

const cache = new Map();
const sizes = new Map(); // kind -> Set of sizes rendered
// key = kind|size|frame|extra. Over budget, fall back to the nearest cached size.
const cached = (key, fn) => {
  let c = cache.get(key);
  if (c) return c;
  const [kind, size, ...rest] = key.split('|');
  if (B.left <= 0) {
    const set = sizes.get(kind);
    if (set && set.size) {
      let best = -1, bd = 1e9;
      for (const s of set) { const d = Math.abs(s - size); if (d < bd) { bd = d; best = s; } }
      const fb = cache.get([kind, best, ...rest].join('|'));
      if (fb) return fb;
    }
  }
  c = timed(fn);
  cache.set(key, c);
  let set = sizes.get(kind);
  if (!set) sizes.set(kind, (set = new Set()));
  set.add(+size);
  return c;
};

// Edge pass shared by creature sprites: rim light on top edges, sel-out below.
function edgePass(buf, lightRamp) {
  const { w, h, d } = buf;
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const copy = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!copy[i + 3]) continue;
      const up = a(x, y - 1), dn = a(x, y + 1);
      let k = 0;
      if (!up) k = 0.28;
      else if (!dn) k = -0.35;
      if (k > 0) { d[i] += (lightRamp[0] - d[i]) * k; d[i + 1] += (lightRamp[1] - d[i + 1]) * k; d[i + 2] += (lightRamp[2] - d[i + 2]) * k; }
      else if (k < 0) { d[i] *= 1 + k; d[i + 1] *= 1 + k; d[i + 2] *= 1 + k; }
    }
  }
}

// ------------------------------------------------------------ eagle ray --
const RAY_TOP = ramp(['#070d1e', '#0e1830', '#172646', '#22365c', '#304a74', '#42608e'], 6);
const RAY_BOT = ramp(['#3c5480', '#6682ae', '#9ab4d6', '#d2e2f4', '#f2f8ff'], 5);
const RAY_SPOT = ramp(['#8ea8cc', '#d8e6f6', '#ffffff'], 3);

export const RAY_FRAMES = 16;

function rayHalfWidth(x) {
  if (x > 0.27 || x < -0.3) return -1;
  if (x > 0.15) { // head / snout
    const t = (x - 0.15) / 0.12;
    return 0.062 * Math.sqrt(Math.max(0, 1 - t * t));
  }
  const lead = x > -0.06 ? 0.5 + (0.062 - 0.5) * ((x + 0.06) / 0.21) : 0.5;
  const trail = x < -0.06 ? 0.5 * Math.pow(clamp((x + 0.3) / 0.24), 0.55) : 0.5;
  return Math.min(lead, trail);
}

export function renderRay(S, frame) {
  return cached('ray|' + S + '|' + frame, () => {
    const ph = (frame / RAY_FRAMES) * TAU;
    const e = 0.34, ce = Math.cos(e), se = Math.sin(e);
    const flapY = (x, z) => {
      const az = Math.abs(z);
      let y = 0.3 * Math.pow(az, 1.45) * Math.sin(ph - az * 2.4) + 0.012 * Math.sin(ph);
      if (az < 0.12) y += 0.032 * (1 - (az / 0.12) ** 2) * clamp((x + 0.25) / 0.2);
      return y;
    };
    const W = Math.ceil(S * 1.55), H = Math.ceil(S * 0.8);
    const ox = Math.round(S * 1.05), oy = Math.round(H * 0.5);
    const buf = new Buf(W, H);
    const zb = new Float32Array(W * H).fill(-1e9);
    const step = 0.4 / S;
    for (let x = -0.3; x <= 0.27; x += step) {
      const hw = rayHalfWidth(x);
      if (hw < 0) continue;
      for (let z = -hw; z <= hw; z += step) {
        const y = flapY(x, z);
        const sx = Math.floor(ox + x * S), sy = Math.floor(oy + (-y * ce + z * se) * S);
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const close = z * ce + y * se;
        const k = sy * W + sx;
        if (close <= zb[k]) continue;
        zb[k] = close;
        const dx = (flapY(x + 0.01, z) - flapY(x - 0.01, z)) / 0.02;
        const dz = (flapY(x, z + 0.01) - flapY(x, z - 0.01)) / 0.02;
        let nx = -dx, ny = 1, nz = -dz;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const facing = ny * se + nz * ce;
        const lit = clamp(nx * 0.25 + ny * 0.9 + nz * 0.35);
        let col;
        if (facing > 0) {
          let l = 1.2 + lit * 3.6 - Math.abs(z) * 1.2;
          const edge = hw - Math.abs(z);
          if (edge < 1.2 / S) l -= 0.8;
          // White spots on the back
          const gx = Math.floor(x * 16), gz = Math.floor(z * 16);
          const jx = (gx + 0.25 + hash2(gx, gz, 3) * 0.5) / 16, jz = (gz + 0.25 + hash2(gx, gz, 4) * 0.5) / 16;
          const spot = Math.hypot(x - jx, (z - jz) * 0.42) < 0.009 + hash2(gx, gz, 5) * 0.005 && hash2(gx, gz, 6) < 0.75 && x < 0.15;
          if (spot && S >= 40) col = RAY_SPOT[clamp(Math.round(lit * 2.2), 0, 2)];
          else col = RAY_TOP[clamp(Math.round(l + (bayer(sx, sy) - 0.5) * 0.6), 0, 5)];
        } else {
          const l = 1 + lit * 3 + (0.5 - Math.abs(z)) * 1.2;
          col = RAY_BOT[clamp(Math.round(l + (bayer(sx, sy) - 0.5) * 0.6), 0, 4)];
        }
        buf.set(sx, sy, col);
      }
    }
    // Whip tail
    const tb = [ox - 0.29 * S, oy - flapY(-0.29, 0) * ce * S];
    const tl = S * 0.8;
    for (let i = 0; i < tl; i++) {
      const t = i / tl;
      const tx = Math.floor(tb[0] - i);
      const ty = Math.floor(tb[1] + Math.sin(ph - t * 5) * t * S * 0.03 + t * t * S * 0.04);
      if (buf.alpha(tx, ty) === 0 || t > 0.05) buf.set(tx, ty, t < 0.3 ? RAY_TOP[1] : RAY_TOP[2], t > 0.85 ? 150 : 255);
    }
    // Eye on the near side of the head
    if (S >= 36) {
      const ex = Math.floor(ox + 0.19 * S), ey = Math.floor(oy + (-(flapY(0.19, 0.05) + 0.02) * ce + 0.05 * se) * S);
      buf.set(ex, ey, [4, 8, 16]);
    }
    edgePass(buf, [150, 200, 250]);
    const c = buf.toCanvas();
    c.ox = ox; c.oy = oy;
    return c;
  });
}

// ------------------------------------------------------------- turtle --
const SHELL = ramp(['#111a1a', '#1c2c2a', '#2a403a', '#3b574c', '#517061', '#6c8c78', '#90aa90', '#b8caa6'], 8);
const SKIN = ramp(['#131e26', '#213340', '#324a54', '#4a6466', '#64807c', '#86a298', '#b0c6ba'], 7);
const PLAS = ramp(['#5e7068', '#8a9e8e', '#b8c8b0', '#dce6d2'], 4);
export const TURTLE_FRAMES = 16;

function voronoi(u, v, seeds) {
  let d1 = 9, d2 = 9, k = -1;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const d = Math.hypot((u - s[0]) * (s[2] || 1), v - s[1]);
    if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
  }
  return [d1, d2, k];
}

const SCUTES = [
  [0.3, -0.16], [0.4, -0.19], [0.5, -0.19], [0.6, -0.16], [0.69, -0.1],
  [0.28, -0.07], [0.4, -0.1], [0.52, -0.1], [0.63, -0.07],
  [0.22, 0.0], [0.3, 0.02], [0.38, 0.025], [0.46, 0.028], [0.54, 0.028], [0.62, 0.025], [0.7, 0.01], [0.75, -0.03],
];

function flipperPoly(base, ang, len, wid, bend) {
  const pts = [];
  const n = 10;
  const c = Math.cos(ang), s = Math.sin(ang);
  const side = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const along = t * len;
    const off = bend * t * t;
    const hw = wid * Math.pow(Math.sin(Math.PI * Math.min(0.999, t * 0.9 + 0.1)), 0.8) * (1 - t * 0.35);
    const cxp = base[0] + c * along - s * off, cyp = base[1] + s * along + c * off;
    pts.push([cxp - s * hw * 0.35, cyp + c * hw * 0.35]);
    side.push([cxp + s * hw, cyp - c * hw]);
  }
  return pts.concat(side.reverse());
}

export function renderTurtle(L, frame) {
  return cached('turtle|' + L + '|' + frame, () => {
    const ph = (frame / TURTLE_FRAMES) * TAU;
    const W = Math.ceil(L * 1.25), H = Math.ceil(L * 0.95);
    const ox = Math.round(L * 0.1), oy = Math.round(H * 0.46);
    const buf = new Buf(W, H);
    const shellTop = (u) => {
      const t = (u - 0.46) / 0.29;
      return t * t >= 1 ? 1 : -0.2 * Math.pow(1 - t * t, 0.62) + 0.02;
    };
    const shellBot = (u) => 0.05 + 0.02 * ((u - 0.46) / 0.29) ** 2;
    const aNear = 3.0 + 0.95 * Math.cos(ph);
    const aFar = 3.0 + 0.95 * Math.cos(ph + 0.5);
    const near = flipperPoly([0.66, 0.045], aNear, 0.44, 0.075, 0.07 * Math.sin(ph));
    const far = flipperPoly([0.64, 0.0], aFar, 0.4, 0.065, 0.06 * Math.sin(ph + 0.5));
    const rear = flipperPoly([0.24, 0.055], Math.PI - 0.35 + 0.28 * Math.sin(ph + 1.2), 0.14, 0.05, 0.02);
    const rearFar = flipperPoly([0.26, 0.02], Math.PI - 0.55 + 0.28 * Math.sin(ph + 1.6), 0.12, 0.045, 0.02);
    const headBob = 0.008 * Math.sin(ph + 0.8);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const u = (px + 0.5 - ox) / L, v = (py + 0.5 - oy) / L;
        let col = null;
        const dit = (bayer(px, py) - 0.5) * 0.7;
        const scale = (uu, vv, sz) => {
          const gx = Math.floor(uu / sz), gy = Math.floor(vv / sz);
          let d1 = 9, d2 = 9;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const cx = (gx + i + hash2(gx + i, gy + j, 21)) * sz, cy = (gy + j + hash2(gx + i, gy + j, 22)) * sz;
            const d = Math.hypot(uu - cx, vv - cy);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          return d2 - d1 < sz * 0.18;
        };
        // Far-side limbs (behind)
        if (pointInPoly(u, v, far) || pointInPoly(u, v, rearFar)) {
          col = SKIN[clamp(Math.round(1.6 + dit - (scale(u, v, 0.035) ? 0.8 : 0)), 0, 6)];
        }
        // Head & neck
        const hx = (u - 0.845) / 0.088, hy = (v - 0.0 - headBob) / 0.06;
        const inNeck = u > 0.68 && u < 0.8 && v > -0.05 + headBob && v < 0.052;
        if (hx * hx + hy * hy < 1 || inNeck || (u > 0.9 && u < 0.94 && Math.abs(v - 0.012 - headBob) < 0.025 - (u - 0.9) * 0.5)) {
          let l = 3.6 - hy * 1.3 + dit;
          if (scale(u - headBob, v, hx * hx + hy * hy < 1 ? 0.03 : 0.022)) l -= 1.2;
          col = SKIN[clamp(Math.round(l), 0, 6)];
        }
        // Carapace & plastron
        if (u > 0.17 && u < 0.75) {
          const tp = shellTop(u), bt = shellBot(u);
          if (v > bt && v < bt + 0.035 && u > 0.22 && u < 0.7) col = PLAS[clamp(Math.round(2.4 - (v - bt) * 40 + dit), 0, 3)];
          if (v >= tp && v <= bt) {
            const hN = (bt - v) / (bt - tp);
            const [d1, d2, k] = voronoi(u, v, SCUTES);
            let l = 2.2 + hN * 3.2 + dit;
            const s = SCUTES[k];
            const ang = Math.atan2(v - s[1], u - s[0]);
            l += (fract(ang * 1.6 + hash2(k, 0, 3)) < 0.35 ? 0.7 : 0) - d1 * 14;
            if (d2 - d1 < 0.011) l = 0.6 + hN;
            if (v > bt - 0.018) l -= 1;
            col = SHELL[clamp(Math.round(l), 0, 7)];
          }
        }
        // Near limbs (front)
        if (pointInPoly(u, v, rear)) col = SKIN[clamp(Math.round(3.4 + dit - (scale(u, v, 0.03) ? 1 : 0)), 0, 6)];
        if (pointInPoly(u, v, near)) {
          let l = 4 + dit - (scale(u, v, 0.034) ? 1.1 : 0);
          col = SKIN[clamp(Math.round(l), 0, 6)];
        }
        if (col) buf.set(px, py, col);
      }
    }
    // Eye + beak line
    const ex = Math.floor(ox + 0.87 * L), ey = Math.floor(oy + (-0.012 + headBob) * L);
    buf.set(ex, ey, [6, 10, 16]); buf.set(ex + 1, ey, [6, 10, 16]); buf.set(ex, ey - 1, [200, 220, 230]);
    for (let i = 0; i < L * 0.05; i++) buf.set(Math.floor(ox + (0.9 + i / L) * L), Math.floor(oy + (0.018 + headBob) * L), SKIN[0]);
    edgePass(buf, [170, 220, 210]);
    const c = buf.toCanvas();
    c.ox = Math.round(ox + 0.5 * L); c.oy = oy;
    return c;
  });
}

// ------------------------------------------------------------ jellyfish --
export const JELLY_FRAMES = 20;
const JELLY_PALS = {
  pink: { rim: [255, 214, 238], body: [240, 150, 205], deep: [190, 90, 170], gon: [255, 120, 196], arm: [236, 150, 210] },
  blue: { rim: [210, 245, 255], body: [130, 200, 245], deep: [70, 130, 210], gon: [180, 240, 255], arm: [150, 210, 250] },
  violet: { rim: [238, 220, 255], body: [184, 146, 248], deep: [120, 80, 206], gon: [222, 176, 255], arm: [198, 164, 250] },
  gold: { rim: [255, 246, 214], body: [252, 204, 136], deep: [214, 134, 74], gon: [255, 224, 156], arm: [250, 212, 154] },
  nettle: { rim: [255, 236, 200], body: [244, 170, 96], deep: [196, 96, 50], gon: [255, 200, 130], arm: [255, 214, 170], long: true },
  // crystal jelly: nearly clear, with a ring of glowing green round the rim
  crystal: { rim: [150, 255, 200], body: [214, 238, 250], deep: [110, 230, 190], gon: [190, 250, 255], arm: [200, 240, 255] },
};
export function renderJelly(size, frame, hue = 'pink') {
  if (hue === 'manowar') return cached('mow|' + size + '|' + frame, () => manOWar(size, frame));
  return cached('jelly|' + size + '|' + frame + '|' + hue, () => {
    const ph = (frame / JELLY_FRAMES) * TAU;
    const pulse = Math.pow(Math.max(0, Math.sin(ph)), 1.5);
    const bw = size * (1 - 0.18 * pulse), bh = size * 0.62 * (1 + 0.16 * pulse);
    const long = (JELLY_PALS[hue] || {}).long;
    const W = Math.ceil(size * 1.4), H = Math.ceil(size * (long ? 4.6 : 2.6));
    const cx = W / 2, top = Math.round(size * 0.15);
    const buf = new Buf(W, H);
    const pal = JELLY_PALS[hue] || JELLY_PALS.blue;
    // Bell
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const x = (px + 0.5 - cx) / (bw / 2), y = (py + 0.5 - top - bh) / bh;
        if (y > 0.08 || y < -1) continue;
        const r = x * x + y * y;
        const scallop = 0.06 * Math.abs(Math.sin(x * 7 + ph));
        if (r <= 1 && y < 0.02 + scallop * (y > -0.1 ? 1 : 0)) {
          const edge = 1 - r;
          let col = pal.body, a = 120 + edge * 30;
          if (edge < 0.18) { col = pal.rim; a = 215; }
          // four soft glowing petals (solid lobes, no rings, so no faces)
          for (let q = 0; q < 4; q++) {
            const an = Math.PI / 4 + q * Math.PI / 2;
            const px2 = Math.cos(an) * 0.3, py2 = -0.46 + Math.sin(an) * 0.16;
            const d = Math.hypot((x - px2) / 0.2, (y - py2) / 0.13);
            if (d < 1) { col = mixRGB(col, pal.gon, 0.8 * (1 - d * d)); a = Math.max(a, 150 + 60 * (1 - d)); }
          }
          if (y > -0.05) { col = pal.deep; a = 170; }
          buf.set(px, py, col, a);
        }
      }
    }
    // Oral arms (frilly) and fine tentacles
    const baseY = top + bh * 1.02;
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * bw * 0.12;
      const len = size * (pal.long ? 2.6 : 1.3);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const x = cx + off + Math.sin(ph * 1 - t * 6 + k) * t * size * 0.16;
        const w = (1 - t) * 1.6 + 0.5;
        for (let j = -Math.floor(w); j <= Math.floor(w); j++) {
          if (hash2(i, j + k * 9, 4) < 0.25) continue;
          buf.blend(Math.floor(x + j), Math.floor(baseY + i), pal.arm, 170 * (1 - t * 0.7));
        }
      }
    }
    for (let k = 0; k < 9; k++) {
      const x0 = cx + (k / 8 - 0.5) * bw * 0.92;
      const len = size * (1.6 + hash2(k, 1, 2) * 0.6) * (pal.long ? 1.9 : 1);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const x = x0 + Math.sin(ph - t * 5 + k * 0.7) * t * size * 0.2;
        buf.blend(Math.floor(x), Math.floor(baseY - 1 + i), pal.rim, 120 * (1 - t));
      }
    }
    const c = buf.toCanvas();
    c.ox = Math.round(cx); c.oy = top + Math.round(bh * 0.6);
    return c;
  });
}

// Portuguese man o' war: a glossy blue-violet float with a pink crest like a
// little sail, a fringe of dark blue polyps under it, and long beaded blue
// tentacles trailing way down.
function manOWar(size, frame) {
  const ph = (frame / JELLY_FRAMES) * TAU;
  const W = Math.ceil(size * 1.7), H = Math.ceil(size * 4.4);
  const cx = W / 2, fy = Math.round(size * 0.42);
  const rx = size * 0.62, ry = size * 0.22;
  const buf = new Buf(W, H);
  const tilt = Math.sin(ph) * 0.06;
  // long beaded tentacles first, so the float sits over them
  for (let k = 0; k < 7; k++) {
    const x0 = cx + (k / 6 - 0.5) * rx * 1.1, len = size * (2.6 + hash2(k, 3, 1) * 1.2);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const x = x0 + Math.sin(ph - t * 4 + k) * t * size * 0.22;
      const bead = i % 4 === 0;
      buf.blend(Math.floor(x), Math.floor(fy + ry * 0.6 + i), bead ? [150, 190, 255] : [70, 110, 240], (bead ? 230 : 160) * (1 - t * 0.8));
    }
  }
  // polyps: short curly blobs hanging under the float
  for (let k = 0; k < 9; k++) {
    const x0 = cx + (k / 8 - 0.5) * rx * 1.3, l = size * (0.25 + hash2(k, 7, 2) * 0.25);
    for (let i = 0; i < l; i++) {
      const x = x0 + Math.sin(ph * 2 + i * 0.6 + k) * 1.2;
      buf.set(Math.floor(x), Math.floor(fy + ry * 0.5 + i), i > l - 2 ? [150, 110, 255] : [50, 70, 190], 235);
      buf.set(Math.floor(x) + 1, Math.floor(fy + ry * 0.5 + i), [40, 56, 160], 200);
    }
  }
  // the float
  for (let py = 0; py < fy + ry + 2; py++) for (let px = 0; px < W; px++) {
    const x = (px + 0.5 - cx) / rx, y0 = (py + 0.5 - fy) / ry - x * tilt * 4;
    const crest = 0.9 * Math.max(0, 1 - Math.pow(Math.abs(x + 0.1) / 0.75, 2)) * (1 + 0.15 * Math.sin(x * 9 + ph));
    const inFloat = x * x + y0 * y0 <= 1;
    const inCrest = !inFloat && y0 < 0 && y0 > -1 - crest && Math.abs(x) < 0.85;
    if (!inFloat && !inCrest) continue;
    let col;
    if (inCrest) { col = mixRGB([255, 140, 220], [200, 120, 255], clamp(-y0 - 1, 0, 1)); if (-y0 > 0.98 + crest - 0.18) col = [255, 200, 240]; }
    else {
      const l = clamp(0.5 - y0 * 0.5 - x * 0.2, 0, 1);
      col = mixRGB([90, 110, 240], [200, 160, 255], l);
      if (x * x + y0 * y0 > 0.8) col = mixRGB(col, [60, 70, 200], 0.6);
      if (Math.hypot(x + 0.35, y0 + 0.35) < 0.18) col = [240, 236, 255];
    }
    buf.set(px, py, col, inCrest ? 200 : 225);
  }
  const c = buf.toCanvas();
  c.ox = Math.round(cx); c.oy = fy;
  return c;
}

// A comb jelly: a tiny clear oval with eight rows of combs, and a rainbow
// running down the rows.
export function renderComb(size, frame) {
  return cached('comb|' + size + '|' + frame, () => {
    const W = Math.ceil(size * 1.4) + 2, H = Math.ceil(size * 1.9) + 2, cx = W / 2, cy = H / 2;
    const rx = size * 0.55, ry = size * 0.85;
    const buf = new Buf(W, H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) / rx, y = (py + 0.5 - cy) / ry, r = x * x + y * y;
      if (r > 1) continue;
      buf.set(px, py, r > 0.75 ? [220, 240, 255] : [180, 220, 250], r > 0.75 ? 170 : 70);
    }
    for (let k = 0; k < 4; k++) {
      const u = (k / 3 - 0.5) * 1.3;
      for (let i = 0; i < ry * 1.6; i++) {
        const y = -0.8 + i / (ry * 1.6) * 1.6, x = u * Math.sqrt(Math.max(0, 1 - y * y));
        const hue = ((i * 40 + frame * 45 + k * 60) % 360) / 360;
        const rgb = [0, 1, 2].map((n) => Math.round(255 * clamp(Math.abs(((hue * 6 + [0, 4, 2][n]) % 6) - 3) - 1, 0, 1) * 0.8 + 50));
        buf.set(Math.floor(cx + x * rx), Math.floor(cy + y * ry), rgb, 240);
      }
    }
    const c = buf.toCanvas();
    c.ox = Math.round(cx); c.oy = Math.round(cy);
    return c;
  });
}

// An octopus: a round mantle leaning back, big eyes, and eight arms that
// curl and ripple, with pale suckers down the undersides.
export const OCTO_FRAMES = 8;
const OCTO = ramp(['#3a0a10', '#6e1a1a', '#a8321e', '#d8522a', '#f27a3a', '#ffa860', '#ffd09a'], 7);
export function renderOctopus(S, frame, swim = 0) {
  return cached('octo|' + S + '|' + frame + '|' + swim, () => {
    const ph = (frame / OCTO_FRAMES) * TAU;
    const W = Math.ceil(S * 2.8), H = Math.ceil(S * 2.4), cx = W / 2;
    const buf = new Buf(W, H);
    const hy = S * 0.95; // where the arms meet
    const disc = (x, y, r, l) => {
      for (let py = Math.floor(y - r); py <= y + r; py++) for (let px = Math.floor(x - r); px <= x + r; px++) {
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        if (d > r) continue;
        const sh = l + (1 - d / r) * 1.5 - (py - (y - r)) / (2 * r + 1) * 1.2;
        buf.set(px, py, OCTO[clamp(Math.round(sh), 0, 6)]);
      }
    };
    // arms: back four darker, front four lighter
    for (const pass of [0, 1]) for (let k = pass; k < 8; k += 2) {
      const side = k < 4 ? -1 : 1, spread = ((k % 4) + 0.5) / 4;
      let x = cx + (k - 3.5) * S * 0.07, y = hy;
      let a = Math.PI / 2 + side * (0.25 + spread * 1.1) * (swim ? 0.35 : 1);
      const len = S * (swim ? 1.5 : 1.25) * (0.85 + hash2(k, 2, 5) * 0.3);
      const n = Math.ceil(len);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        a += (Math.sin(ph + k * 1.3 - t * 5) * 0.09 + side * (swim ? 0 : t * t * 0.28)) ;
        x += Math.cos(a); y += Math.sin(a) * (swim ? 1 : 0.55);
        const r = (1 - t) * S * 0.13 + 0.6;
        disc(x, y, r, pass ? 3.2 : 2);
        if (pass && i % 3 === 1 && r > 1.2) buf.set(Math.floor(x - side * r * 0.5), Math.floor(y + r * 0.6), [255, 206, 190]);
      }
    }
    // mantle
    const mx = cx - S * 0.05, my = hy - S * 0.5, mrx = S * 0.46, mry = S * 0.58;
    for (let py = Math.floor(my - mry); py <= hy + 1; py++) for (let px = Math.floor(mx - mrx - 2); px <= mx + mrx + 2; px++) {
      const x = (px + 0.5 - mx) / mrx, y = (py + 0.5 - my) / mry;
      if (x * x + y * y > 1) continue;
      let l = 4 - y * 1.6 - x * 1.1 + bayer(px, py) * 0.8;
      if (((px * 7 + py * 13) % 11) === 0) l -= 1.2; // bumpy skin
      buf.set(px, py, OCTO[clamp(Math.round(l), 0, 6)]);
    }
    // eyes
    for (const sd of [-1, 1]) {
      const ex = Math.round(cx + sd * S * 0.24), ey = Math.round(hy - S * 0.1);
      buf.set(ex - 1, ey, [255, 240, 200]); buf.set(ex, ey, [255, 240, 200]); buf.set(ex + 1, ey, [255, 240, 200]);
      buf.set(ex - 1, ey + 1, [255, 240, 200]); buf.set(ex, ey + 1, [20, 10, 10]); buf.set(ex + 1, ey + 1, [255, 240, 200]);
      buf.set(ex, ey - 1, OCTO[1]);
    }
    edgePass(buf, [255, 200, 150]);
    const c = buf.toCanvas();
    c.ox = Math.round(cx); c.oy = Math.round(hy);
    return c;
  });
}

// A pufferfish, nose left: a chubby yellow body covered in dark spots with a
// white belly, a little fan tail and fluttering fins. puff 0..1 blows it up
// into a round spiky ball; angry adds cross little brows.
export const PUFF_FRAMES = 6;
export function renderPuffer(S, frame, puff = 0, angry = 0) {
  const pq = Math.round(puff * 4) / 4;
  return cached(`puff|${S}|${frame}|${pq}|${angry ? 1 : 0}`, () => {
    const ph = (frame / PUFF_FRAMES) * TAU;
    const W = Math.ceil(S * 1.9), H = Math.ceil(S * 1.6), cx = W / 2 + S * 0.08 * (1 - pq), cy = H / 2;
    const rx = S * (0.55 + 0.2 * pq), ry = S * (0.38 + 0.37 * pq);
    const buf = new Buf(W, H);
    const YEL = [[150, 96, 8], [214, 150, 10], [246, 196, 22], [255, 220, 60], [255, 238, 140]];
    const WHT = [[170, 170, 160], [220, 220, 210], [248, 246, 236], [255, 255, 250]];
    // tail
    const tx = cx + rx - 1;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const u = (px + 0.5 - tx) / (S * 0.32), v = (py + 0.5 - cy) / (S * 0.3);
      if (u > 0 && u < 1 && Math.abs(v) < u * (0.9 + Math.sin(ph) * 0.15)) buf.set(px, py, YEL[(px + py) % 3 ? 2 : 1], 230);
    }
    // body
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) / rx, y = (py + 0.5 - cy) / ry, r = x * x + y * y;
      if (r > 1) continue;
      const l = 0.5 - y * 0.35 - x * 0.2 + (1 - r) * 0.4 + (bayer(px, py) - 0.5) * 0.2;
      const belly = y > 0.25 - x * 0.1;
      let col = belly ? WHT[clamp(Math.round(l * 3.2), 0, 3)] : YEL[clamp(Math.round(l * 4.2), 0, 4)];
      // spots
      // round leopard spots on a jittered grid
      const gs = Math.max(3, S * 0.2), gx = Math.floor(px / gs), gy = Math.floor(py / gs);
      const sx0 = (gx + 0.3 + hash2(gx, gy, 3) * 0.4) * gs, sy0 = (gy + 0.3 + hash2(gx, gy, 5) * 0.4) * gs;
      if (!belly && r < 0.92 && hash2(gx, gy, 9) < 0.75 && Math.hypot(px + 0.5 - sx0, py + 0.5 - sy0) < gs * 0.28 + 0.4) col = [84, 44, 10];
      buf.set(px, py, col);
    }
    // spikes when puffed
    if (pq > 0.2) for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU, bx = cx + Math.cos(a) * rx, by = cy + Math.sin(a) * ry;
      for (let i = 0; i < 2 + pq * 2; i++) buf.set(Math.round(bx + Math.cos(a) * i), Math.round(by + Math.sin(a) * i), Math.sin(a) > 0.3 ? [230, 230, 220] : [200, 150, 30]);
    }
    // fin
    const fx = cx + rx * 0.15, fy = cy + ry * 0.1;
    for (let i = 0; i < 4; i++) buf.set(Math.round(fx + i * 0.6), Math.round(fy - 1 + Math.sin(ph * 2 + i) * 1.2 + i * 0.3), [255, 236, 140], 220);
    // eye, brows and mouth
    const ex = Math.round(cx - rx * 0.52), ey = Math.round(cy - ry * 0.28), er = Math.max(1, Math.round(S * 0.09));
    for (let j = -er - 1; j <= er + 1; j++) for (let i = -er - 1; i <= er + 1; i++) { const d = Math.hypot(i, j); if (d <= er + 0.9) buf.set(ex + i, ey + j, d > er ? [255, 255, 240] : [16, 12, 20]); }
    buf.set(ex - Math.ceil(er / 2), ey - Math.ceil(er / 2), [255, 255, 255]);
    if (angry) for (let i = 0; i < 4; i++) buf.set(ex - 2 + i, ey - 3 + Math.floor(i / 2), [40, 20, 10]);
    const mx = Math.round(cx - rx + 1), my = Math.round(cy + ry * 0.15);
    buf.set(mx, my, angry ? [200, 60, 60] : [220, 110, 80]); buf.set(mx + 1, my + (angry ? 0 : 1), [220, 110, 80]);
    edgePass(buf, [255, 250, 210]);
    const c = buf.toCanvas();
    c.ox = Math.round(cx); c.oy = Math.round(cy);
    return c;
  });
}

// ------------------------------------------------------------------ crab --
// Front view, feet on the ground. frame = leg cycle, claw 0 (down) .. 2 (up
// and waving). Origin (ox, oy) is centre of the feet line.
export const CRAB_FRAMES = 8;
const CRAB_PALS = {
  red: ['#2a0804', '#6a160a', '#b02e16', '#e05228', '#ff7c42', '#ffb282', '#ffe2c8'],
  orange: ['#2e1204', '#6e300a', '#b85a14', '#ec8a24', '#ffb04a', '#ffd48a', '#fff0cc'],
  purple: ['#1a0a2e', '#3e1a6a', '#6a34aa', '#9a5ad8', '#c48cf4', '#e2c4ff', '#f6ecff'],
  blue: ['#061634', '#0e3470', '#1e5cb4', '#3a8ae6', '#6ab4ff', '#a8d8ff', '#e0f2ff'],
  yellow: ['#2a2204', '#6a560a', '#b09414', '#e4c828', '#fce458', '#fff29a', '#fffadc'],
  pink: ['#2e0a1c', '#6e1a44', '#b43676', '#e65aa2', '#ff8cc6', '#ffc0e0', '#fff0f8'],
  teal: ['#042a28', '#0a5e58', '#14968a', '#26c8b4', '#5aeed8', '#a8fff0', '#e4fffa'],
};
const CRAB_RAMPS = {};
for (const k in CRAB_PALS) CRAB_RAMPS[k] = ramp(CRAB_PALS[k], 7);
export function renderCrab(S, frame, claw = 0, hue = 'red') {
  const CRAB = CRAB_RAMPS[hue] || CRAB_RAMPS.red;
  return cached(`crab|${S}|${frame}|${claw}|${hue}`, () => {
    const W = Math.ceil(S * 1.7) + 4, H = Math.ceil(S * 1.25) + 4;
    const ox = W >> 1, oy = H - 2;
    const lvl = new Float32Array(W * H).fill(-99);
    const put = (x, y, l) => {
      x = Math.floor(x + ox); y = Math.floor(y + oy);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      if (l > lvl[i] || lvl[i] === -99) lvl[i] = l;
    };
    const disc = (cx, cy, rx, ry, lf) => {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) put(x, y, lf(u, v));
      }
    };
    const seg = (ax, ay, bx, by, r, l) => {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
      for (let k = 0; k <= n; k++) { const t = k / n; disc(ax + (bx - ax) * t, ay + (by - ay) * t, r, r, () => l); }
    };
    const rx = S * 0.36, ry = S * 0.22;
    const bodyY = -S * 0.34;
    const ph = (frame / CRAB_FRAMES) * TAU;
    // legs: three a side, alternating lift
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const lift = Math.max(0, Math.sin(ph + k * 2.1 + (s > 0 ? Math.PI : 0))) * S * 0.08;
      const ax = s * rx * (0.55 + k * 0.16), ay = bodyY + ry * (0.1 + k * 0.18);
      const kx = s * (rx + S * (0.12 + k * 0.05)), ky = bodyY - S * 0.04 + k * S * 0.05 - lift;
      const fx = s * (rx + S * (0.2 + k * 0.08)), fy = -lift * 0.6;
      seg(ax, ay, kx, ky, Math.max(0.6, S * 0.035), 2.4);
      seg(kx, ky, fx, fy, Math.max(0.5, S * 0.03), 2.0);
    }
    // claws on arms
    const up = claw / 2;
    for (const s of [-1, 1]) {
      const wig = claw === 2 ? Math.sin(ph * 2 + (s > 0 ? 1 : 0)) * S * 0.05 : 0;
      const sx = s * rx * 0.7, sy = bodyY - ry * 0.3;
      const ex = s * (rx + S * 0.1), ey = bodyY - ry * (0.4 + up * 1.4) + wig * 0.5;
      const cx = s * (rx + S * (0.14 - up * 0.04)), cy = bodyY - ry * (0.9 + up * 2.6) + wig;
      seg(sx, sy, ex, ey, Math.max(0.7, S * 0.045), 3);
      seg(ex, ey, cx, cy, Math.max(0.7, S * 0.045), 3.2);
      disc(cx, cy, S * 0.15, S * 0.12, (u, v) => 4.6 - v * 1.2 - (u * s > 0.4 ? 0.8 : 0));
      // pincer notch
      const nx = cx + s * S * 0.05, ny = cy - S * 0.03;
      for (let d = 0; d < Math.max(1, S * 0.06); d++) {
        const x = Math.floor(nx + s * d + ox), y = Math.floor(ny + oy);
        if (x >= 0 && y >= 0 && x < W && y < H) lvl[y * W + x] = -99;
      }
    }
    // carapace with a little mottling
    disc(0, bodyY, rx, ry, (u, v) => 4.4 - v * 1.6 - Math.abs(u) * 0.6 + (hash2(Math.round(u * 9), Math.round(v * 7), 3) < 0.14 ? -1 : 0));
    // eye stalks
    for (const s of [-1, 1]) {
      const ex = s * S * 0.12, ey = bodyY - ry - S * 0.1;
      seg(ex, bodyY - ry * 0.7, ex, ey, Math.max(0.5, S * 0.03), 3.4);
    }
    const b = new Buf(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = lvl[y * W + x];
      if (l === -99) continue;
      const up1 = y > 0 ? lvl[(y - 1) * W + x] : -99, dn = y < H - 1 ? lvl[(y + 1) * W + x] : -99;
      let e = l;
      if (up1 === -99) e += 1.1;
      if (dn === -99) e -= 1.2;
      b.set(x, y, CRAB[clamp(Math.round(e + (bayer(x, y) - 0.5) * 0.6), 0, CRAB.length - 1)]);
    }
    // eyes: black beads with a glint
    for (const s of [-1, 1]) {
      const ex = Math.floor(s * S * 0.12 + ox), ey = Math.floor(bodyY - ry - S * 0.1 + oy);
      b.set(ex, ey, [8, 6, 10]);
      if (S >= 14) { b.set(ex + (s > 0 ? 0 : -1), ey - 1, [8, 6, 10]); b.set(ex, ey - 1, [255, 255, 255]); }
      else b.set(ex, ey - 1, [230, 240, 255]);
    }
    const cv = b.toCanvas();
    cv.ox = ox; cv.oy = oy;
    return cv;
  });
}
