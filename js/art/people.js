// The couple: procedurally rigged pixel silhouettes, back-lit by the tank.
// Both characters rasterize into one shared buffer so joined hands and hugs
// merge into a single silhouette, then an automatic rim-light pass runs.
import { clamp, lerp, segDist, pointInPoly, hex, mixRGB, Buf, makeCanvas } from '../util.js';

const MAT = { skin: 1, hair: 2, top: 3, bottom: 4, shoe: 5, dress: 6, shoeW: 7, bow: 8 };
// Seen against the lit tank in a dark hall they read as shadows: a near-black
// body, far limbs a touch deeper, and a thin cool glow where light wraps the edge.
const BODY = hex('#04060e');
const FAR = hex('#020309');
const GLOW = hex('#7ab4ec');
const HAZE = hex('#16284a');

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

// ---------------------------------------------------------------- views --
// Back view (facing the tank). x is screen-right. p: { breath, tilt, lhand, rhand, sway, tip }
function drawBack(R, C, ox, p) {
  const breath = p.breath || 0;
  const tip = p.tip || 0;
  const hipY = -C.leg - tip;
  const shY = hipY - C.torso - breath * 0.6;
  const sway = p.sway || 0;
  const headX = sway + (p.tilt || 0) * 2.2 + (p.headX || 0);
  const headY = shY - C.neck - C.headRy + 1 + (p.headY || 0);
  const fx = C.girl ? 3.8 : 4.6;
  // Legs & shoes
  if (C.girl) {
    const kneeY = hipY + C.leg * 0.52;
    for (const s of [-1, 1]) {
      R.capsule(ox + s * fx * 0.8, kneeY, ox + s * fx, -3 - (s === 1 ? tip : 0), 2.3, 1.7, MAT.skin);
      R.ellipse(ox + s * (fx + 0.3), -1.5 - (s === 1 ? tip * 0.6 : 0), 2.4, 1.6, MAT.shoeW);
    }
  } else {
    for (const s of [-1, 1]) {
      const kx = ox + s * (fx - 0.2), ky = hipY + C.leg * 0.5;
      R.capsule(ox + s * 3.8 + sway * 0.3, hipY + 2, kx, ky, 3.9, 3.1, MAT.bottom);
      R.capsule(kx, ky, ox + s * fx, -3, 3.1, 2.4, MAT.bottom);
      R.ellipse(ox + s * (fx + 0.6), -1.6, 3.8, 2, MAT.shoe);
    }
  }
  // Torso / dress
  if (C.girl) {
    const waistY = shY + C.torso * 0.62;
    const hemY = -C.leg * 0.3 - tip;
    const fl = p.flutter || 0;
    const dress = [
      [ox - 7.2 + sway, shY + 2.5], [ox + 7.2 + sway, shY + 2.5],
      [ox + 5.6 + sway, waistY], [ox + 11.5 + fl, hemY - 1], [ox + 10 + fl * 0.5, hemY + 1], [ox + 3, hemY + 0.5 + fl * 0.3],
      [ox - 3, hemY + 1], [ox - 10 + fl * 0.5, hemY + 0.5], [ox - 11.5 + fl, hemY - 1.5], [ox - 5.6 + sway, waistY],
    ];
    R.poly(dress, MAT.dress);
    R.capsule(ox - 6.5 + sway, shY + 1.2, ox + 6.5 + sway, shY + 1.2, 1.8, 1.8, MAT.skin);
  } else {
    const hemY = hipY + 3;
    R.poly([
      [ox - 4 + sway * 0.5, shY - 1], [ox + 4 + sway * 0.5, shY - 1], [ox + C.sh - 2.5 + sway * 0.5, shY + 1.2], [ox + C.sh - 1.6, shY + 4.5], [ox + 8.6, shY + 9], [ox + 7.8, hemY - 6], [ox + 8.2, hemY], [ox - 8.2, hemY], [ox - 7.8, hemY - 6], [ox - 8.6, shY + 9], [ox - C.sh + 1.6, shY + 4.5], [ox - C.sh + 2.5 + sway * 0.5, shY + 1.2],
    ], MAT.top);
  }
  // Arms (IK towards hand targets, relative to ox)
  for (const s of [-1, 1]) {
    const sx = ox + s * (C.sh - (C.girl ? 1.5 : 3.2)) + sway * 0.5, sy = shY + (C.girl ? 2.5 : 3.5);
    const tgt = s < 0 ? p.lhand : p.rhand;
    const tx = tgt ? tgt[0] : sx + s * 2.2, ty = tgt ? tgt[1] : sy + C.ua + C.fa - 1.5;
    const [ex, ey, wx, wy] = ik(sx, sy, tx, ty, C.ua, C.fa, s > 0 ? 1 : -1);
    const r0 = C.girl ? 2.0 : 2.7, r1 = C.girl ? 1.6 : 2.2, r2 = C.girl ? 1.4 : 1.8;
    R.capsule(sx, sy, ex, ey, r0, r1, MAT.skin);
    R.capsule(ex, ey, wx, wy, r1, r2, MAT.skin);
    R.ellipse(wx + Math.sign(wx - ex) * 0.6, wy + 1.2, r2 + 0.5, r2 + 0.9, MAT.skin);
    // sleeves
    if (C.girl) R.ellipse(sx + s * 0.5, sy + 1.5, 3, 3.2, MAT.dress);
    else R.capsule(sx, sy, lerp(sx, ex, 0.42), lerp(sy, ey, 0.42), 3.1, 2.8, MAT.top);
  }
  // Neck & head
  R.capsule(ox + sway * 0.5, shY + 1, ox + headX, headY + 3, 2.4, 2.2, MAT.skin);
  R.ellipse(ox + headX, headY, C.headRx, C.headRy, MAT.hair, 0, (p.tilt || 0) * 0.25);
  R.ellipse(ox + headX - C.headRx + 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  R.ellipse(ox + headX + C.headRx - 0.2, headY + 1.2, 1.2, 1.8, MAT.skin);
  R.ellipse(ox + headX, headY - 0.4, C.headRx + 0.6, C.headRy - 0.2, MAT.hair, 0, (p.tilt || 0) * 0.25);
  if (C.girl) {
    const hs = p.hairSway || 0;
    const top = headY - 2;
    R.poly([
      [ox + headX - 5, top], [ox + headX + 5, top], [ox + headX + 6 + hs * 0.2, shY + 1], [ox + headX + 5.2 + hs * 0.6, shY + 9], [ox + headX + 4.2 + hs, shY + 14],
      [ox + headX + 1.5 + hs, shY + 16], [ox + headX - 1 + hs, shY + 15], [ox + headX - 3.8 + hs, shY + 16.5], [ox + headX - 5.4 + hs * 0.6, shY + 10], [ox + headX - 6 + hs * 0.2, shY + 1],
    ], MAT.hair);
    // a bow high on her head, so it shows in the outline
    const bx = ox + headX + 2.8, by = headY - C.headRy + 0.6;
    R.ellipse(bx - 2, by - 0.8, 1.9, 1.3, MAT.bow, 0, -0.5);
    R.ellipse(bx + 2, by - 0.8, 1.9, 1.3, MAT.bow, 0, 0.5);
  }
}

// Side view facing +1 (right) or -1 (left). p: { walk, lean, hands: [[x,y],[x,y]] | null, tip, headTilt }
function drawSide(R, C, ox, f, p) {
  const ph = p.walk || 0;
  const tip = p.tip || 0;
  const legPose = (psi) => {
    const hipA = 0.42 * Math.sin(psi);
    const knee = 0.08 + 0.62 * Math.max(0, Math.sin(psi + 1.3));
    return [hipA, knee];
  };
  const moving = p.moving ?? 0;
  const L1 = C.leg * 0.52, L2 = C.leg * 0.5;
  const legs = [ph, ph + Math.PI].map((psi) => {
    let [a, k] = legPose(psi);
    a *= moving; k = lerp(0.06, k, moving);
    const kx = Math.sin(a) * L1, ky = Math.cos(a) * L1;
    const ax = kx + Math.sin(a - k) * L2, ay = ky + Math.cos(a - k) * L2;
    return { kx, ky, ax, ay };
  });
  const drop = Math.max(legs[0].ay, legs[1].ay);
  const hipY = -drop - tip;
  const lean = (p.lean || 0) + 0.05 * moving;
  const shX = lean * C.torso, shY = hipY - C.torso;
  const headX = shX + (p.headX || 0) + 1, headY = shY - C.neck - C.headRy + 1 + (p.headY || 0);
  const X = (x) => ox + x * f;
  const drawLeg = (L, sh) => {
    const hx = X(0), hy = hipY;
    const kx = X(L.kx), ky = hipY + L.ky, ax = X(L.ax), ay = hipY + L.ay;
    if (C.girl) {
      R.capsule(kx, ky, ax, ay, 2.2, 1.7, MAT.skin, sh);
      R.ellipse(ax + f * 1.6, ay + 1.1, 3.1, 1.8, MAT.shoeW, sh);
    } else {
      R.capsule(hx, hy, kx, ky, 3.8, 3.1, MAT.bottom, sh);
      R.capsule(kx, ky, ax, ay, 3.1, 2.4, MAT.bottom, sh);
      R.ellipse(ax + f * 2, ay + 1.1, 3.8, 2, MAT.shoe, sh);
    }
  };
  const armFor = (i, sh) => {
    const sx = X(shX - 0.5), sy = shY + 2.5;
    const hand = p.hands ? p.hands[i] : null;
    let tx, ty;
    if (hand) { tx = hand[0]; ty = hand[1]; }
    else {
      const sw = 0.42 * Math.sin(ph + (i ? 0 : Math.PI)) * moving;
      const reach = C.ua + C.fa - 3.5 - Math.max(0, sw) * 3;
      tx = sx + Math.sin(sw) * reach * f; ty = sy + Math.cos(sw) * reach;
    }
    const [ex, ey, wx, wy] = ik(sx, sy, tx, ty, C.ua, C.fa, f > 0 ? 1 : -1);
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
    const fl = p.flutter || 0;
    R.poly([
      [X(shX - 4), shY + 2.5], [X(shX + 4.6), shY + 3], [X(shX * 0.5 + 4.2), waistY], [X(Math.max(k1 + 4, 7) + fl), hemY],
      [X(0), hemY + 1.2], [X(Math.min(k0 - 4, -7) - 1.5 + fl), hemY - 0.5], [X(shX * 0.5 - 3.8), waistY],
    ], MAT.dress);
  } else {
    R.poly([
      [X(shX - 5), shY], [X(shX + 5.5), shY + 1], [X(shX * 0.5 + 5.2), hipY - 4], [X(5), hipY + 3], [X(-4.8), hipY + 3], [X(shX * 0.5 - 4.8), hipY - 6],
    ], MAT.top);
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
    const hs = (p.hairSway || 0) - 1.5 * moving;
    R.poly([
      [X(headX - 1), headY - C.headRy + 0.5], [X(headX + 3.5), headY - 3], [X(headX - 1.5), headY + 3], [X(shX - 1.5), shY + 6],
      [X(shX - 4 + hs), shY + 14], [X(shX - 7 + hs), shY + 13], [X(shX - 7.5 + hs * 0.6), shY + 2], [X(headX - 5.8), headY - 1],
    ], MAT.hair);
  } else {
    R.ellipse(X(headX - 2.2), headY - 0.2, 3.2, 4.4, MAT.hair);
  }
  if (C.girl) {
    // her bow, from the side
    const bx = X(headX - 2.4), by = headY - C.headRy + 0.4;
    R.ellipse(bx, by - 0.9, 1.7, 1.3, MAT.bow, 0, 0.5 * f);
    R.ellipse(bx - f * 2.4, by + 0.2, 1.6, 1.2, MAT.bow, 0, -0.4 * f);
  }
  armFor(0, 0);
}

// ---------------------------------------------------------------- couple --
export class Couple {
  constructor() {
    this.W = 150; this.H = 124;
    this.R = new Raster(this.W, this.H, 75, 116);
    this.buf = new Buf(this.W, this.H);
    this.canvas = makeCanvas(this.W, this.H);
    this.img = new ImageData(this.buf.d, this.W, this.H);
    // state
    this.mode = 'walk'; // walk | back | face | hug
    this.t = 0;
    this.walk = 0;
    this.moving = 0;
    this.hold = 0; // back view hand-holding 0..1
    this.lean = 0; // girl leaning head on his shoulder
    this.hands = 0; // face view: holding both hands
    this.hug = 0;
    this.flip = 1; // horizontal squash during turns
    this.walkHold = 0; // hold hands while walking
    this.gap = 17;
  }

  update(dt) {
    this.t += dt;
  }

  render() {
    const R = this.R;
    R.clear();
    const t = this.t;
    const breath = (Math.sin(t * 1.6) + 1) * 0.5;
    const gh = this.gap / 2;
    if (this.mode === 'walk') {
      const flut = Math.sin(this.walk * 2) * 1.2 * this.moving;
      // walking hand in hand: his near hand and her far hand meet between them
      let gH = null, qH = null;
      if (this.walkHold > 0.5) {
        const mx = Math.sin(this.walk) * 1.4 * this.moving, my = -GUY.leg + 3 + Math.abs(Math.cos(this.walk)) * 0.8;
        gH = [[mx - 0.5, my], null];
        qH = [null, [mx + 0.5, my + 0.5]];
      }
      drawSide(R, GUY, -gh, 1, { walk: this.walk + 0.4, moving: this.moving, hands: gH });
      drawSide(R, GIRL, gh, 1, { walk: this.walk, moving: this.moving, hands: qH, flutter: flut, hairSway: Math.sin(t * 2) * 0.6 - this.moving * 0.8 });
    } else if (this.mode === 'back') {
      const h = this.hold, ln = this.lean;
      const meetX = 0, meetY = -GIRL.leg - 1 + (1 - h) * 3;
      const gx = -gh, qx = gh;
      const guyR = h > 0 ? [lerp(gx + GUY.sh + 1, meetX - 1.5, h), lerp(-GUY.leg + 11, meetY, h)] : null;
      const girlL = h > 0 ? [lerp(qx - GIRL.sh - 1, meetX + 1.5, h), lerp(-GIRL.leg + 9, meetY + 1, h)] : null;
      drawBack(R, GUY, gx, { breath, tilt: 0.35 * ln, rhand: guyR, headX: ln * 1.2, sway: ln * 0.6 });
      drawBack(R, GIRL, qx, {
        breath: (Math.sin(t * 1.6 + 0.8) + 1) * 0.5, tilt: -1.4 * ln, lhand: girlL, headX: -ln * 3.2, headY: ln * 1.6, sway: -ln * 1.2,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.5,
      });
    } else if (this.mode === 'face' || this.mode === 'hug') {
      // facing each other holding hands; k -> 1 leans in to a forehead kiss on tiptoe
      const k = this.hug;
      const g = 10;
      const handY = lerp(-GUY.leg + 1, -GUY.leg - 11, k);
      const hA = [[-1.2, handY - 1], [-0.6, handY + 1.2]];
      const hB = [[1.2, handY], [0.6, handY + 1.6]];
      drawSide(R, GUY, -g, 1, { hands: hA, lean: 0.13 * k, headX: 0.6 * k, headY: 1.2 * k, headTilt: 0.2 * k });
      drawSide(R, GIRL, g, -1, {
        hands: hB, tip: 3 * k, lean: 0.11 * k, headTilt: -0.3 * k, headX: 0.8 * k, headY: -0.5 * k,
        hairSway: Math.sin(t * 0.9) * 0.8, flutter: Math.sin(t * 1.3) * 0.6,
      });
    }
    this.shade();
    return this.canvas;
  }

  // A backlit silhouette: solid shadow, with the tank's glow catching the top
  // and sides of the outline and fading a pixel or two in.
  shade() {
    const { W, H } = this;
    const m = this.R.m, s = this.R.s, d = this.buf.d;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
    d.fill(0);
    for (let y = 0; y < H; y++) {
      // light spills down from the tank, so edges glow less near the floor
      const fall = 1 - clamp((y / H - 0.5) * 2.2) * 0.8;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!m[i]) continue;
        let c = s[i] < 0 ? FAR : BODY;
        let rim = 0;
        if (!at(x, y - 1)) rim = 1;
        else if (!at(x - 1, y) || !at(x + 1, y)) rim = 0.62;
        else if (!at(x, y - 2)) rim = 0.3;
        else if (!at(x - 2, y) || !at(x + 2, y)) rim = 0.14;
        rim *= fall;
        if (rim >= 0.5) c = mixRGB(c, GLOW, rim * 0.55);
        else if (rim > 0) c = mixRGB(c, HAZE, rim * 1.6);
        const o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    this.canvas.ctx.putImageData(this.img, 0, 0);
  }
}
