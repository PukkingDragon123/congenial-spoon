// Creature entities and behaviours: cruise, hover, boids schools, formations.
import { TAU, clamp, lerp, R } from '../util.js';
import { glowSprite } from './fx.js';
import { SPECIES, fishSprite, PITCHES } from '../art/fish.js';
import { renderRay, RAY_FRAMES, renderTurtle, TURTLE_FRAMES, renderJelly, JELLY_FRAMES, renderCrab, CRAB_FRAMES } from '../art/creatures.js';

export const DEPTH_PX = 120; // how many "pixels" of distance one unit of z represents for steering

// Which way each sprite is drawn: -1 = nose points left (the default), +1 =
// nose points right. Used to decide whether a draw gets mirrored.
const SPRITE_DIR = { ray: 1 };

export function sizeAt(len, z) {
  const L = len * (1 - 0.42 * z);
  if (L > 60) return Math.max(6, Math.round(L / 4) * 4);
  if (L > 28) return Math.round(L / 2) * 2;
  return Math.max(5, Math.round(L));
}

export class Creature {
  constructor(kind, o = {}) {
    this.kind = kind;
    this.x = o.x ?? 0; this.y = o.y ?? 150; this.z = o.z ?? 0.5;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0; this.vz = 0;
    this.len = o.len ?? 30;
    this.speed = o.speed ?? 20;
    this.mode = o.mode ?? 'cruise';
    this.dir = o.dir ?? (this.vx < 0 ? -1 : 1);
    if (!this.vx) this.vx = this.dir * this.speed;
    this.face = this.dir;
    this.turnRate = o.turnRate ?? 3;
    this.phase = R() * 100;
    this.anim = o.anim ?? 7;
    this.flash = 0;
    this.pa = 0;
    this.seed = R() * 1000;
    this.home = o.home ?? [this.x, this.y, this.z];
    this.homeR = o.homeR ?? 40;
    this.tgt = null;
    this.wait = 0;
    this.form = null; // () => [x,y,z]
    this.formFace = 0;
    this.formK = 0;
    this.maxSpeed = o.maxSpeed ?? this.speed * 2.2;
    this.glint = o.glint ?? false;
    this.frames = kind === 'ray' ? RAY_FRAMES : kind === 'turtle' ? TURTLE_FRAMES : kind === 'jelly' ? JELLY_FRAMES : SPECIES[kind].frames;
    this.alpha = 1;
    this.ax = 0; this.ay = 0; this.az = 0;
    this.bounds = o.bounds ?? null;
    this.glowA = 0;
    // liveliness: idle bob, beat squash-stretch and startle darts
    this.bob = R() * TAU;
    this.bobF = 1.6 + R() * 1.8;
    this.live = 0.55 + R() * 0.9;      // how strongly this one answers the music
    this.bnc = 0;
    this.startle = 0;
  }

  // A quick pop + dart away from (x,y): used when something happens nearby.
  react(x, y, power = 1) {
    const dx = this.x - x, dy = this.y - y;
    const d = Math.hypot(dx, dy) || 1;
    this.startle = Math.min(1.4, this.startle + power);
    this.bnc = Math.min(1.2, this.bnc + power * 0.7);
    if (!this.form) {
      this.vx += (dx / d) * 34 * power;
      this.vy += (dy / d) * 24 * power;
    }
  }

  update(dt, aq) {
    const t = aq.t;
    let dvx = 0, dvy = 0, dvz = 0;
    const [xmin, xmax] = aq.xRange(this.z, this.bounds);
    const ymin = aq.yTop + 6, ymax = aq.floorY(this.z) - 6 - this.len * 0.12;
    if (this.form) {
      const [tx, ty, tz] = this.form(t);
      const dx = tx - this.x, dy = ty - this.y, dz = (tz - this.z) * DEPTH_PX;
      const d = Math.hypot(dx, dy, dz);
      const k = this.formK;
      const sp = Math.min(this.maxSpeed * 1.6, d * 2.4) * k;
      const inv = d > 0.001 ? 1 / d : 0;
      const wantX = dx * inv * sp, wantY = dy * inv * sp, wantZ = dz * inv * sp / DEPTH_PX;
      const blend = Math.min(1, dt * (2 + 5 * k));
      this.vx += (wantX - this.vx) * blend;
      this.vy += (wantY - this.vy) * blend;
      this.vz += (wantZ - this.vz) * blend;
      if (this.formFace && d < 8) this.faceOverride = this.formFace; else this.faceOverride = 0;
      // gentle drift while free-er
      if (k < 1) this.vx += Math.sin(t * 0.7 + this.seed) * 4 * (1 - k) * dt;
    } else if (this.mode === 'cruise') {
      // swim across, meander vertically, turn at the ends
      if (this.x > xmax && this.dir > 0) this.dir = -1;
      if (this.x < xmin && this.dir < 0) this.dir = 1;
      const want = this.dir * this.speed;
      dvx = (want - this.vx) * 0.6;
      const wy = Math.sin(t * 0.23 + this.seed) * 0.5 + Math.sin(t * 0.61 + this.seed * 2) * 0.3;
      let targetY = lerp(ymin + 10, ymax - 10, 0.5 + 0.5 * wy);
      if (this.cruiseY) targetY = lerp(this.cruiseY[0], this.cruiseY[1], 0.5 + 0.5 * wy);
      dvy = ((targetY - this.y) * 0.15 - this.vy) * 0.8;
      dvz = (Math.sin(t * 0.13 + this.seed) * 0.02 - this.vz) * 0.5;
    } else if (this.mode === 'hover') {
      if (!this.tgt || this.wait < 0) {
        const a = R() * TAU, r = R() * this.homeR;
        this.tgt = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r * 0.5, clamp(this.home[2] + (R() - 0.5) * 0.08, 0.02, 0.98)];
        this.wait = 2 + R() * 4;
      }
      this.wait -= dt;
      const dx = this.tgt[0] - this.x, dy = this.tgt[1] - this.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(this.speed, d * 0.8);
      dvx = ((dx / (d || 1)) * sp - this.vx) * 1.2;
      dvy = ((dy / (d || 1)) * sp - this.vy) * 1.2;
      dvz = ((this.tgt[2] - this.z) * 0.3 - this.vz) * 0.8;
    } else if (this.mode === 'school') {
      dvx = this.ax; dvy = this.ay; dvz = this.az;
    } else if (this.mode === 'rise') {
      dvy = (-this.speed - this.vy) * 0.8;
      dvx = (Math.sin(t * 0.5 + this.seed) * 4 - this.vx) * 0.5;
    }
    if (!this.form) {
      this.vx += dvx * dt; this.vy += dvy * dt; this.vz += dvz * dt;
      // soft bounds
      if (this.mode !== 'rise') {
        if (this.y < ymin) this.vy += (ymin - this.y) * 2 * dt;
        if (this.y > ymax) this.vy -= (this.y - ymax) * 2 * dt;
      }
      if (this.z < 0.02) this.vz += 0.4 * dt;
      if (this.z > 0.98) this.vz -= 0.4 * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > this.maxSpeed) { this.vx *= this.maxSpeed / sp; this.vy *= this.maxSpeed / sp; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt; this.z = clamp(this.z + this.vz * dt, 0, 1);
    if (this.fixedZ != null) { this.z = this.fixedZ; this.vz = 0; }
    // facing & turning
    if (this.vx > 1.2) this.dir = 1; else if (this.vx < -1.2) this.dir = -1;
    const wantFace = this.faceOverride || this.dir;
    this.face += clamp(wantFace - this.face, -this.turnRate * dt, this.turnRate * dt);
    // pitch
    const ang = Math.atan2(this.vy, Math.abs(this.vx) + 3);
    this.pa += (clamp(ang, -0.5, 0.5) - this.pa) * Math.min(1, dt * 4);
    // animation — tail beats faster when swimming hard or when the music hits
    const sp = Math.hypot(this.vx, this.vy);
    const drive = 1 + (aq.pulse || 0) * 0.5 * this.live + this.startle * 0.8;
    this.phase += dt * (this.anim * 0.5 + sp * this.anim * 0.03) * drive;
    // liveliness
    this.bob += dt * this.bobF;
    this.startle = Math.max(0, this.startle - dt * 1.8);
    const want = (aq.pulse || 0) * this.live * 0.5 + this.startle * 0.5;
    this.bnc += (want - this.bnc) * Math.min(1, dt * 9);
    if (this.glint) {
      this.flash = Math.max(0, this.flash - dt * 4);
      if (R() < dt * (Math.abs(this.face) < 0.8 ? 0.35 : 0.018)) this.flash = 1;
    }
  }

  draw(ctx, aq) {
    const [sx, sy] = aq.toScreen(this.x, this.y, this.z);
    if (sx < -160 || sx > aq.W + 160 || sy < -120 || sy > aq.H + 120) return;
    const frame = Math.floor(this.phase) % this.frames;
    let img;
    if (this.kind === 'ray') img = renderRay(sizeAt(this.len, this.z), frame);
    else if (this.kind === 'turtle') img = renderTurtle(sizeAt(this.len, this.z), frame);
    else if (this.kind === 'jelly') img = renderJelly(this.len, frame, this.hue || 'pink');
    else {
      // Sprites are drawn nose-left, so a descending fish needs the opposite
      // pitch index to end up nose-down once it is mirrored below.
      const pi = SPECIES[this.kind].noPitch ? 2 : clamp(Math.round(-this.pa / 0.25) + 2, 0, PITCHES.length - 1);
      img = fishSprite(this.kind, sizeAt(this.len, this.z), frame, pi, this.flash > 0.5 ? 1 : 0);
    }
    // face is +1 swimming right. Most sprites are drawn nose-left so they get
    // mirrored; the ray is drawn nose-right, and the jelly has no facing.
    let f = this.kind === 'jelly' ? 1 : this.face * (SPRITE_DIR[this.kind] || -1);
    if (this.kind !== 'jelly' && Math.abs(f) < 0.18) f = 0.18 * Math.sign(f || 1);
    const lift = Math.sin(this.bob) * (0.5 + this.len * 0.012) + (aq.waveAt ? aq.waveAt(this.x, this.z) : 0);
    const X = Math.round(sx), Y = Math.round(sy + lift);
    if (this.glowA > 0.01) {
      const g = glowSprite(7, '#9fe8ff');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.glowA * 0.55;
      ctx.drawImage(g, X - 7, Y - 7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    const e = this.bnc * 0.3;
    const sxs = 1 + e, sys = 1 - e * 0.75;
    if (f === 1 && e < 0.01) ctx.drawImage(img, X - img.ox, Y - img.oy);
    else {
      ctx.setTransform(f * sxs, 0, 0, sys, X, Y);
      ctx.drawImage(img, -img.ox, -img.oy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.alpha < 1) ctx.globalAlpha = 1;
  }
}

// Boids school with a uniform grid for neighbour search.
export class School {
  constructor(members, o = {}) {
    this.m = members;
    for (const f of members) { f.mode = 'school'; f.school = this; }
    this.radius = o.radius ?? 28;
    this.sep = o.sep ?? 10;
    this.speed = o.speed ?? 26;
    this.ws = o.ws ?? 1.6; this.wa = o.wa ?? 0.9; this.wc = o.wc ?? 0.5; this.wt = o.wt ?? 0.35;
    this.path = o.path ?? ((t) => [1200 + Math.sin(t * 0.11) * 380, 160 + Math.sin(t * 0.23) * 50, 0.4 + Math.sin(t * 0.07) * 0.15]);
    this.target = this.path(0);
    this.t = R() * 100;
    this.active = true;
    this.grid = new Map();
  }
  update(dt, aq) {
    this.t += dt;
    this.target = this.path(this.t);
    const cell = this.radius;
    const g = this.grid;
    g.clear();
    const act = this.m.filter((f) => f.mode === 'school' && !f.form);
    for (const f of act) {
      const k = ((f.x / cell) | 0) * 7919 + ((f.y / cell) | 0);
      let a = g.get(k);
      if (!a) { a = []; g.set(k, a); }
      a.push(f);
    }
    const r2 = this.radius * this.radius, s2 = this.sep * this.sep;
    const [tx, ty, tz] = this.target;
    for (const f of act) {
      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, cx = 0, cy = 0, cz = 0, n = 0;
      const gx = (f.x / cell) | 0, gy = (f.y / cell) | 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = g.get((gx + i) * 7919 + gy + j);
        if (!a) continue;
        for (const o of a) {
          if (o === f) continue;
          const dx = o.x - f.x, dy = o.y - f.y, dz = (o.z - f.z) * DEPTH_PX;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          n++;
          ax += o.vx; ay += o.vy; cx += dx; cy += dy; cz += dz;
          if (d2 < s2) { const k = 1 / (d2 + 1); sx -= dx * k; sy -= dy * k; sz -= dz * k; }
        }
      }
      let fx = 0, fy = 0, fz = 0;
      if (n) {
        fx += sx * this.ws * 60 + (ax / n - f.vx) * this.wa + (cx / n) * this.wc;
        fy += sy * this.ws * 60 + (ay / n - f.vy) * this.wa + (cy / n) * this.wc;
        fz += (sz * this.ws * 60 + (cz / n) * this.wc) / DEPTH_PX;
      }
      const dx = tx - f.x + Math.sin(f.seed) * 30, dy = ty - f.y + Math.cos(f.seed) * 16, dz = tz - f.z;
      const d = Math.hypot(dx, dy) || 1;
      fx += (dx / d) * this.speed * this.wt * Math.min(1, d / 60) * 2;
      fy += (dy / d) * this.speed * this.wt * Math.min(1, d / 60) * 2;
      fz += dz * 0.4;
      // keep cruising speed
      const sp = Math.hypot(f.vx, f.vy) || 1;
      fx += (f.vx / sp) * (this.speed - sp) * 0.8;
      fy += (f.vy / sp) * (this.speed - sp) * 0.8 - f.vy * 0.3;
      f.ax = fx; f.ay = fy; f.az = fz - f.vz * 0.5;
    }
  }
}

// Crabs potter about on the sand: scuttle sideways, stop, wave their claws on
// the beat, bolt when startled, and can be sent to a spot (x, z) on the floor.
export class Crab {
  constructor(o = {}) {
    this.kind = 'crab';
    this.x = o.x ?? 0; this.z = o.z ?? 0.3; this.y = 0;
    this.size = o.size ?? 16;
    this.dir = R() < 0.5 ? -1 : 1;
    this.v = 0;
    this.state = 'idle';
    this.timer = R() * 2;
    this.phase = R() * 8;
    this.claw = 0;
    this.wave = 0;
    this.form = null;   // [x, z] target on the sand
    this.startle = 0;
    this.bnc = 0;
    this.bounds = o.bounds ?? null;
    this.hop = 0;
  }
  react(x, y, power = 1) {
    this.startle = Math.min(1.5, this.startle + power);
    this.bnc = Math.min(1, this.bnc + power);
    this.hop = Math.max(this.hop, power);
    if (!this.form) { this.dir = this.x > x ? 1 : -1; this.state = 'run'; this.timer = 0.6 + power; }
  }
  update(dt, aq) {
    this.y = aq.floorY(this.z) - 1;
    this.startle = Math.max(0, this.startle - dt);
    this.hop = Math.max(0, this.hop - dt * 3);
    const [xmin, xmax] = aq.xRange(this.z, this.bounds);
    let want = 0;
    if (this.form) {
      const dx = this.form[0] - this.x, dz = this.form[1] - this.z;
      const d = Math.hypot(dx, dz * 300);
      if (d > 1.5) {
        want = Math.sign(dx) * Math.min(30, Math.abs(dx) * 2 + 6);
        this.z += clamp(dz, -dt * 0.25, dt * 0.25);
        this.wave = 0;
      } else {
        this.x += dx * Math.min(1, dt * 4);
        this.wave = 1;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        const r = R();
        if (this.state === 'run' || r < 0.4) { this.state = 'idle'; this.timer = 1 + R() * 2.5; }
        else if (r < 0.85) { this.state = 'walk'; this.timer = 1.5 + R() * 2.5; if (R() < 0.5) this.dir *= -1; }
        else { this.state = 'wave'; this.timer = 1.5 + R(); }
      }
      if (this.x < xmin + 20) this.dir = 1;
      if (this.x > xmax - 20) this.dir = -1;
      if (this.state === 'walk') want = this.dir * 12;
      if (this.state === 'run') want = this.dir * 46;
      this.wave = this.state === 'wave' ? 1 : 0;
    }
    this.v += (want - this.v) * Math.min(1, dt * 8);
    this.x += this.v * dt;
    this.phase += dt * Math.abs(this.v) * 0.7;
    // claws: up and waving on the music when happy, otherwise resting
    const beat = aq.pulse || 0;
    this.claw = this.wave ? (beat > 0.45 ? 2 : 1) : this.startle > 0.5 ? 2 : 0;
    const wantB = this.wave ? beat * 0.8 : 0;
    this.bnc += (wantB - this.bnc) * Math.min(1, dt * 10);
  }
  draw(ctx, aq) {
    const [sx, sy] = aq.toScreen(this.x, this.y, this.z);
    if (sx < -40 || sx > aq.W + 40) return;
    const S = Math.max(8, Math.round((this.size * (1 - 0.4 * this.z)) / 2) * 2);
    const img = renderCrab(S, Math.floor(this.phase) % CRAB_FRAMES, this.claw);
    const e = this.bnc * 0.22;
    const hop = Math.sin(this.hop * Math.PI) * 5;
    const X = Math.round(sx), Y = Math.round(sy - hop + (aq.waveAt ? aq.waveAt(this.x, this.z) * 0.4 : 0));
    ctx.setTransform(1 - e * 0.6, 0, 0, 1 + e, X, Y);
    ctx.drawImage(img, -img.ox, -img.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
