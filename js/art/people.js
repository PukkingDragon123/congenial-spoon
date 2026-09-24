// The couple: procedurally rigged pixel figures, back-lit by the tank.
// Both characters rasterize into one shared buffer so joined hands and hugs
// merge into one shape, then a lighting pass colours it: dim, cool ambient
// from the dark hall, and the tank's light wrapping around the outline.
import { clamp, lerp, segDist, pointInPoly, hex, Buf, makeCanvas } from '../util.js';

const MAT = { skin: 1, hair: 2, top: 3, bottom: 4, shoe: 5, dress: 6, shoeW: 7, eye: 8, blush: 9, bow: 10, belt: 11, shine: 12, collar: 13 };
// [shadow, mid, light] albedo for each material
const TONES = {
  1: ['#6a4450', '#b07a74', '#f0c4aa'],
  2: ['#120c16', '#2a1e2c', '#5a4668'],
  3: ['#1c2c50', '#3a62a0', '#7aa8e0'],
  4: ['#0e1226', '#232c4a', '#46547a'],
  5: ['#0a0a12', '#1c1c2a', '#44445c'],
  6: ['#5a5a90', '#aeacdc', '#eeecff'],
  7: ['#6a7090', '#c4cae4', '#f2f5ff'],
  8: ['#0a0810', '#0a0810', '#0a0810'],
  9: ['#c05a78', '#f07a98', '#ff9ab4'],
  10: ['#a02a5a', '#ff6a9a', '#ffc4d8'],
  11: ['#0a0a14', '#161826', '#34364c'],
  12: ['#4e3a58', '#7a64a0', '#b8a4e0'],
  13: ['#6a80b0', '#c8d8f4', '#f2f7ff'],
};
const TONE = {};
for (const k in TONES) TONE[k] = TONES[k].map(hex);
const HALL = hex('#050918');

class Raster {
  constructor(w, h, ox, oy) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.m = new Uint8Array(w * h);
    this.s = new Int8Array(w * h);
  }
  clear() { this.m.fill(0); this.s.fill(0); }
  put(px, py, mat, sh) {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = py * this.w + px;
    this.m[i] = mat; this.s[i] = sh;
  }
  capsule(ax, ay, bx, by, ra, rb, mat, sh = 0) {
    const r = Math.max(ra, rb) + 1;
    const x0 = Math.floor(Math.min(ax, bx) - r + this.ox), x1 = Math.ceil(Math.max(ax, bx) + r + this.ox);
    const y0 = Math.floor(Math.min(ay, by) - r + this.oy), y1 = Math.ceil(Math.max(ay, by) + r + this.oy);
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const [d, t] = segDist(px + 0.5 - this.ox, py + 0.5 - this.oy, ax, ay, bx, by);
      if (d <= ra + (rb - ra) * t) this.put(px, py, mat, sh);
    }
  }
  ellipse(cx, cy, rx, ry, mat, sh = 0, rot = 0) {
    const r = Math.max(rx, ry) + 1;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let py = Math.floor(cy - r + this.oy); py <= Math.ceil(cy + r + this.oy); py++)
      for (let px = Math.floor(cx - r + this.ox); px <= Math.ceil(cx + r + this.ox); px++) {
        const dx = px + 0.5 - this.ox - cx, dy = py + 0.5 - this.oy - cy;
        const u = dx * c + dy * s, v = -dx * s + dy * c;
        if ((u / rx) ** 2 + (v / ry) ** 2 <= 1) this.put(px, py, mat, sh);
      }
  }
  poly(pts, mat, sh = 0, shadeFn = null) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let py = Math.floor(y0 + this.oy); py <= Math.ceil(y1 + this.oy); py++)
      for (let px = Math.floor(x0 + this.ox); px <= Math.ceil(x1 + this.ox); px++) {
        const x = px + 0.5 - this.ox, y = py + 0.5 - this.oy;
        if (pointInPoly(x, y, pts)) this.put(px, py, mat, shadeFn ? shadeFn(x, y) : sh);
      }
  }
}

function ik(sx, sy, tx, ty, a, b, bend) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const dd = clamp(d, Math.abs(a - b) + 0.01, a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1);
  const ang = base + bend * Math.acos(cosA);
  const ex = sx + Math.cos(ang) * a, ey = sy + Math.sin(ang) * a;
  const wa = Math.atan2(ty - ey, tx - ex);
  return [ex, ey, ex + Math.cos(wa) * b, ey + Math.sin(wa) * b];
}

export const GUY = { h: 74, headRx: 6.0, headRy: 6.6, neck: 2.4, sh: 10.5, hip: 7, torso: 23, leg: 32, ua: 13, fa: 12, girl: false };
export const GIRL = { h: 68, headRx: 5.2, headRy: 5.9, neck: 2.8, sh: 8.2, hip: 6.5, torso: 20, leg: 29, ua: 11.5, fa: 11, girl: true };

// ----------------------------------------------------------------- gait --
// One cycle is a full stride (two steps). Phase u in [0,1): the heel strikes
// at 0, the foot stays planted until 0.6 (sliding back under the body at
// exactly walking speed, so it never skates), then swings through.
const STANCE = 0.6;
const STRIDE = 1.5; // stride length per unit of leg length
const GROUND = -2;  // ankle height when the foot is flat
function footPath(u, D, lift) {
  if (u < STANCE) {
    const k = u / STANCE;
    const heel = k > 0.68 ? (k - 0.68) / 0.32 : 0; // heel peels up, rolling onto the toes
    const land = k < 0.12 ? 1 - k / 0.12 : 0;       // toes still coming down after the strike
    return [D * (0.3 - 0.6 * k), heel * heel * lift * 0.55, heel * 0.6 - land * 0.22];
  }
  const k = (u - STANCE) / (1 - STANCE);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
  return [D * (-0.3 + 0.6 * e), (Math.sin(Math.PI * Math.pow(k, 0.75)) + (1 - k) * (1 - k) * 0.55) * lift, lerp(0.6, -0.22, clamp(k * 1.4))];
}
// Hip height that keeps every planted foot reachable, with the bob softened.
function hipHeight(C, feet, moving) {
  const L = C.leg * 0.99;
  let h = L;
  for (const f of feet) if (f.planted) h = Math.min(h, f.y + Math.sqrt(Math.max(0, L * L - f.x * f.x)));
  const low = Math.sqrt(L * L - (0.3 * STRIDE * C.leg * moving) ** 2);
  return Math.min(h, low + (h - low) * 0.5);
}

// ---------------------------------------------------------------- views --
// Back view (facing the tank), or with p.front facing us. x is screen-right.
// p: { breath, tilt, lhand, rhand, sway, tip, headX, headY, weight, front, happy, mouth }
function drawBack(R, C, ox, p) {
  const breath = p.breath || 0;
  const tip = p.tip || 0;
  const hipY = -C.leg - tip;
  const shY = hipY - C.torso - breath * 0.6;
  const sway = p.sway || 0;
  const wt = p.weight || 0; // weight shifting from foot to foot
  const headX = sway + (p.tilt || 0) * 2.2 + (p.headX || 0);
  const headY = shY - C.neck - C.headRy + 1 + (p.headY || 0);
  const fx = C.girl ? 3.8 : 4.6;
  // Legs & shoes
  if (C.girl) {
    const kneeY = hipY + C.leg * 0.52;
    for (const s of [-1, 1]) {
      R.capsule(ox + s * fx * 0.8 + wt * 0.5, kneeY, ox + s * fx, -3 - (s === 1 ? tip : 0), 2.3, 1.7, MAT.skin);
      R.ellipse(ox + s * (fx + 0.3), -1.5 - (s === 1 ? tip * 0.6 : 0), 2.4, 1.6, MAT.shoeW);
    }
  } else {
    for (const s of [-1, 1]) {
      const kx = ox + s * (fx - 0.2) + wt * 0.4, ky = hipY + C.leg * 0.5;
      R.capsule(ox + s * 3.8 + sway * 0.3 + wt * 0.6, hipY + 2, kx, ky, 3.9, 3.1, MAT.bottom);
      R.capsule(kx, ky, ox + s * fx, -3, 3.1, 2.4, MAT.bottom);
      R.ellipse(ox + s * (fx + 0.6), -1.6, 3.8, 2, MAT.shoe);
    }
  }
  const bx = sway + wt * 0.6; // the body rides over the weighted foot
  // Torso / dress
  if (C.girl) {
    const waistY = shY + C.torso * 0.62;
    const hemY = -C.leg * 0.3 - tip;
    const fl = p.flutter || 0;
    const dress = [
      [ox - 7.2 + bx, shY + 2.5], [ox + 7.2 + bx, shY + 2.5],
      [ox + 5.6 + bx, waistY], [ox + 11.5 + fl, hemY - 1], [ox + 10 + fl * 0.5, hemY + 1], [ox + 3, hemY + 0.5 + fl * 0.3],
      [ox - 3, hemY + 1], [ox - 10 + fl * 0.5, hemY + 0.5], [ox - 11.5 + fl, hemY - 1.5], [ox - 5.6 + bx, waistY],
    ];
    R.poly(dress, MAT.dress, 0, (x, y) => ((Math.round(x - ox + (y - waistY) * 0.12) % 7 === 0 && y > waistY + 6) ? -1 : 0));
    R.capsule(ox - 6.5 + bx, shY + 1.2, ox + 6.5 + bx, shY + 1.2, 1.8, 1.8, MAT.skin);
    // a ribbon at the waist, tied in a little bow at the back
    R.capsule(ox - 5.4 + bx, waistY, ox + 5.4 + bx, waistY, 0.9, 0.9, MAT.bow);
    R.ellipse(ox + bx - 1.8, waistY - 0.4, 1.5, 1.1, MAT.bow);
    R.ellipse(ox + bx + 1.8, waistY - 0.4, 1.5, 1.1, MAT.bow);
    R.capsule(ox + bx - 0.6, waistY + 0.6, ox + bx - 1.4, waistY + 4.5, 0.5, 0.5, MAT.bow);
    R.capsule(ox + bx + 0.6, waistY + 0.6, ox + bx + 1.6, waistY + 4.2, 0.5, 0.5, MAT.bow);
  } else {
    const hemY = hipY + 3;
    const b = bx * 0.5;
    R.poly([
      [ox - 4 + b, shY - 1], [ox + 4 + b, shY - 1], [ox + C.sh - 2.5 + b, shY + 1.2], [ox + C.sh - 1.6 + b, shY + 4.5], [ox + 8.6 + b, shY + 9], [ox + 7.8, hemY - 6], [ox + 8.2, hemY], [ox - 8.2, hemY], [ox - 7.8, hemY - 6], [ox - 8.6 + b, shY + 9], [ox - C.sh + 1.6 + b, shY + 4.5], [ox - C.sh + 2.5 + b, shY + 1.2],
    ], MAT.top, 0, (x, y) => (Math.abs(x - ox - b) < 0.8 && y < hemY - 2 ? -1 : 0));
    R.capsule(ox - 3.4 + b, shY + 0.2, ox + 3.4 + b, shY + 0.2, 1.1, 1.1, MAT.collar);
    R.capsule(ox - 7.9, hipY + 1.6, ox + 7.9, hipY + 1.6, 0.8, 0.8, MAT.belt);
  }
  // Arms (IK towards hand targets, relative to ox)
  for (const s of [-1, 1]) {
    const sx = ox + s * (C.sh - (C.girl ? 1.5 : 3.2)) + bx * 0.5, sy = shY + (C.girl ? 2.5 : 3.5);
    const tgt = s < 0 ? p.lhand : p.rhand;
    const tx = tgt ? tgt[0] : sx + s * 2.2 + wt * 0.3, ty = tgt ? tgt[1] : sy + C.ua + C.fa - 1.5;
    const [ex, ey, wx, wy] = ik(sx, sy, tx, ty, C.ua, C.fa, p.bend ? p.bend[s < 0 ? 0 : 1] : s > 0 ? 1 : -1);
    const r0 = C.girl ? 2.0 : 2.7, r1 = C.girl ? 1.6 : 2.2, r2 = C.girl ? 1.4 : 1.8;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin);
    R.ellipse(wx + Math.sign(wx - ex) * 0.6, wy + 1.2, r2 + 0.5, r2 + 0.9, MAT.skin);
    if (C.girl) R.ellipse(sx + s * 0.5, sy + 1.5, 3, 3.2, MAT.dress);
    else R.capsule(sx, sy, lerp(sx, ex, 0.42), lerp(sy, ey, 0.42), 3.1, 2.8, MAT.top);
  }
  // Neck & head
  const hx = headX + bx * 0.5;
  R.capsule(ox + bx * 0.5, shY + 1, ox + hx, headY + 3, 2.4, 2.2, MAT.skin);
  R.ellipse(ox + hx, headY, C.headRx, C.headRy, MAT.hair, 0, (p.tilt || 0) * 0.25);
  R.ellipse(ox + hx - C.headRx + 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  R.ellipse(ox + hx + C.headRx - 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  R.ellipse(ox + hx, headY - 0.4, C.headRx + 0.6, C.headRy - 0.2, MAT.hair, 0, (p.tilt || 0) * 0.25);
  R.capsule(ox + hx - 3.2, headY - 3.2, ox + hx + 0.4, headY - 4.3, 0.55, 0.55, MAT.shine);
  if (p.front) {
    // facing us: the face under a fringe, eyes, blush and a mouth
    const tl = (p.tilt || 0) * 0.8;
    const fx0 = ox + hx + tl * 0.4;
    R.ellipse(fx0, headY + 1.2, C.headRx - 0.7, C.headRy - 1.7, MAT.skin, 0, (p.tilt || 0) * 0.25);
    R.ellipse(fx0 - 1.6, headY - C.headRy + 2.7, 3.4, 1.7, MAT.hair);
    R.ellipse(fx0 + 2.1, headY - C.headRy + 2.3, 2.8, 1.5, MAT.hair);
    const ey = Math.floor(headY + 0.8 + R.oy);
    for (const sx of [-1, 1]) {
      const ex = Math.floor(fx0 + sx * 2.3 + R.ox);
      if (p.happy) { R.put(ex - 1, ey + 1, MAT.eye, 0); R.put(ex, ey, MAT.eye, 0); R.put(ex + 1, ey + 1, MAT.eye, 0); }
      else { R.put(ex, ey, MAT.eye, 0); R.put(ex, ey + 1, MAT.eye, 0); }
      R.put(Math.floor(fx0 + sx * 3.6 + R.ox), ey + 3, MAT.blush, 0);
    }
    const mx = Math.floor(fx0 + R.ox), my = Math.floor(headY + 4 + R.oy);
    if (p.mouth) { R.put(mx - 1, my, MAT.eye, 0); R.put(mx, my, MAT.eye, 0); R.put(mx - 1, my + 1, MAT.blush, 0); R.put(mx, my + 1, MAT.blush, 0); }
    else { R.put(mx - 1, my, MAT.eye, 0); R.put(mx, my, MAT.eye, 0); }
  } else if (C.girl) {
    const hs = p.hairSway || 0;
    const top = headY - 2;
    R.poly([
      [ox + hx - 5, top], [ox + hx + 5, top], [ox + hx + 6 + hs * 0.2, shY + 1], [ox + hx + 5.2 + hs * 0.6, shY + 9], [ox + hx + 4.2 + hs, shY + 14],
      [ox + hx + 1.5 + hs, shY + 16], [ox + hx - 1 + hs, shY + 15], [ox + hx - 3.8 + hs, shY + 16.5], [ox + hx - 5.4 + hs * 0.6, shY + 10], [ox + hx - 6 + hs * 0.2, shY + 1],
    ], MAT.hair, 0, (x, y) => ((Math.round(x - ox - hx + y * 0.08) % 4 === 0 && y > shY - 2) ? 1 : 0));
    // a pink bow in her hair
    R.ellipse(ox + hx - 2.3, headY - 0.6, 1.8, 1.3, MAT.bow);
    R.ellipse(ox + hx + 2.3, headY - 0.6, 1.8, 1.3, MAT.bow);
    R.ellipse(ox + hx, headY - 0.5, 0.9, 0.9, MAT.bow, 1);
  }
}

// Side view facing +1 (right) or -1 (left).
// p: { dist, moving, lean, hands: [[x,y],[x,y]] | null, tip, headTilt, headX, headY, happy, hairSway, flutter }
function drawSide(R, C, ox, f, p) {
  const tip = p.tip || 0;
  const moving = p.moving ?? 0;
  const D = STRIDE * C.leg;
  const u0 = (((p.dist || 0) / D) % 1 + 1) % 1;
  const lift = (C.girl ? 3.2 : 3.8) * moving;
  // near foot at u0, far foot half a stride later; at rest they stand a little apart
  const feet = [u0, (u0 + 0.5) % 1].map((u, i) => {
    const [x, y, rot] = footPath(u, D, lift);
    return { u, x: x * moving + (1 - moving) * (i ? -1.3 : 1.5), y, rot: rot * moving, planted: u < STANCE };
  });
  const hipH = hipHeight(C, feet, moving);
  const hipY = -hipH + GROUND - tip;
  const L1 = C.leg * 0.52, L2 = C.leg * 0.5;
  const legs = feet.map((ft) => {
    const ax = ft.x, ay = hipH - ft.y; // ankle, relative to the hip
    const [kx, ky] = ik(0, 0, ax, ay, L1, L2, -1);
    return { kx, ky, ax, ay, rot: ft.rot };
  });
  // the body pitches forward a touch with speed and dips as each foot lands
  const lean = (p.lean || 0) + 0.06 * moving;
  const shX = lean * C.torso, shY = hipY - C.torso;
  const nod = Math.sin(u0 * Math.PI * 4 - 0.6) * 0.35 * moving; // the head settles a beat after the body
  const headX = shX + (p.headX || 0) + 1, headY = shY - C.neck - C.headRy + 1 + (p.headY || 0) + nod;
  const X = (x) => ox + x * f;
  const drawLeg = (L, sh) => {
    const hx = X(0), hy = hipY;
    const kx = X(L.kx), ky = hipY + L.ky, ax = X(L.ax), ay = hipY + L.ay;
    // the shoe pivots with the heel lifting and the toes coming down
    const r = L.rot, fwd = C.girl ? 1.6 : 2;
    const sx = ax + f * Math.cos(r) * fwd, sy = ay + 1.1 + Math.sin(r) * fwd;
    if (C.girl) {
      R.capsule(kx, ky, ax, ay, 2.2, 1.7, MAT.skin, sh);
      R.ellipse(sx, sy, 3.1, 1.8, MAT.shoeW, sh, r * f);
    } else {
      R.capsule(hx, hy, kx, ky, 3.8, 3.1, MAT.bottom, sh);
      R.capsule(kx, ky, ax, ay, 3.1, 2.4, MAT.bottom, sh);
      R.ellipse(sx, sy, 3.8, 2, MAT.shoe, sh, r * f);
    }
  };
  const armFor = (i, sh) => {
    const sx = X(shX - 0.5), sy = shY + 2.5;
    const hand = p.hands ? p.hands[i] : null;
    let ex, ey, wx, wy;
    if (hand) {
      [ex, ey, wx, wy] = ik(sx, sy, hand[0], hand[1], C.ua, C.fa, f > 0 ? 1 : -1);
    } else {
      // arms swing against the leg on the same side, trailing it slightly;
      // the elbow bends more as the arm comes forward
      const a = (C.girl ? 0.34 : 0.4) * moving;
      const th = -a * Math.cos((feet[i].u - 0.06) * Math.PI * 2) + 0.04;
      const bend = 0.12 + Math.max(0, th) * 1.1 + 0.08 * moving;
      ex = sx + Math.sin(th) * C.ua * f; ey = sy + Math.cos(th) * C.ua;
      wx = ex + Math.sin(th + bend) * (C.fa - 1) * f; wy = ey + Math.cos(th + bend) * (C.fa - 1);
    }
    const r0 = C.girl ? 1.9 : 2.5, r1 = C.girl ? 1.5 : 2.0, r2 = C.girl ? 1.3 : 1.7;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin, sh);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin, sh);
    R.ellipse(wx, wy + 0.8, r2 + 0.5, r2 + 0.8, MAT.skin, sh);
    if (C.girl) R.ellipse(sx, sy + 1, 2.6, 3, MAT.dress, sh);
    else R.capsule(sx, sy, lerp(sx, ex, 0.45), lerp(sy, ey, 0.45), 3.0, 2.8, MAT.top, sh);
  };
  // far limbs
  armFor(1, -1);
  drawLeg(legs[1], -1);
  // torso
  if (C.girl) {
    const waistY = shY + C.torso * 0.62, hemY = -C.leg * 0.3 - tip;
    const k0 = Math.min(legs[0].kx, legs[1].kx), k1 = Math.max(legs[0].kx, legs[1].kx);
    // the hem swings with the stride and trails behind her
    const fl = (p.flutter || 0) + Math.sin(u0 * Math.PI * 4) * 1.1 * moving - 1.2 * moving;
    R.poly([
      [X(shX - 4), shY + 2.5], [X(shX + 4.6), shY + 3], [X(shX * 0.5 + 4.2), waistY], [X(Math.max(k1 + 4, 7) + fl * 0.4), hemY + Math.abs(fl) * 0.2],
      [X(0), hemY + 1.2], [X(Math.min(k0 - 4, -7) - 1.5 + fl), hemY - 0.5 - Math.abs(fl) * 0.3], [X(shX * 0.5 - 3.8), waistY],
    ], MAT.dress, 0, (x, y) => (Math.round((x - ox) * 0.9 + (y - waistY) * 0.2) % 6 === 0 && y > waistY + 6 ? -1 : 0));
    R.capsule(X(shX * 0.5 - 3.6), waistY, X(shX * 0.5 + 4), waistY, 0.9, 0.9, MAT.bow);
  } else {
    R.poly([
      [X(shX - 5), shY], [X(shX + 5.5), shY + 1], [X(shX * 0.5 + 5.2), hipY - 4], [X(5), hipY + 3], [X(-4.8), hipY + 3], [X(shX * 0.5 - 4.8), hipY - 6],
    ], MAT.top);
    R.capsule(X(-4.6), hipY + 1.2, X(5), hipY + 1.2, 0.8, 0.8, MAT.belt);
    R.ellipse(X(shX + 2.2), shY + 0.8, 1.8, 1.1, MAT.collar);
  }
  drawLeg(legs[0], 0);
  // neck & head
  R.capsule(X(shX), shY + 1, X(headX - 0.6), headY + 3, 2.3, 2.1, MAT.skin);
  R.ellipse(X(headX), headY, C.headRx, C.headRy, MAT.skin, 0, (p.headTilt || 0) * f);
  // profile: nose & chin
  R.put(Math.floor(X(headX + C.headRx) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 0.5 + R.oy), MAT.skin, 0);
  R.put(Math.floor(X(headX + C.headRx - 0.5) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 3 + R.oy), MAT.skin, 0);
  // hair
  R.ellipse(X(headX - 1), headY - 1.5, C.headRx + 0.3, C.headRy - 1.5, MAT.hair, 0, (p.headTilt || 0) * f);
  if (C.girl) {
    const hs = (p.hairSway || 0) - 1.5 * moving + Math.sin(u0 * Math.PI * 4 - 1.2) * 0.6 * moving;
    R.poly([
      [X(headX - 1), headY - C.headRy + 0.5], [X(headX + 3.5), headY - 3], [X(headX - 1.5), headY + 3], [X(shX - 1.5), shY + 6],
      [X(shX - 4 + hs), shY + 14], [X(shX - 7 + hs), shY + 13], [X(shX - 7.5 + hs * 0.6), shY + 2], [X(headX - 5.8), headY - 1],
    ], MAT.hair);
  } else {
    R.ellipse(X(headX - 2.2), headY - 0.2, 3.2, 4.4, MAT.hair);
  }
  // the face below the hairline: skin, a fringe, an eye and a blush
  R.ellipse(X(headX + 1.3), headY + 1.3, C.headRx - 1.3, C.headRy - 2.2, MAT.skin, 0, (p.headTilt || 0) * f);
  R.put(Math.floor(X(headX + C.headRx) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 0.5 + R.oy), MAT.skin, 0);
  R.ellipse(X(headX + (C.girl ? 1.4 : 1.8)), headY - C.headRy + 2.4, C.girl ? 3.2 : 2.8, 1.3, MAT.hair);
  R.capsule(X(headX - 2.5), headY - C.headRy + 1.6, X(headX + 0.5), headY - C.headRy + 1.1, 0.5, 0.5, MAT.shine);
  const ex = Math.floor(X(headX + C.headRx * 0.42) + R.ox), ey = Math.floor(headY - 0.4 + R.oy);
  if (p.happy) { R.put(ex, ey + 1, MAT.eye, 0); R.put(ex + (f > 0 ? -1 : 1), ey, MAT.eye, 0); }
  else { R.put(ex, ey, MAT.eye, 0); R.put(ex, ey + 1, MAT.eye, 0); if (C.girl) R.put(ex + f, ey - 1, MAT.eye, 0); }
  const bx = Math.floor(X(headX + C.headRx * 0.2) + R.ox), by = Math.floor(headY + 2 + R.oy);
  R.put(bx, by, MAT.blush, 0); R.put(bx + (f > 0 ? 1 : -1), by, MAT.blush, 0);
  if (C.girl) {
    R.ellipse(X(headX - 3.6), headY - 3.2, 1.6, 1.3, MAT.bow);
    R.ellipse(X(headX - 5.2), headY - 2.2, 1.4, 1.2, MAT.bow);
  }
  armFor(0, 0);
}

// ---------------------------------------------------------------- couple --
export class Couple {
  constructor() {
    // wide enough for her to stand well apart from him before they meet
    this.W = 440; this.H = 124;
    this.R = new Raster(this.W, this.H, 220, 116);
    this.buf = new Buf(this.W, this.H);
    this.canvas = makeCanvas(this.W, this.H);
    this.img = new ImageData(this.buf.d, this.W, this.H);
    // state
    this.mode = 'walk'; // walk | back | face | hug
    this.t = 0;
    this.walk = 0; // distance walked, in radians of the old cycle (x7.5 = px)
    this.moving = 0;
    this.hold = 0; // back view hand-holding 0..1
    this.lean = 0; // girl leaning head on his shoulder
    this.hands = 0; // face view: holding both hands
    this.hug = 0;
    this.point = 0; // back view: she points at something in the tank
    this.glance = 0; // back view: he sneaks a look at her
    this.flip = 1; // horizontal squash during turns
    this.gap = 17;
    // before they meet each moves on their own: his mode is `mode`
    // (walk | back | front | side), hers is `girlPose` (back | side)
    this.apart = false;
    this.girlOn = true;
    this.girlDX = 0;      // how much further right she stands than usual
    this.girlPose = 'back';
    this.girlWave = 0;
    this.girlHappy = false;
    this.pose = 'cheer'; // his front-view pose: cheer | dab | wave | surprised
    this.hop = 0;        // lift off the floor, applied by the stage
  }

  update(dt) {
    this.t += dt;
  }

  // light: the tank's colour [r,g,b]; wx: where they stand, so the rippling
  // light stays put in the world as they walk; pulse: the beat, 0..1
  render(light = [140, 200, 255], wx = 0, pulse = 0) {
    const R = this.R;
    R.clear();
    const t = this.t;
    const breath = (Math.sin(t * 1.6) + 1) * 0.5;
    const gh = this.gap / 2;
    if (this.apart) this.renderApart(t, breath, gh);
    else if (this.mode === 'walk') {
      const dist = this.walk * 7.5;
      drawSide(R, GUY, -gh, 1, { dist: dist + 9, moving: this.moving });
      drawSide(R, GIRL, gh, 1, { dist, moving: this.moving, hairSway: Math.sin(t * 2) * 0.6 });
    } else if (this.mode === 'back') {
      const h = this.hold, ln = this.lean, pt = this.point, gl = this.glance;
      const meetX = 0, meetY = -GIRL.leg - 1 + (1 - h) * 3;
      const gx = -gh, qx = gh;
      const guyR = h > 0 ? [lerp(gx + GUY.sh + 1, meetX - 1.5, h), lerp(-GUY.leg + 11, meetY, h)] : null;
      let girlL = h > 0 ? [lerp(qx - GIRL.sh - 1, meetX + 1.5, h), lerp(-GIRL.leg + 9, meetY + 1, h)] : null;
      // her free hand comes up to point at the glass
      const girlR = pt > 0 ? [lerp(qx + GIRL.sh + 1.5, qx + GIRL.sh + 5, pt), lerp(-GIRL.leg + 8, -GIRL.leg - GIRL.torso - 3 + Math.sin(t * 3) * 0.6, pt)] : null;
      const wg = Math.sin(t * 0.45) * 0.8 * (1 - h), wq = Math.sin(t * 0.38 + 2) * 0.8 * (1 - h);
      drawBack(R, GUY, gx, { breath, tilt: 0.35 * ln + 0.3 * gl, rhand: guyR, headX: ln * 1.2 + gl * 1.6, sway: ln * 0.6, weight: wg });
      drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, tilt: -1.4 * ln, lhand: girlL, rhand: girlR, headX: -ln * 3.2 + pt * 0.8, headY: ln * 1.6 - pt * 0.6, sway: -ln * 1.2, weight: wq,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5,
      });
    } else if (this.mode === 'face' || this.mode === 'hug') {
      // facing each other holding hands; k -> 1 leans in to a forehead kiss on tiptoe
      const k = this.hug;
      const g = 10;
      const handY = lerp(-GUY.leg + 1, -GUY.leg - 11, k);
      const hA = [[-1.2, handY - 1], [-0.6, handY + 1.2]];
      const hB = [[1.2, handY], [0.6, handY + 1.6]];
      drawSide(R, GUY, -g, 1, { hands: hA, lean: 0.13 * k, headX: 0.6 * k, headY: 1.2 * k, headTilt: 0.2 * k, happy: k > 0.3 });
      drawSide(R, GIRL, g, -1, {
        hands: hB, tip: 3 * k, lean: 0.11 * k, headTilt: -0.3 * k, headX: 0.8 * k, headY: -0.5 * k, happy: k > 0.3,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.6,
      });
    }
    this.shade(light, wx, pulse);
    return this.canvas;
  }

  renderApart(t, breath, gh) {
    const R = this.R, gx = -gh;
    const gs = -GUY.leg - GUY.torso; // his shoulder height
    if (this.mode === 'walk') drawSide(R, GUY, gx, 1, { dist: this.walk * 7.5 + 9, moving: this.moving });
    else if (this.mode === 'side') drawSide(R, GUY, gx, 1, { happy: this.happy });
    else if (this.mode === 'front') {
      const w = Math.sin(t * 14);
      const P = {
        cheer: { lhand: [gx - 14 + w, gs - 20], rhand: [gx + 14 - w, gs - 20], bend: [1, -1], happy: true, mouth: 1 },
        dab: { lhand: [gx - 21, gs - 13], rhand: [gx - 13, gs - 16], bend: [-1, 1], tilt: -1.4, headY: 1.8, happy: true },
        wave: { rhand: [gx + 11 + Math.sin(t * 9) * 2, gs - 10], mouth: 1 },
        surprised: { lhand: [gx - 12, gs + 9], rhand: [gx + 12, gs + 9], mouth: 1 },
      }[this.pose] || {};
      drawBack(R, GUY, gx, { breath, front: true, ...P });
    } else {
      const pt = this.point;
      const rh = pt > 0 ? [lerp(gx + GUY.sh + 1.5, gx + GUY.sh + 6, pt), lerp(-GUY.leg + 9, gs - 3 + Math.sin(t * 3) * 0.6, pt)] : null;
      drawBack(R, GUY, gx, { breath, rhand: rh, weight: Math.sin(t * 0.45) * 0.8 });
    }
    if (!this.girlOn) return;
    const qx = gh + this.girlDX;
    if (this.girlPose === 'side') {
      const wv = this.girlWave;
      const hands = wv > 0 ? [[qx - lerp(4, 10, wv) + Math.sin(t * 10) * 1.5 * wv, lerp(-GIRL.leg + 4, -GIRL.leg - GIRL.torso - 11, wv)], null] : null;
      drawSide(R, GIRL, qx, -1, { hands, happy: this.girlHappy, hairSway: Math.sin(t * 0.9) * 0.8 });
    } else {
      drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, weight: Math.sin(t * 0.38 + 2) * 0.8,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5,
      });
    }
  }

  // Lighting. They stand in a dark hall with the tank behind them, so the
  // side we see is in shade: each material keeps its colour but dim and cool,
  // darker towards the floor. The tank light wraps around the outline as a
  // rim tinted by both the light and the material, rippling as if through
  // water and swelling a little on the beat.
  shade(light, wx, pulse) {
    const { W, H } = this;
    const m = this.R.m, s = this.R.s, d = this.buf.d;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
    const t = this.t;
    const lr = light[0] / 255, lg = light[1] / 255, lb = light[2] / 255;
    const boost = 1 + pulse * 0.25;
    d.fill(0);
    for (let y = 0; y < H; y++) {
      const low = clamp((y / H - 0.5) * 1.8); // 0 at the chest, 1 at the feet
      const fall = 1 - low * 0.7;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const mt = m[i];
        if (!mt) continue;
        const [dk, md, lt] = TONE[mt];
        const o = i * 4;
        d[o + 3] = 255;
        if (mt === MAT.eye) { d[o] = dk[0]; d[o + 1] = dk[1]; d[o + 2] = dk[2]; continue; }
        const wxp = x + wx;
        const ripple = Math.sin(wxp * 0.31 + t * 2.1) * Math.sin(y * 0.23 - t * 1.6 + wxp * 0.07);
        // ambient: the dim, cool hall, with a faint dapple of tank light
        let k = (0.44 - low * 0.2) * (1 + ripple * 0.1);
        if (s[i] < 0) k *= 0.62;
        if (s[i] > 0) k *= 1.2;
        let r = (dk[0] + (md[0] - dk[0]) * k) * 0.56, g = (dk[1] + (md[1] - dk[1]) * k) * 0.6, b = (dk[2] + (md[2] - dk[2]) * k) * 0.76;
        r = r * 0.8 + HALL[0] * 0.2; g = g * 0.8 + HALL[1] * 0.2; b = b * 0.8 + HALL[2] * 0.2;
        // rim: strongest on top edges, softer on the sides, a pixel or two deep
        let rim = 0;
        if (!at(x, y - 1)) rim = 1;
        else if (!at(x - 1, y) || !at(x + 1, y)) rim = 0.72;
        else if (!at(x, y - 2)) rim = 0.36;
        else if (!at(x - 2, y) || !at(x + 2, y)) rim = 0.2;
        else if (mt !== MAT.blush && m[i - W] && m[i - W] !== mt && s[i - W] >= s[i]) rim = 0.12; // a seam where one part meets another
        if (mt === MAT.shine) rim = Math.max(rim, 0.55);
        if (rim > 0) {
          const a = clamp(rim * fall * (0.82 + ripple * 0.3) * boost * (s[i] < 0 ? 0.6 : 1));
          const cr = Math.min(255, lt[0] * lr * 1.15 + 255 * lr * 0.18);
          const cg = Math.min(255, lt[1] * lg * 1.15 + 255 * lg * 0.18);
          const cb = Math.min(255, lt[2] * lb * 1.15 + 255 * lb * 0.18);
          r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
        }
        if (!at(x, y + 1)) { r *= 0.7; g *= 0.7; b *= 0.75; }
        d[o] = r; d[o + 1] = g; d[o + 2] = b;
      }
    }
    this.canvas.ctx.putImageData(this.img, 0, 0);
  }
}
