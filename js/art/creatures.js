// Non-fish-shaped creatures: eagle ray (3D surface splatted to pixels),
// sea turtle (implicit shapes + voronoi scutes) and glowing jellyfish.
import { TAU, clamp, ramp, bayer, hash2, Buf, pointInPoly, mixRGB, smoothstep, fract } from '../util.js';

const cache = new Map();
const cached = (key, fn) => {
  let c = cache.get(key);
  if (!c) { c = fn(); cache.set(key, c); }
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
export function renderJelly(size, frame, hue = 'pink') {
  return cached('jelly|' + size + '|' + frame + '|' + hue, () => {
    const ph = (frame / JELLY_FRAMES) * TAU;
    const pulse = Math.pow(Math.max(0, Math.sin(ph)), 1.5);
    const bw = size * (1 - 0.18 * pulse), bh = size * 0.62 * (1 + 0.16 * pulse);
    const W = Math.ceil(size * 1.4), H = Math.ceil(size * 2.6);
    const cx = W / 2, top = Math.round(size * 0.15);
    const buf = new Buf(W, H);
    const pal = hue === 'pink'
      ? { rim: [255, 214, 238], body: [240, 150, 205], deep: [190, 90, 170], gon: [255, 120, 196], arm: [236, 150, 210] }
      : { rim: [210, 245, 255], body: [130, 200, 245], deep: [70, 130, 210], gon: [180, 240, 255], arm: [150, 210, 250] };
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
          // four-leaf gonads
          const gx = x * 1.25, gy = (y + 0.42) * 2.1;
          const gr = Math.hypot(gx, gy);
          if (gr < 0.62 && gr > 0.34 && gy > -0.5) { col = pal.gon; a = 150 + 60 * Math.abs(Math.sin(Math.atan2(gy, gx) * 2)); }
          if (y > -0.05) { col = pal.deep; a = 170; }
          buf.set(px, py, col, a);
        }
      }
    }
    // Oral arms (frilly) and fine tentacles
    const baseY = top + bh * 1.02;
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * bw * 0.12;
      const len = size * 1.3;
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
      const len = size * (1.6 + hash2(k, 1, 2) * 0.6);
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
