// The couple: procedurally rigged pixel figures, back-lit by the tank.
// Both characters rasterize into one shared buffer so joined hands and hugs
// merge into one shape, then a lighting pass colours it: the hall is dark, so
// they read almost as shadows, with the tank's light wrapping round the edges.
//
// Walking is keyframed from a classic 8-frame side-view cycle (contact, down,
// passing, up for each leg): legs straighten at the heel strike and through
// the stance, the knee only folds in the swing, and the body rises and dips
// a pixel or two as the lowest heel or toe sets the hip height.
import { clamp, lerp, segDist, pointInPoly, hex, Buf, makeCanvas } from '../util.js';

const MAT = { skin: 1, hair: 2, top: 3, bottom: 4, shoe: 5, tee: 6, shoeW: 7, print: 8, sock: 9, clip: 10, skirt: 11, shine: 12, sole: 13 };
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
};
const TONE = {};
for (const k in TONES) TONE[k] = TONES[k].map(hex);
const HALL = hex('#03050e');
const RAD = Math.PI / 180;

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

// Proportions: about six and a half heads tall, legs half the height.
export const GUY = { headRx: 5.2, headRy: 5.8, neck: 2.6, sh: 9, torso: 22, leg: 35, foot: 4.4, ua: 12.5, fa: 12, girl: false };
export const GIRL = { headRx: 4.8, headRy: 5.4, neck: 2.8, sh: 7.4, torso: 19.5, leg: 32, foot: 3.8, ua: 11.2, fa: 10.6, girl: true };

// ----------------------------------------------------------------- gait --
// One leg over the 8 frames, starting at its heel strike:
// [thigh angle, knee bend, foot angle] in degrees. Thigh forward is positive,
// the knee folds the shin back, a positive foot angle points the toes down.
const LEG_KEYS = [
  [22, 4, -12],   // contact: leg straight out in front, toes up
  [15, 14, 0],    // down: the knee gives a little as the weight lands
  [4, 6, 0],      // passing: straight under the body
  [-8, 4, 8],     // up: heel starting to lift
  [-20, 10, 30],  // the other foot lands; this one pushes off its toes
  [-12, 42, 38],  // lifts off, knee folding
  [8, 62, 15],    // swings through under the body
  [24, 26, -5],   // reaches forward for the next step
];
// The arm on the same side: back while that leg is forward, and the elbow
// bends more as it swings to the front. [upper arm angle, elbow bend]
const ARM_KEYS = [[-20, 10], [-14, 12], [-2, 16], [12, 24], [22, 32], [14, 26], [2, 18], [-12, 12]];
const FRAMES = 8;
const catmull = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
function keyAt(keys, p) {
  const n = keys.length, f = Math.floor(p), t = p - f, i = ((f % n) + n) % n;
  const k0 = keys[(i + n - 1) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  return k1.map((_, j) => catmull(k0[j], k1[j], k2[j], k3[j], t));
}
// Forward kinematics for one leg, relative to the hip (x forward, y down).
function legFK(C, th, kn, ft) {
  const L = C.leg * 0.5, a = th * RAD, b = (th - kn) * RAD, ps = ft * RAD;
  const kx = Math.sin(a) * L, ky = Math.cos(a) * L;
  const ax = kx + Math.sin(b) * L, ay = ky + Math.cos(b) * L;
  const dx = Math.cos(ps), dy = Math.sin(ps), nx = -dy, ny = dx, fh = 2.2;
  return { kx, ky, ax, ay, ps, heel: [ax - dx * 1.5 + nx * fh, ay - dy * 1.5 + ny * fh], toe: [ax + dx * C.foot + nx * fh, ay + dy * C.foot + ny * fh] };
}
// Distance covered by one full cycle: twice how far a planted foot travels
// back under the body from its heel strike to the other foot's.
for (const C of [GUY, GIRL]) C.stride = 2 * (legFK(C, ...LEG_KEYS[0]).ax - legFK(C, ...LEG_KEYS[4]).ax);

// --------------------------------------------------------------- pieces --
function shoe(R, X, hipY, L, big, sh, f) {
  const hx = X(L.heel[0]), hy = hipY + L.heel[1], tx = X(L.toe[0]), ty = hipY + L.toe[1];
  const ang = Math.atan2(ty - hy, tx - hx);
  R.capsule(hx, hy - 0.6, tx, ty - 0.6, 1.1, 1.1, MAT.sole, sh);
  const mx = (hx + tx) / 2 + Math.sin(ang) * 1.3, my = (hy + ty) / 2 - Math.abs(Math.cos(ang)) * 1.3 - 0.4;
  R.ellipse(mx - f * 0.3, my, Math.hypot(tx - hx, ty - hy) / 2 + 0.5, big ? 2.0 : 1.7, big ? MAT.shoe : MAT.shoeW, sh, ang);
}
// A little pink heart print (the graphic on his tee).
function heartPrint(R, cx, cy, big) {
  const pts = big ? ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] : ['#.#', '###', '.#.'];
  const w = pts[0].length, h = pts.length;
  pts.forEach((row, j) => { for (let i = 0; i < w; i++) if (row[i] === '#') R.put(Math.floor(cx - w / 2 + i + R.ox), Math.floor(cy - h / 2 + j + R.oy), MAT.print, 0); });
}

// ---------------------------------------------------------------- views --
// Standing, seen from behind (facing the tank), or with p.front facing us.
// p: { breath, tilt, lhand, rhand, sway, tip, headX, headY, weight, front, bend, hairSway, flutter }
function drawBack(R, C, ox, p) {
  const breath = p.breath || 0, tip = p.tip || 0, sway = p.sway || 0, wt = p.weight || 0;
  const hipY = -2.4 - C.leg - tip;
  const shY = hipY - C.torso - breath * 0.5;
  const bx = sway + wt * 0.6; // the body rides over the weighted foot
  const headX = bx * 0.5 + sway * 0.5 + (p.tilt || 0) * 2.2 + (p.headX || 0);
  const headY = shY - C.neck - C.headRy + 1 + (p.headY || 0);
  const kneeY = hipY + C.leg * 0.5;
  // legs
  for (const s of [-1, 1]) {
    const hx = ox + s * (C.girl ? 2.8 : 3.4) + bx * 0.6, kx = ox + s * (C.girl ? 2.8 : 3.8) + wt * 0.4, ax = ox + s * (C.girl ? 3.0 : 4.0), ay = -2.4 - (s > 0 ? tip : 0);
    if (C.girl) {
      R.capsule(hx, hipY + 1, kx, kneeY, 3.1, 2.2, MAT.skin);
      R.capsule(kx, kneeY, ax, ay, 2.2, 1.4, MAT.skin);
      R.ellipse(lerp(kx, ax, 0.3), lerp(kneeY, ay, 0.3), 2.4, 3.2, MAT.skin);
      R.capsule(lerp(kx, ax, 0.38), lerp(kneeY, ay, 0.38), ax, ay, 1.9, 1.6, MAT.sock);
    } else {
      R.capsule(hx, hipY + 1, kx, kneeY, 3.8, 3.4, MAT.bottom);
      R.capsule(kx, kneeY, ax, ay - 0.4, 3.4, 3.5, MAT.bottom);
    }
    R.ellipse(ax + s * 0.4, ay + 1.1, C.girl ? 2.2 : 2.9, 1.2, MAT.sole);
    R.ellipse(ax + s * 0.4, ay + 0.2, C.girl ? 2.0 : 2.7, 1.5, C.girl ? MAT.shoeW : MAT.shoe);
  }
  // torso
  if (C.girl) {
    const waistY = shY + C.torso * 0.62, hemY = hipY + C.leg * 0.3, fl = p.flutter || 0;
    R.ellipse(ox + bx * 0.6, hipY - 0.5, 5.4, 3.8, MAT.skirt);
    R.poly([[ox - 4 + bx, waistY], [ox + 4 + bx, waistY], [ox + 6.2 + bx * 0.6, hipY], [ox + 8.2 + fl, hemY], [ox - 8.2 + fl, hemY + 0.5], [ox - 6.2 + bx * 0.6, hipY]], MAT.skirt, 0,
      (x, y) => (Math.round(x - ox - fl * (y - waistY) / 12) % 3 === 0 ? -1 : 0));
    R.poly([[ox - 6.6 + bx, shY + 2.2], [ox + 6.6 + bx, shY + 2.2], [ox + 5.8 + bx, shY + 8], [ox + 4.2 + bx, waistY], [ox + 4.4 + bx, waistY + 1.3], [ox - 4.4 + bx, waistY + 1.3], [ox - 4.2 + bx, waistY], [ox - 5.8 + bx, shY + 8]], MAT.tee, 0,
      (x, y) => (y > waistY - 2 && Math.round(x - ox) % 3 === 0 ? -1 : 0));
    R.capsule(ox - 5.8 + bx, shY + 1.4, ox + 5.8 + bx, shY + 1.4, 1.6, 1.6, MAT.tee);
  } else {
    const hemY = hipY + 4, b = bx * 0.5;
    R.ellipse(ox + bx * 0.6, hipY, 5.8, 3.6, MAT.bottom);
    R.poly([
      [ox - 4 + b, shY - 1], [ox + 4 + b, shY - 1], [ox + C.sh - 1.2 + b, shY + 1.2], [ox + C.sh + 0.2 + b, shY + 5], [ox + 7.6 + b, shY + 10], [ox + 7.4, hemY - 3], [ox + 7.8, hemY], [ox - 7.8, hemY], [ox - 7.4, hemY - 3], [ox - 7.6 + b, shY + 10], [ox - C.sh - 0.2 + b, shY + 5], [ox - C.sh + 1.2 + b, shY + 1.2],
    ], MAT.top, 0, (x, y) => ((Math.round(x - ox) === -4 || Math.round(x - ox) === 3) && y > hemY - 8 ? -1 : 0));
    heartPrint(R, ox + b + (p.front ? 2.5 : 0), shY + (p.front ? 6 : 8), !p.front);
  }
  // arms
  for (const s of [-1, 1]) {
    const sx = ox + s * (C.sh - (C.girl ? 1.2 : 1.8)) + bx * 0.5, sy = shY + (C.girl ? 2.4 : 3);
    const tgt = s < 0 ? p.lhand : p.rhand;
    const tx = tgt ? tgt[0] : sx + s * 1.8 + wt * 0.3, ty = tgt ? tgt[1] : sy + C.ua + C.fa - 1.2;
    const [ex, ey, wx, wy] = ik(sx, sy, tx, ty, C.ua, C.fa, p.bend ? p.bend[s < 0 ? 0 : 1] : s > 0 ? 1 : -1);
    const r0 = C.girl ? 1.6 : 2.1, r1 = C.girl ? 1.3 : 1.7, r2 = C.girl ? 1.1 : 1.4;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin);
    R.ellipse(wx + Math.sign(wx - ex) * 0.5, wy + 1.1, r2 + 0.4, r2 + 0.8, MAT.skin);
    if (C.girl) R.capsule(sx, sy, lerp(sx, ex, 0.35), lerp(sy, ey, 0.35), 2.5, 2.2, MAT.tee);
    else R.capsule(sx, sy, lerp(sx, ex, 0.62), lerp(sy, ey, 0.62), 3.1, 2.8, MAT.top);
  }
  // neck & head
  const hx = ox + headX, rot = (p.tilt || 0) * 0.25;
  R.capsule(ox + bx * 0.5, shY + 1, hx, headY + 3, 2.0, 1.8, MAT.skin);
  R.ellipse(hx - C.headRx + 0.2, headY + 1.2, 1.0, 1.6, MAT.skin);
  R.ellipse(hx + C.headRx - 0.2, headY + 1.2, 1.0, 1.6, MAT.skin);
  R.ellipse(hx, headY - 0.3, C.headRx + 0.5, C.headRy, MAT.hair, 0, rot);
  if (p.front) {
    R.ellipse(hx, headY + 1.6, C.headRx - 0.8, C.headRy - 2, MAT.skin, 0, rot);
    R.ellipse(hx - 1.3, headY - 0.6, 3.8, 2.4, MAT.hair);
    R.ellipse(hx + 2, headY - 0.9, 3.0, 2.2, MAT.hair);
  }
  R.capsule(hx - 2.8, headY - 3.2, hx + 0.4, headY - 4.2, 0.5, 0.5, MAT.shine);
  if (C.girl && !p.front) {
    const hs = p.hairSway || 0;
    R.poly([
      [hx - 4.6, headY - 2], [hx + 4.6, headY - 2], [hx + 5.4 + hs * 0.2, shY + 1], [hx + 4.8 + hs * 0.6, shY + 8], [hx + 3.8 + hs, shY + 13],
      [hx + 1.4 + hs, shY + 14.5], [hx - 1 + hs, shY + 13.6], [hx - 3.6 + hs, shY + 15], [hx - 5 + hs * 0.6, shY + 9], [hx - 5.4 + hs * 0.2, shY + 1],
    ], MAT.hair, 0, (x, y) => ((Math.round(x - hx + y * 0.08) % 4 === 0 && y > shY - 2) ? 1 : 0));
    R.ellipse(hx + 2.8, headY - 2.2, 1.2, 0.8, MAT.clip);
  }
}

// Side view facing +1 (right) or -1 (left).
// p: { dist, moving, lean, hands: [[x,y]|null, [x,y]|null], tip, headTilt, headX, headY, hairSway, flutter }
function drawSide(R, C, ox, f, p) {
  const moving = p.moving ?? 0, tip = p.tip || 0;
  const ph = ((p.dist || 0) / C.stride) * FRAMES;
  // near leg on the cycle, far leg half a cycle on; at rest, a relaxed stance
  const legs = [0, 1].map((i) => {
    const k = keyAt(LEG_KEYS, ph + i * 4), rest = i ? [-2, 1, 0] : [3, 2, 0];
    const [th, kn, ft] = k.map((v, j) => lerp(rest[j], v, moving));
    return legFK(C, th, kn, ft + tip * 12); // on tiptoe the toes point down and lift her
  });
  let low = 0;
  for (const L of legs) low = Math.max(low, L.heel[1], L.toe[1]);
  const hipY = -low;
  const lean = (p.lean || 0) + 0.05 * moving;
  const shX = lean * C.torso, shY = hipY - C.torso;
  const headX = shX + 0.8 + (p.headX || 0), headY = shY - C.neck - C.headRy + 1 + (p.headY || 0);
  const X = (x) => ox + x * f;
  const drawLeg = (L, sh) => {
    const hx = X(0), hy = hipY, kx = X(L.kx), ky = hipY + L.ky, ax = X(L.ax), ay = hipY + L.ay;
    if (C.girl) {
      R.capsule(hx, hy, kx, ky, 3.3, 2.2, MAT.skin, sh);
      R.capsule(kx, ky, ax, ay, 2.2, 1.3, MAT.skin, sh);
      // the calf, fuller at the back of the shin
      const ang = Math.atan2(ay - ky, ax - kx);
      R.ellipse(lerp(kx, ax, 0.32) - f * Math.abs(Math.sin(ang)) * 0.2 - f * 0.6, lerp(ky, ay, 0.32), 1.9, 3.2, MAT.skin, sh, ang - Math.PI / 2);
      R.capsule(lerp(kx, ax, 0.4), lerp(ky, ay, 0.4), ax, ay, 1.8, 1.5, MAT.sock, sh);
      shoe(R, X, hipY, L, false, sh, f);
    } else {
      // baggy jeans, wide all the way down
      R.capsule(hx, hy, kx, ky, 3.8, 3.2, MAT.bottom, sh);
      R.capsule(kx, ky, ax, ay - 0.5, 3.2, 3.3, MAT.bottom, sh);
      shoe(R, X, hipY, L, true, sh, f);
    }
  };
  const armFor = (i, sh) => {
    const sx = X(shX - 0.4), sy = shY + 2.4;
    const hand = p.hands ? p.hands[i] : null;
    let ex, ey, wx, wy;
    if (hand) [ex, ey, wx, wy] = ik(sx, sy, hand[0], hand[1], C.ua, C.fa, f > 0 ? 1 : -1);
    else {
      const [u, e] = keyAt(ARM_KEYS, ph + i * 4);
      const up = lerp(2, u, moving) * RAD, el = lerp(8, e, moving) * RAD;
      ex = sx + Math.sin(up) * C.ua * f; ey = sy + Math.cos(up) * C.ua;
      wx = ex + Math.sin(up + el) * C.fa * f; wy = ey + Math.cos(up + el) * C.fa;
    }
    const r0 = C.girl ? 1.6 : 2.1, r1 = C.girl ? 1.3 : 1.7, r2 = C.girl ? 1.1 : 1.4;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin, sh);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin, sh);
    R.ellipse(wx, wy + 0.8, r2 + 0.4, r2 + 0.8, MAT.skin, sh);
    if (C.girl) R.capsule(sx, sy, lerp(sx, ex, 0.35), lerp(sy, ey, 0.35), 2.4, 2.1, MAT.tee, sh);
    else R.capsule(sx, sy, lerp(sx, ex, 0.62), lerp(sy, ey, 0.62), 3.0, 2.7, MAT.top, sh);
  };
  armFor(1, -1);
  drawLeg(legs[1], -1);
  drawLeg(legs[0], 0);
  if (C.girl) {
    const waistY = shY + C.torso * 0.62, hemY = hipY + C.leg * 0.3;
    const k0 = Math.min(legs[0].kx, legs[1].kx), k1 = Math.max(legs[0].kx, legs[1].kx);
    const fl = (p.flutter || 0) + Math.sin(ph * Math.PI / 2) * 0.8 * moving - 1.1 * moving;
    // skirt over the hips, pleats swinging with the stride
    R.poly([
      [X(shX * 0.4 - 3.4), waistY], [X(shX * 0.4 + 3.4), waistY], [X(4.4), hipY - 1], [X(Math.max(k1 * 0.5 + 6, 6.8) + fl * 0.4), hemY + Math.abs(fl) * 0.2],
      [X(0), hemY + 0.8], [X(Math.min(k0 * 0.5 - 6.2, -7) + fl), hemY - 0.5 - Math.abs(fl) * 0.3], [X(-5.4), hipY - 0.6],
    ], MAT.skirt, 0, (x, y) => (Math.round((x - ox) - fl * (y - waistY) / 12) % 3 === 0 ? -1 : 0));
    // fitted tee with a chest and a narrow waist, tucked in
    R.poly([
      [X(shX - 3.8), shY + 1.4], [X(shX + 3.6), shY + 2], [X(shX * 0.8 + 4.8), shY + 6.2], [X(shX * 0.6 + 4.2), shY + 9.4], [X(shX * 0.4 + 3.4), waistY], [X(shX * 0.4 + 3.6), waistY + 1.4],
      [X(shX * 0.4 - 3.8), waistY + 1.4], [X(shX * 0.4 - 3.4), waistY], [X(shX * 0.8 - 4.2), shY + 6],
    ], MAT.tee, 0, (x, y) => (y > waistY - 2 && Math.round(x - ox) % 3 === 0 ? -1 : 0));
  } else {
    R.ellipse(X(-0.3), hipY - 0.4, 4.9, 3.6, MAT.bottom);
    // oversized tee hanging past the hips
    R.poly([
      [X(shX - 4.8), shY - 0.2], [X(shX + 4.4), shY + 0.6], [X(shX * 0.8 + 5.4), shY + 6], [X(shX * 0.4 + 5.4), hipY - 3], [X(5.8), hipY + 4], [X(-5.8), hipY + 4], [X(shX * 0.4 - 5.4), hipY - 4], [X(shX * 0.8 - 5.2), shY + 5],
    ], MAT.top, 0, (x, y) => (Math.round((x - ox) * f) === -2 && y > hipY - 6 ? -1 : 0));
    heartPrint(R, X(shX * 0.7 + 3), shY + 7, false);
  }
  // neck & head: the face stays in shadow, the fringe falling over the eyes
  const rot = (p.headTilt || 0) * f;
  R.capsule(X(shX), shY + 1, X(headX - 0.6), headY + 3, 2.0, 1.8, MAT.skin);
  R.ellipse(X(headX), headY, C.headRx, C.headRy, MAT.skin, 0, rot);
  R.put(Math.floor(X(headX + C.headRx) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 0.5 + R.oy), MAT.skin, 0);
  R.put(Math.floor(X(headX + C.headRx - 0.5) + R.ox + (f > 0 ? 0 : -1)), Math.floor(headY + 3 + R.oy), MAT.skin, 0);
  R.ellipse(X(headX - 1), headY - 1.4, C.headRx + 0.4, C.headRy - 1.2, MAT.hair, 0, rot);
  R.ellipse(X(headX + 1.8), headY - 1.5, 3.4, 2.2, MAT.hair);
  if (C.girl) {
    const hs = (p.hairSway || 0) - 1.4 * moving + Math.sin(ph * Math.PI / 2 - 1.2) * 0.5 * moving;
    R.poly([
      [X(headX - 1), headY - C.headRy + 0.5], [X(headX + 3.2), headY - 3], [X(headX - 1.4), headY + 3], [X(shX - 1.4), shY + 5.5],
      [X(shX - 3.6 + hs), shY + 13], [X(shX - 6.4 + hs), shY + 12], [X(shX - 6.8 + hs * 0.6), shY + 2], [X(headX - 5.2), headY - 1],
    ], MAT.hair);
    R.ellipse(X(headX - 2.8), headY - 3.4, 1.2, 0.8, MAT.clip);
  } else {
    R.ellipse(X(headX - 2.2), headY - 0.2, 3.0, 4.2, MAT.hair);
    R.ellipse(X(headX - 1.4), headY - C.headRy + 1.1, 2.8, 1.6, MAT.hair);
    R.ellipse(X(headX + 1.4), headY - C.headRy + 1.3, 2.4, 1.5, MAT.hair);
  }
  R.capsule(X(headX - 2.4), headY - C.headRy + 1.5, X(headX + 0.4), headY - C.headRy + 1.0, 0.5, 0.5, MAT.shine);
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
    this.mode = 'walk'; // walk | back | face | hug
    this.t = 0;
    this.walk = 0; // distance walked (x7.5 = px)
    this.moving = 0;
    this.hold = 0; // back view hand-holding 0..1
    this.lean = 0; // her head on his shoulder
    this.hands = 0;
    this.hug = 0;
    this.point = 0; // back view: pointing at something in the tank
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
    this.shake = 0;       // shaking hands, 0..1
    this.pose = 'cheer';  // his front-view pose: cheer | wave | surprised
    this.hop = 0;         // lift off the floor, applied by the stage
  }

  update(dt) { this.t += dt; }

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
      const meetX = 0, meetY = -GIRL.leg - 3 + (1 - h) * 3;
      const gx = -gh, qx = gh;
      const guyR = h > 0 ? [lerp(gx + GUY.sh + 1, meetX - 1.5, h), lerp(-GUY.leg + 9, meetY, h)] : null;
      const girlL = h > 0 ? [lerp(qx - GIRL.sh - 1, meetX + 1.5, h), lerp(-GIRL.leg + 7, meetY + 1, h)] : null;
      // her free hand comes up to point at the glass
      const girlR = pt > 0 ? [lerp(qx + GIRL.sh + 1.5, qx + GIRL.sh + 5, pt), lerp(-GIRL.leg + 6, -GIRL.leg - GIRL.torso - 5 + Math.sin(t * 3) * 0.6, pt)] : null;
      const wg = Math.sin(t * 0.45) * 0.8 * (1 - h), wq = Math.sin(t * 0.38 + 2) * 0.8 * (1 - h);
      drawBack(R, GUY, gx, { breath, tilt: 0.35 * ln + 0.3 * gl, rhand: guyR, headX: ln * 1.2 + gl * 1.6, sway: ln * 0.6, weight: wg });
      drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, tilt: -1.4 * ln, lhand: girlL, rhand: girlR, headX: -ln * 3.2 + pt * 0.8, headY: ln * 1.6 - pt * 0.6, sway: -ln * 1.2, weight: wq,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5,
      });
    } else if (this.mode === 'face' || this.mode === 'hug') {
      // facing each other holding hands; k -> 1 leans in to a forehead kiss on tiptoe
      const k = this.hug, g = 10;
      const handY = lerp(-GUY.leg - 1, -GUY.leg - 12, k);
      const hA = [[-1.2, handY - 1], [-0.6, handY + 1.2]];
      const hB = [[1.2, handY], [0.6, handY + 1.6]];
      drawSide(R, GUY, -g, 1, { hands: hA, lean: 0.13 * k, headX: 0.6 * k, headY: 1.2 * k, headTilt: 0.2 * k });
      drawSide(R, GIRL, g, -1, {
        hands: hB, tip: k, lean: 0.11 * k, headTilt: -0.3 * k, headX: 0.8 * k, headY: -0.5 * k,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.6,
      });
    }
    this.shade(light, wx, pulse);
    return this.canvas;
  }

  renderApart(t, breath, gh) {
    const R = this.R, gx = -gh, qx = gh + this.girlDX;
    const gs = -2.4 - GUY.leg - GUY.torso; // his shoulder height
    // shaking hands: their near hands meet halfway, pumping up and down
    const sk = this.shake, mid = (gx + qx) / 2, pump = Math.sin(t * 16) * 1.6 * sk;
    const shakeAt = (dx) => [mid + dx, -GUY.leg - 4 + pump];
    if (this.mode === 'walk') drawSide(R, GUY, gx, 1, { dist: this.walk * 7.5 + 9, moving: this.moving });
    else if (this.mode === 'side') drawSide(R, GUY, gx, 1, { hands: sk > 0 ? [shakeAt(-0.6), null] : null });
    else if (this.mode === 'front') {
      const w = Math.sin(t * 14);
      const P = {
        cheer: { lhand: [gx - 13 + w, gs - 19], rhand: [gx + 13 - w, gs - 19], bend: [1, -1] },
        wave: { rhand: [gx + 11 + Math.sin(t * 9) * 2, gs - 9] },
        surprised: { lhand: [gx - 11, gs + 9], rhand: [gx + 11, gs + 9] },
      }[this.pose] || {};
      drawBack(R, GUY, gx, { breath, front: true, ...P });
    } else {
      const pt = this.point;
      const rh = pt > 0 ? [lerp(gx + GUY.sh + 1.5, gx + GUY.sh + 6, pt), lerp(-GUY.leg + 7, gs - 3 + Math.sin(t * 3) * 0.6, pt)] : null;
      drawBack(R, GUY, gx, { breath, rhand: rh, weight: Math.sin(t * 0.45) * 0.8 });
    }
    if (!this.girlOn) return;
    if (this.girlPose === 'side') {
      const wv = this.girlWave;
      let hand = null;
      if (sk > 0) hand = shakeAt(0.6);
      else if (wv > 0) hand = [qx - lerp(4, 9, wv) + Math.sin(t * 10) * 1.5 * wv, lerp(-GIRL.leg + 2, -GIRL.leg - GIRL.torso - 12, wv)];
      drawSide(R, GIRL, qx, -1, { hands: hand ? [hand, null] : null, hairSway: Math.sin(t * 0.9) * 0.8 });
    } else {
      drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, weight: Math.sin(t * 0.38 + 2) * 0.8,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5,
      });
    }
  }

  // Lighting. The hall is dark and the tank is behind them, so the side we
  // see is deep in shadow: the clothes are only just there, a hint of colour
  // in near-black. The tank's light wraps round the outline as a rim tinted
  // by the light and the material, rippling as if through water and swelling
  // a little on the beat.
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
        const wxp = x + wx;
        const ripple = Math.sin(wxp * 0.31 + t * 2.1) * Math.sin(y * 0.23 - t * 1.6 + wxp * 0.07);
        let k = (0.16 - low * 0.06) * (1 + ripple * 0.08);
        if (s[i] < 0) k *= 0.55;
        if (s[i] > 0) k *= 1.25;
        let r = (dk[0] * 0.4 + md[0] * k) * 0.42, g = (dk[1] * 0.4 + md[1] * k) * 0.44, b = (dk[2] * 0.4 + md[2] * k) * 0.56;
        r = r * 0.7 + HALL[0] * 0.3; g = g * 0.7 + HALL[1] * 0.3; b = b * 0.7 + HALL[2] * 0.3;
        // rim: strongest on top edges, softer on the sides, a pixel or two deep
        let rim = 0;
        if (!at(x, y - 1)) rim = 1;
        else if (!at(x - 1, y) || !at(x + 1, y)) rim = 0.72;
        else if (!at(x, y - 2)) rim = 0.3;
        else if (!at(x - 2, y) || !at(x + 2, y)) rim = 0.14;
        else if (m[i - W] && m[i - W] !== mt && s[i - W] >= s[i]) rim = 0.08; // a seam where one part meets another
        if (mt === MAT.shine) rim = Math.max(rim, 0.3);
        if (rim > 0) {
          const a = clamp(rim * fall * (0.8 + ripple * 0.3) * boost * (s[i] < 0 ? 0.55 : 1));
          const cr = Math.min(255, lt[0] * lr * 0.9 + 255 * lr * 0.2);
          const cg = Math.min(255, lt[1] * lg * 0.9 + 255 * lg * 0.2);
          const cb = Math.min(255, lt[2] * lb * 0.9 + 255 * lb * 0.2);
          r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b;
      }
    }
    this.canvas.ctx.putImageData(this.img, 0, 0);
  }
}
