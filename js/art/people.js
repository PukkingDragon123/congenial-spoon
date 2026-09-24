// The couple: procedurally rigged pixel figures, back-lit by the tank.
// Both characters rasterize into one shared buffer so joined hands and hugs
// merge into one shape, then a lighting pass colours it: dim, cool ambient
// from the dark hall, and the tank's light wrapping around the outline.
import { clamp, lerp, segDist, pointInPoly, hex, Buf, makeCanvas } from '../util.js';

const MAT = { skin: 1, hair: 2, top: 3, bottom: 4, shoe: 5, dress: 6, shoeW: 7, print: 8, sock: 9, bow: 10, skirt: 11, shine: 12, sole: 13, cord: 14 };
// [shadow, mid, light] albedo for each material. Two teenagers: him in an
// oversized black tee with a pink print, baggy jeans and chunky sneakers; her
// in a white tee, a pleated navy skirt, knee socks and sneakers.
const TONES = {
  1: ['#5a3a44', '#a0706a', '#e6b8a0'],
  2: ['#0e0a12', '#221a26', '#4a3a58'],
  3: ['#0c0c14', '#1e1e2c', '#4a4a66'],
  4: ['#142038', '#2e4670', '#6a88b8'],
  5: ['#7a8090', '#d8dce6', '#ffffff'],
  6: ['#7a7890', '#dcdaf0', '#ffffff'],
  7: ['#7a8090', '#d8dce6', '#ffffff'],
  8: ['#a02a5a', '#ff6a9a', '#ffd0e0'],
  9: ['#8a8aa0', '#e8e8f4', '#ffffff'],
  10: ['#a02a5a', '#ff6a9a', '#ffc4d8'],
  11: ['#141a30', '#2e3a64', '#5a6aa0'],
  12: ['#4e3a58', '#7a64a0', '#b8a4e0'],
  13: ['#303040', '#606070', '#9090a0'],
  14: ['#b8c0d0', '#f0f4ff', '#ffffff'],
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

export const GUY = { h: 74, headRx: 6.2, headRy: 6.8, neck: 2.4, sh: 9.6, hip: 7, torso: 23, leg: 32, ua: 13, fa: 12, girl: false };
export const GIRL = { h: 68, headRx: 5.5, headRy: 6.1, neck: 2.8, sh: 8.0, hip: 6.5, torso: 20, leg: 29, ua: 11.5, fa: 11, girl: true };

// ----------------------------------------------------------------- gait --
// One cycle is a full stride (two steps). Phase u in [0,1): the heel strikes
// at 0, the foot stays planted until 0.6 (sliding back under the body at
// exactly walking speed, so it never skates), then swings through.
const STANCE = 0.6;
const STRIDE = 1.6; // stride length per unit of leg length
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
// A chunky sneaker: a pale sole under a white upper, pivoting with the foot.
function sneaker(R, x, y, f, rot, big, sh) {
  const w = big ? 4.4 : 3.4, h = big ? 2.2 : 1.8;
  R.ellipse(x, y + 0.9, w + 0.1, h * 0.6, MAT.sole, sh, rot * f);
  R.ellipse(x - f * 0.3, y - 0.3, w - 0.4, h - 0.2, big ? MAT.shoe : MAT.shoeW, sh, rot * f);
}
// A little pink heart print (the graphic on his tee).
function heartPrint(R, cx, cy, sc = 1) {
  const pts = sc > 1
    ? ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
    : ['#.#', '###', '.#.'];
  const w = pts[0].length, h = pts.length;
  pts.forEach((row, j) => { for (let i = 0; i < w; i++) if (row[i] === '#') R.put(Math.floor(cx - w / 2 + i + R.ox), Math.floor(cy - h / 2 + j + R.oy), MAT.print, 0); });
}

// Back view (facing the tank), or with p.front facing us. x is screen-right.
// Returns where the earbuds sit and where his phone is, for the cord.
// p: { breath, tilt, lhand, rhand, sway, tip, headX, headY, weight, front, bend, nod }
function drawBack(R, C, ox, p) {
  const breath = p.breath || 0;
  const tip = p.tip || 0;
  const hipY = -C.leg - tip;
  const shY = hipY - C.torso - breath * 0.6;
  const sway = p.sway || 0;
  const wt = p.weight || 0; // weight shifting from foot to foot
  const headX = sway + (p.tilt || 0) * 2.2 + (p.headX || 0);
  const headY = shY - C.neck - C.headRy + 1 + (p.headY || 0) + (p.nod || 0);
  const fx = C.girl ? 3.6 : 4.4;
  const bx = sway + wt * 0.6; // the body rides over the weighted foot
  // Legs & shoes
  if (C.girl) {
    const kneeY = hipY + C.leg * 0.52;
    for (const s of [-1, 1]) {
      const ay = -3 - (s === 1 ? tip : 0);
      R.capsule(ox + s * 3 + bx * 0.5, hipY + 2, ox + s * fx * 0.8 + wt * 0.5, kneeY, 2.5, 2.1, MAT.skin);
      R.capsule(ox + s * fx * 0.8 + wt * 0.5, kneeY, ox + s * fx, ay, 2.1, 1.6, MAT.skin);
      R.capsule(ox + s * fx * 0.86, kneeY + 3, ox + s * fx, ay, 2.0, 1.8, MAT.sock);
      sneaker(R, ox + s * (fx + 0.3), -1.6 - (s === 1 ? tip * 0.6 : 0), 1, 0, false, 0);
    }
  } else {
    for (const s of [-1, 1]) {
      const kx = ox + s * (fx - 0.2) + wt * 0.4, ky = hipY + C.leg * 0.5;
      R.capsule(ox + s * 3.8 + sway * 0.3 + wt * 0.6, hipY + 2, kx, ky, 3.9, 3.5, MAT.bottom);
      R.capsule(kx, ky, ox + s * fx, -3.2, 3.5, 3.7, MAT.bottom, 0);
      sneaker(R, ox + s * (fx + 0.5), -1.8, 1, 0, true, 0);
    }
  }
  // Torso
  if (C.girl) {
    const waistY = shY + C.torso * 0.64;
    const hemY = hipY + C.leg * 0.3 - tip;
    const fl = p.flutter || 0;
    // pleated skirt
    R.poly([[ox - 5.4 + bx, waistY], [ox + 5.4 + bx, waistY], [ox + 9 + fl, hemY], [ox - 9 + fl, hemY + 0.5]], MAT.skirt, 0,
      (x, y) => (Math.round(x - ox - fl * (y - waistY) / 12) % 3 === 0 ? -1 : 0));
    // loose tee, tucked in
    R.poly([[ox - 7 + bx, shY + 2.4], [ox + 7 + bx, shY + 2.4], [ox + 6 + bx, waistY - 1], [ox + 5.6 + bx, waistY + 1.2], [ox - 5.6 + bx, waistY + 1.2], [ox - 6 + bx, waistY - 1]], MAT.dress, 0,
      (x, y) => (y > waistY - 2 && Math.round(x - ox) % 3 === 0 ? -1 : 0));
    R.capsule(ox - 6.3 + bx, shY + 1.4, ox + 6.3 + bx, shY + 1.4, 1.7, 1.7, MAT.dress);
  } else {
    const hemY = hipY + 5;
    const b = bx * 0.5;
    // oversized tee, dropped shoulders, hanging past the hips
    R.poly([
      [ox - 4 + b, shY - 1], [ox + 4 + b, shY - 1], [ox + C.sh - 1.5 + b, shY + 1.4], [ox + C.sh + 0.2 + b, shY + 5], [ox + 8.8 + b, shY + 9], [ox + 8.6, hemY - 4], [ox + 9, hemY], [ox - 9, hemY], [ox - 8.6, hemY - 4], [ox - 8.8 + b, shY + 9], [ox - C.sh - 0.2 + b, shY + 5], [ox - C.sh + 1.5 + b, shY + 1.4],
    ], MAT.top, 0, (x, y) => ((Math.round(x - ox) === -5 || Math.round(x - ox) === 4) && y > hemY - 9 ? -1 : 0));
    if (p.front) heartPrint(R, ox + b + 2.5, shY + 6, 1);
    else heartPrint(R, ox + b, shY + 8, 2);
  }
  // Arms (IK towards hand targets, relative to ox)
  for (const s of [-1, 1]) {
    const sx = ox + s * (C.sh - (C.girl ? 1.5 : 2.4)) + bx * 0.5, sy = shY + (C.girl ? 2.5 : 3.5);
    const tgt = s < 0 ? p.lhand : p.rhand;
    const tx = tgt ? tgt[0] : sx + s * 2.2 + wt * 0.3, ty = tgt ? tgt[1] : sy + C.ua + C.fa - 1.5;
    const [ex, ey, wx, wy] = ik(sx, sy, tx, ty, C.ua, C.fa, p.bend ? p.bend[s < 0 ? 0 : 1] : s > 0 ? 1 : -1);
    const r0 = C.girl ? 1.8 : 2.4, r1 = C.girl ? 1.5 : 2.0, r2 = C.girl ? 1.3 : 1.7;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin);
    R.ellipse(wx + Math.sign(wx - ex) * 0.6, wy + 1.2, r2 + 0.5, r2 + 0.9, MAT.skin);
    // short sleeves; his are wide and reach the elbow
    if (C.girl) R.capsule(sx, sy, lerp(sx, ex, 0.35), lerp(sy, ey, 0.35), 2.8, 2.5, MAT.dress);
    else R.capsule(sx, sy, lerp(sx, ex, 0.7), lerp(sy, ey, 0.7), 3.4, 3.1, MAT.top);
  }
  // Neck & head (hair all round from behind; from the front, a fringe hides the eyes)
  const hx = headX + bx * 0.5;
  R.capsule(ox + bx * 0.5, shY + 1, ox + hx, headY + 3, 2.2, 2.0, MAT.skin);
  R.ellipse(ox + hx - C.headRx + 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  R.ellipse(ox + hx + C.headRx - 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  if (p.front) {
    R.ellipse(ox + hx, headY - 0.6, C.headRx + 0.6, C.headRy - 0.4, MAT.hair, 0, (p.tilt || 0) * 0.25);
    R.ellipse(ox + hx, headY + 1.6, C.headRx - 0.8, C.headRy - 2.2, MAT.skin, 0, (p.tilt || 0) * 0.25);
    R.ellipse(ox + hx - 1.4, headY - 0.6, 4.2, 2.6, MAT.hair);
    R.ellipse(ox + hx + 2.2, headY - 0.9, 3.4, 2.4, MAT.hair);
  } else {
    R.ellipse(ox + hx, headY, C.headRx, C.headRy, MAT.hair, 0, (p.tilt || 0) * 0.25);
    R.ellipse(ox + hx, headY - 0.4, C.headRx + 0.6, C.headRy - 0.2, MAT.hair, 0, (p.tilt || 0) * 0.25);
  }
  R.capsule(ox + hx - 3.2, headY - 3.4, ox + hx + 0.4, headY - 4.5, 0.55, 0.55, MAT.shine);
  if (!C.girl) {
    // fluffy, a little messy
    R.ellipse(ox + hx - 3, headY - C.headRy + 1, 2.2, 1.6, MAT.hair);
    R.ellipse(ox + hx + 2.4, headY - C.headRy + 0.8, 2.4, 1.6, MAT.hair);
  } else if (!p.front) {
    const hs = p.hairSway || 0;
    const top = headY - 2;
    R.poly([
      [ox + hx - 5, top], [ox + hx + 5, top], [ox + hx + 6 + hs * 0.2, shY + 1], [ox + hx + 5.2 + hs * 0.6, shY + 9], [ox + hx + 4.2 + hs, shY + 14],
      [ox + hx + 1.5 + hs, shY + 16], [ox + hx - 1 + hs, shY + 15], [ox + hx - 3.8 + hs, shY + 16.5], [ox + hx - 5.4 + hs * 0.6, shY + 10], [ox + hx - 6 + hs * 0.2, shY + 1],
    ], MAT.hair, 0, (x, y) => ((Math.round(x - ox - hx + y * 0.08) % 4 === 0 && y > shY - 2) ? 1 : 0));
    // a little pink clip
    R.ellipse(ox + hx + 3, headY - 2.4, 1.3, 0.9, MAT.bow);
  }
  const ears = [[ox + hx - C.headRx + 0.3, headY + 1.2], [ox + hx + C.headRx - 0.3, headY + 1.2]];
  return { ears, pocket: [ox + 5, hipY + 3] };
}

// Side view facing +1 (right) or -1 (left).
// p: { dist, moving, lean, hands: [[x,y],[x,y]] | null, tip, headTilt, headX, headY, hairSway, flutter, nod }
function drawSide(R, C, ox, f, p) {
  const tip = p.tip || 0;
  const moving = p.moving ?? 0;
  const D = STRIDE * C.leg;
  const u0 = (((p.dist || 0) / D) % 1 + 1) % 1;
  const lift = (C.girl ? 3.8 : 4.4) * moving;
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
  const nod = Math.sin(u0 * Math.PI * 4 - 0.6) * 0.35 * moving + (p.nod || 0); // the head settles a beat after the body
  const headX = shX + (p.headX || 0) + 1, headY = shY - C.neck - C.headRy + 1 + (p.headY || 0) + nod;
  const X = (x) => ox + x * f;
  const drawLeg = (L, sh) => {
    const hx = X(0), hy = hipY;
    const kx = X(L.kx), ky = hipY + L.ky, ax = X(L.ax), ay = hipY + L.ay;
    // the shoe pivots with the heel lifting and the toes coming down
    const r = L.rot, fwd = C.girl ? 1.6 : 2.2;
    const sx = ax + f * Math.cos(r) * fwd, sy = ay + 1.1 + Math.sin(r) * fwd;
    if (C.girl) {
      R.capsule(hx, hy, kx, ky, 2.5, 2.1, MAT.skin, sh);
      R.capsule(kx, ky, ax, ay, 2.1, 1.6, MAT.skin, sh);
      R.capsule(lerp(kx, ax, 0.22), lerp(ky, ay, 0.22), ax, ay, 2.0, 1.8, MAT.sock, sh);
      sneaker(R, sx, sy, f, r, false, sh);
    } else {
      // baggy jeans: wide all the way down, bunching over the sneaker
      R.capsule(hx, hy, kx, ky, 3.9, 3.5, MAT.bottom, sh);
      R.capsule(kx, ky, ax, ay - 0.6, 3.5, 3.7, MAT.bottom, sh);
      sneaker(R, sx, sy, f, r, true, sh);
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
      const a = (C.girl ? 0.4 : 0.48) * moving;
      const th = -a * Math.cos((feet[i].u - 0.06) * Math.PI * 2) + 0.04;
      const bend = 0.14 + Math.max(0, th) * 1.2 + 0.1 * moving;
      ex = sx + Math.sin(th) * C.ua * f; ey = sy + Math.cos(th) * C.ua;
      wx = ex + Math.sin(th + bend) * (C.fa - 1) * f; wy = ey + Math.cos(th + bend) * (C.fa - 1);
    }
    const r0 = C.girl ? 1.8 : 2.3, r1 = C.girl ? 1.5 : 1.9, r2 = C.girl ? 1.3 : 1.7;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin, sh);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin, sh);
    R.ellipse(wx, wy + 0.8, r2 + 0.5, r2 + 0.8, MAT.skin, sh);
    if (C.girl) R.capsule(sx, sy, lerp(sx, ex, 0.35), lerp(sy, ey, 0.35), 2.7, 2.4, MAT.dress, sh);
    else R.capsule(sx, sy, lerp(sx, ex, 0.7), lerp(sy, ey, 0.7), 3.3, 3.0, MAT.top, sh);
  };
  // far limbs, then the near leg (clothes hang over the legs)
  armFor(1, -1);
  drawLeg(legs[1], -1);
  drawLeg(legs[0], 0);
  // torso
  if (C.girl) {
    const waistY = shY + C.torso * 0.64, hemY = hipY + C.leg * 0.34;
    const k0 = Math.min(legs[0].kx, legs[1].kx), k1 = Math.max(legs[0].kx, legs[1].kx);
    // the pleats swing with the stride and trail behind her
    const fl = (p.flutter || 0) + Math.sin(u0 * Math.PI * 4) * 1.0 * moving - 1.2 * moving;
    R.poly([
      [X(shX * 0.5 - 4.4), waistY], [X(shX * 0.5 + 4.6), waistY], [X(Math.max(k1 * 0.6 + 6, 7.5) + fl * 0.4), hemY + Math.abs(fl) * 0.2],
      [X(0), hemY + 0.8], [X(Math.min(k0 * 0.6 - 6, -7.5) + fl), hemY - 0.5 - Math.abs(fl) * 0.3],
    ], MAT.skirt, 0, (x, y) => (Math.round((x - ox) - fl * (y - waistY) / 12) % 3 === 0 ? -1 : 0));
    R.poly([
      [X(shX - 4.2), shY + 2], [X(shX + 4.8), shY + 2.6], [X(shX * 0.5 + 5.2), waistY - 1], [X(shX * 0.5 + 4.6), waistY + 1.4], [X(shX * 0.5 - 4.4), waistY + 1.4], [X(shX * 0.5 - 4.8), waistY - 1.5],
    ], MAT.dress, 0, (x, y) => (y > waistY - 2 && Math.round(x - ox) % 3 === 0 ? -1 : 0));
  } else {
    R.poly([
      [X(shX - 5.6), shY - 0.4], [X(shX + 6), shY + 0.6], [X(shX * 0.5 + 6.6), hipY - 2], [X(6.8), hipY + 5], [X(-6.2), hipY + 5], [X(shX * 0.5 - 6), hipY - 4],
    ], MAT.top, 0, (x, y) => (Math.round((x - ox) * f) === -2 && y > hipY - 6 ? -1 : 0));
    heartPrint(R, X(shX * 0.6 + 3), shY + 7, 1);
  }
  // neck & head: a face in shadow, the fringe falling over the eyes
  R.capsule(X(shX), shY + 1, X(headX - 0.6), headY + 3, 2.2, 2.0, MAT.skin);
  R.ellipse(X(headX), headY, C.headRx, C.headRy, MAT.skin, 0, (p.headTilt || 0) * f);
  R.put(Math.floor(X(headX + C.headRx) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 0.5 + R.oy), MAT.skin, 0);
  R.put(Math.floor(X(headX + C.headRx - 0.5) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 3 + R.oy), MAT.skin, 0);
  R.ellipse(X(headX - 1), headY - 1.5, C.headRx + 0.4, C.headRy - 1.3, MAT.hair, 0, (p.headTilt || 0) * f);
  R.ellipse(X(headX + (C.girl ? 1.8 : 2.2)), headY - 1.6, C.girl ? 3.8 : 3.6, 2.4, MAT.hair);
  if (C.girl) {
    const hs = (p.hairSway || 0) - 1.5 * moving + Math.sin(u0 * Math.PI * 4 - 1.2) * 0.6 * moving;
    R.poly([
      [X(headX - 1), headY - C.headRy + 0.5], [X(headX + 3.5), headY - 3], [X(headX - 1.5), headY + 3], [X(shX - 1.5), shY + 6],
      [X(shX - 4 + hs), shY + 14], [X(shX - 7 + hs), shY + 13], [X(shX - 7.5 + hs * 0.6), shY + 2], [X(headX - 5.8), headY - 1],
    ], MAT.hair);
    R.ellipse(X(headX - 3), headY - 3.6, 1.3, 0.9, MAT.bow);
  } else {
    R.ellipse(X(headX - 2.4), headY - 0.2, 3.4, 4.6, MAT.hair);
    R.ellipse(X(headX - 1.5), headY - C.headRy + 1.2, 3.2, 1.8, MAT.hair);
    R.ellipse(X(headX + 1.5), headY - C.headRy + 1.4, 2.6, 1.6, MAT.hair);
  }
  R.capsule(X(headX - 2.5), headY - C.headRy + 1.6, X(headX + 0.5), headY - C.headRy + 1.1, 0.5, 0.5, MAT.shine);
  armFor(0, 0);
  return { ears: [[X(headX - 0.6), headY + 1]], pocket: [X(2.5), hipY + 3] };
}

// A thin cord from a to b, sagging a little in the middle.
function cord(R, a, b, sag = 3) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.5) + 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t) + Math.sin(t * Math.PI) * sag;
    R.put(Math.floor(x + R.ox), Math.floor(y + R.oy), MAT.cord, 0);
  }
}
// Earbuds: a white bud in each ear and the cord down to his phone. Shared, it
// splits at a Y between them, one bud each.
function earbuds(R, earsA, pocket, earB) {
  const ears = earB ? [earsA[0], earB] : earsA.length > 1 ? earsA : [earsA[0], [earsA[0][0] - 1.5, earsA[0][1] + 3]];
  for (const [x, y] of ears) { R.put(Math.floor(x + R.ox), Math.floor(y + R.oy), MAT.cord, 0); R.put(Math.floor(x + R.ox), Math.floor(y + 1 + R.oy), MAT.cord, 0); }
  const jy = Math.max(ears[0][1], ears[1][1]) + (earB ? 13 : 9);
  const jx = (ears[0][0] + ears[1][0]) / 2;
  cord(R, [ears[0][0], ears[0][1] + 1.5], [jx, jy], earB ? 2.5 : 0.5);
  cord(R, [ears[1][0], ears[1][1] + 1.5], [jx, jy], earB ? 2.5 : 0.5);
  cord(R, [jx, jy], pocket, 3);
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
      const g = drawSide(R, GUY, -gh, 1, { dist: dist + 9, moving: this.moving });
      const q = drawSide(R, GIRL, gh, 1, { dist, moving: this.moving, hairSway: Math.sin(t * 2) * 0.6 });
      earbuds(R, g.ears, g.pocket, q.ears[0]);
    } else if (this.mode === 'back') {
      const h = this.hold, ln = this.lean, pt = this.point, gl = this.glance;
      const meetX = 0, meetY = -GIRL.leg - 1 + (1 - h) * 3;
      const gx = -gh, qx = gh;
      const guyR = h > 0 ? [lerp(gx + GUY.sh + 1, meetX - 1.5, h), lerp(-GUY.leg + 11, meetY, h)] : null;
      let girlL = h > 0 ? [lerp(qx - GIRL.sh - 1, meetX + 1.5, h), lerp(-GIRL.leg + 9, meetY + 1, h)] : null;
      // her free hand comes up to point at the glass
      const girlR = pt > 0 ? [lerp(qx + GIRL.sh + 1.5, qx + GIRL.sh + 5, pt), lerp(-GIRL.leg + 8, -GIRL.leg - GIRL.torso - 3 + Math.sin(t * 3) * 0.6, pt)] : null;
      const wg = Math.sin(t * 0.45) * 0.8 * (1 - h), wq = Math.sin(t * 0.38 + 2) * 0.8 * (1 - h);
      const nod = this.nod(t);
      const g = drawBack(R, GUY, gx, { breath, tilt: 0.35 * ln + 0.3 * gl, rhand: guyR, headX: ln * 1.2 + gl * 1.6, sway: ln * 0.6, weight: wg, nod });
      const q = drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, tilt: -1.4 * ln, lhand: girlL, rhand: girlR, headX: -ln * 3.2 + pt * 0.8, headY: ln * 1.6 - pt * 0.6, sway: -ln * 1.2, weight: wq,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5, nod: this.nod(t + 0.1),
      });
      earbuds(R, [g.ears[1]], g.pocket, q.ears[0]);
    } else if (this.mode === 'face' || this.mode === 'hug') {
      // facing each other holding hands; k -> 1 leans in to a forehead kiss on tiptoe
      const k = this.hug;
      const g = 10;
      const handY = lerp(-GUY.leg + 1, -GUY.leg - 11, k);
      const hA = [[-1.2, handY - 1], [-0.6, handY + 1.2]];
      const hB = [[1.2, handY], [0.6, handY + 1.6]];
      const a = drawSide(R, GUY, -g, 1, { hands: hA, lean: 0.13 * k, headX: 0.6 * k, headY: 1.2 * k, headTilt: 0.2 * k });
      const q = drawSide(R, GIRL, g, -1, {
        hands: hB, tip: 3 * k, lean: 0.11 * k, headTilt: -0.3 * k, headX: 0.8 * k, headY: -0.5 * k,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.6,
      });
      earbuds(R, a.ears, a.pocket, q.ears[0]);
    }
    this.shade(light, wx, pulse);
    return this.canvas;
  }

  // a little nod on the beat of whatever's playing in their earbuds (72 bpm)
  nod(t) { return Math.sin(t * Math.PI * 2 * 1.2) > 0.55 ? 0.7 : 0; }

  // Before they meet he has both earbuds in, on his own.
  renderApart(t, breath, gh) {
    const R = this.R, gx = -gh;
    const gs = -GUY.leg - GUY.torso; // his shoulder height
    let g;
    if (this.mode === 'walk') g = drawSide(R, GUY, gx, 1, { dist: this.walk * 7.5 + 9, moving: this.moving });
    else if (this.mode === 'side') g = drawSide(R, GUY, gx, 1, {});
    else if (this.mode === 'front') {
      const w = Math.sin(t * 14);
      const P = {
        cheer: { lhand: [gx - 14 + w, gs - 20], rhand: [gx + 14 - w, gs - 20], bend: [1, -1] },
        dab: { lhand: [gx - 21, gs - 13], rhand: [gx - 13, gs - 16], bend: [-1, 1], tilt: -1.4, headY: 1.8 },
        wave: { rhand: [gx + 11 + Math.sin(t * 9) * 2, gs - 10] },
        surprised: { lhand: [gx - 12, gs + 9], rhand: [gx + 12, gs + 9] },
      }[this.pose] || {};
      g = drawBack(R, GUY, gx, { breath, front: true, ...P });
    } else {
      const pt = this.point;
      const rh = pt > 0 ? [lerp(gx + GUY.sh + 1.5, gx + GUY.sh + 6, pt), lerp(-GUY.leg + 9, gs - 3 + Math.sin(t * 3) * 0.6, pt)] : null;
      g = drawBack(R, GUY, gx, { breath, rhand: rh, weight: Math.sin(t * 0.45) * 0.8, nod: this.nod(t) });
    }
    earbuds(R, g.ears, g.pocket);
    if (!this.girlOn) return;
    const qx = gh + this.girlDX;
    if (this.girlPose === 'side') {
      const wv = this.girlWave;
      const hands = wv > 0 ? [[qx - lerp(4, 10, wv) + Math.sin(t * 10) * 1.5 * wv, lerp(-GIRL.leg + 4, -GIRL.leg - GIRL.torso - 11, wv)], null] : null;
      drawSide(R, GIRL, qx, -1, { hands, hairSway: Math.sin(t * 0.9) * 0.8 });
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
        // the earbud cord is thin and pale enough to catch the light everywhere
        if (mt === MAT.cord) { d[o] = md[0] * 0.36 + light[0] * 0.22; d[o + 1] = md[1] * 0.36 + light[1] * 0.22; d[o + 2] = md[2] * 0.36 + light[2] * 0.22; continue; }
        const wxp = x + wx;
        const ripple = Math.sin(wxp * 0.31 + t * 2.1) * Math.sin(y * 0.23 - t * 1.6 + wxp * 0.07);
        // ambient: the dim, cool hall, with a faint dapple of tank light
        let k = (0.32 - low * 0.16) * (1 + ripple * 0.1);
        if (s[i] < 0) k *= 0.62;
        if (s[i] > 0) k *= 1.2;
        let r = (dk[0] + (md[0] - dk[0]) * k) * 0.48, g = (dk[1] + (md[1] - dk[1]) * k) * 0.52, b = (dk[2] + (md[2] - dk[2]) * k) * 0.68;
        r = r * 0.8 + HALL[0] * 0.2; g = g * 0.8 + HALL[1] * 0.2; b = b * 0.8 + HALL[2] * 0.2;
        // rim: strongest on top edges, softer on the sides, a pixel or two deep
        let rim = 0;
        if (!at(x, y - 1)) rim = 1;
        else if (!at(x - 1, y) || !at(x + 1, y)) rim = 0.72;
        else if (!at(x, y - 2)) rim = 0.36;
        else if (!at(x - 2, y) || !at(x + 2, y)) rim = 0.2;
        else if (m[i - W] && m[i - W] !== mt && s[i - W] >= s[i]) rim = 0.12; // a seam where one part meets another
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
