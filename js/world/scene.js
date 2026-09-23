// The Siam-aquarium panorama: parallax tank layers, creatures, light, glass,
// the viewing hall, and the couple standing in front of the glow.
import { TAU, clamp, lerp, smoothstep, R, rng, makeCanvas, ramp, bayer, Buf, heartPoint, hex } from '../util.js';
import { genFormation, genStatue, genPillar, genSand, genCaustics, genKelp, KELP_FRAMES, genFarRidge, genFrame, genCeilTile, frameCurves, CX } from '../art/env.js';
import { warmLevel, queueVariants, SPECIES } from '../art/fish.js';
import { queueWarm } from '../art/budget.js';
import { renderJelly, JELLY_FRAMES } from '../art/creatures.js';
import { renderRay, RAY_FRAMES, renderTurtle, TURTLE_FRAMES } from '../art/creatures.js';
import { Creature, School, sizeAt } from './creatures.js';
import { Particles, bubbleSprite, glowSprite } from './fx.js';
import { Couple } from '../art/people.js';

export { CX };
export const CY = 200;
const FLOOR_NEAR = 294, FLOOR_FAR = 248;
const FOG = [
  { z: 0.74, a: 0.36 },
  { z: 0.42, a: 0.2 },
  { z: 0.14, a: 0.07 },
];

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export class Aquarium {
  constructor() {
    this.t = 0;
    this.cam = { x: CX, y: CY, sx: 0, sy: 0 };
    this.creatures = [];
    this.props = [];
    this.kelp = [];
    this.columns = [];
    this.rays = [];
    this.yTop = 58;
    this.bubbles = new Particles();
    this.snow = [];
    this.fx = new Particles(); // world-space sparkles/hearts (projected)
    this.glows = []; // additive world glows {x,y,z,r,col,a}
    this.extras = []; // story objects living in the tank (e.g. the bottle)
    this.couple = new Couple();
    this.coupleX = CX - 260;
    this.coupleY = 352;
    this.heartLight = 0;
    this.light = 1;
  }

  floorY(z) { return lerp(FLOOR_NEAR, FLOOR_FAR, z); }
  par(z) { return 1 - 0.5 * z; }
  toScreen(x, y, z) {
    const p = 1 - 0.5 * z;
    return [this.W / 2 + (x - CX) - (this.cam.x - CX) * p, this.H / 2 + (y - CY) - (this.cam.y - CY) * p];
  }
  fromScreen(sx, sy, z) {
    const p = 1 - 0.5 * z;
    return [sx - this.W / 2 + CX + (this.cam.x - CX) * p, sy - this.H / 2 + CY + (this.cam.y - CY) * p];
  }
  xRange(z, b) {
    if (b) return b;
    const hw = 380 + 700 * (1 - 0.5 * z);
    return [CX - hw, CX + hw];
  }

  // ------------------------------------------------------------- build --
  async build(progress = () => {}) {
    const steps = [];
    const step = (w, fn) => steps.push([w, fn]);
    const r = rng(20240214);

    step(1, () => { this.ceilTile = genCeilTile(); });
    step(1, () => { this.sand = genSand(640, 48, 3); this.caustics = genCaustics(); });
    step(1, () => { this.farRidge = genFarRidge(2200, 120, 5); this.farRidge2 = genFarRidge(2000, 90, 9); });
    step(1, () => { this.statue = genStatue(); });
    const F = (o) => step(1, () => {
      const c = genFormation(o);
      this.props.push({ img: c, light: c.light, x: o.x, z: o.z, y: this.floorY(o.z) + (o.sink ?? 6) - c.height, caus: o.caus ?? 0.3 });
    });
    // far band
    F({ x: CX - 940, z: 0.9, w: 380, h: 120, seed: 11, profile: (x) => 0.95 - 0.6 * x + 0.1 * Math.sin(x * 9), size: [10, 26], decor: 0.3, caus: 0.15 });
    F({ x: CX - 560, z: 0.92, w: 300, h: 80, seed: 12, profile: (x) => 0.35 + 0.6 * Math.sin(x * Math.PI), size: [10, 22], decor: 0.3, caus: 0.15 });
    F({ x: CX + 170, z: 0.9, w: 330, h: 96, seed: 13, profile: (x) => 0.3 + 0.7 * Math.sin(x * Math.PI) ** 0.7, size: [10, 24], decor: 0.3, caus: 0.15 });
    F({ x: CX + 520, z: 0.9, w: 420, h: 140, seed: 14, profile: (x) => 0.35 + 0.6 * x + 0.08 * Math.sin(x * 11), size: [10, 26], decor: 0.3, caus: 0.15 });
    step(1, () => {
      for (const [x, z, h, s] of [[CX - 250, 0.8, 170, 3], [CX + 350, 0.82, 150, 6], [CX - 640, 0.8, 110, 8], [CX + 740, 0.8, 128, 9]]) {
        const img = genPillar(s, h);
        this.props.push({ img, x: x - img.width / 2, z, y: this.floorY(z) + 4 - img.height, caus: 0 });
      }
    });
    // mid-far flanks
    F({ x: CX - 1180, z: 0.62, w: 340, h: 190, seed: 21, profile: (x) => 0.95 - 0.55 * x ** 1.3, size: [14, 34], caus: 0.18, taper: [0, 0.14] });
    F({ x: CX + 840, z: 0.62, w: 340, h: 180, seed: 22, profile: (x) => 0.4 + 0.55 * x ** 0.9, size: [14, 34], caus: 0.18, taper: [0.14, 0] });
    // statue
    step(1, () => {
      const z = 0.64, sink = 26;
      const crop = (c) => { const o = makeCanvas(c.width, c.height - sink); o.ctx.drawImage(c, 0, 0); return o; };
      const img = crop(this.statue);
      img.light = crop(this.statue.light);
      this.props.push({ img, light: img.light, x: CX + 34 - img.width / 2, z, y: this.floorY(z) - img.height, caus: 0.22, statue: true });
    });
    // mid massifs framing the view (like the reference)
    F({ x: CX - 540, z: 0.46, w: 380, h: 262, seed: 31, profile: (x) => 0.97 - Math.abs(x - 0.42) ** 1.8 * 1.6 + 0.04 * Math.sin(x * 17), size: [16, 48], caus: 0.2, taper: [0.14, 0.12] });
    F({ x: CX + 150, z: 0.46, w: 400, h: 266, seed: 32, profile: (x) => 0.97 - Math.abs(x - 0.6) ** 1.8 * 1.5 + 0.04 * Math.sin(x * 15 + 1), size: [16, 48], caus: 0.2, taper: [0.12, 0.14] });
    F({ x: CX - 880, z: 0.5, w: 250, h: 150, seed: 33, profile: (x) => 0.9 - Math.abs(x - 0.5) * 1.2, size: [14, 34], caus: 0.2 });
    F({ x: CX + 610, z: 0.5, w: 260, h: 160, seed: 34, profile: (x) => 0.9 - Math.abs(x - 0.5) * 1.1, size: [14, 34], caus: 0.2 });
    // low mounds hiding the statue's neck
    F({ x: CX - 150, z: 0.56, w: 150, h: 44, seed: 41, profile: (x) => 0.2 + 0.75 * Math.sin(x * Math.PI) ** 0.6, size: [10, 20], caus: 0.25, sink: 4 });
    F({ x: CX + 90, z: 0.56, w: 160, h: 40, seed: 42, profile: (x) => 0.2 + 0.7 * Math.sin(x * Math.PI) ** 0.6, size: [10, 20], caus: 0.25, sink: 4 });
    F({ x: CX - 36, z: 0.6, w: 150, h: 34, seed: 43, profile: (x) => 0.35 + 0.65 * Math.sin(x * Math.PI) ** 0.5, size: [8, 16], caus: 0.25, sink: 3 });
    // near foreground
    F({ x: CX - 1200, z: 0.1, w: 470, h: 216, seed: 51, profile: (x) => 0.98 - 0.7 * x ** 1.6, size: [18, 50], caus: 0.2, taper: [0, 0.16] });
    F({ x: CX + 730, z: 0.1, w: 470, h: 226, seed: 52, profile: (x) => 0.3 + 0.68 * x ** 1.2, size: [18, 50], caus: 0.2, taper: [0.16, 0] });
    F({ x: CX - 470, z: 0.16, w: 170, h: 52, seed: 53, profile: (x) => 0.3 + 0.7 * Math.sin(x * Math.PI), size: [12, 26], caus: 0.3, sink: 10 });
    F({ x: CX + 400, z: 0.16, w: 190, h: 62, seed: 54, profile: (x) => 0.25 + 0.75 * Math.sin(x * Math.PI) ** 0.8, size: [12, 26], caus: 0.3, sink: 10 });
    // kelp
    step(1, () => {
      const K = [[CX - 196, 0.5, 118], [CX - 172, 0.55, 94], [CX - 150, 0.48, 72], [CX - 575, 0.4, 126], [CX - 540, 0.43, 98], [CX + 176, 0.5, 104], [CX + 204, 0.47, 82],
        [CX + 630, 0.4, 136], [CX + 668, 0.43, 104], [CX - 110, 0.6, 82], [CX + 150, 0.62, 92], [CX - 900, 0.3, 128], [CX + 915, 0.3, 116], [CX - 64, 0.7, 60], [CX + 120, 0.72, 72],
        [CX - 700, 0.22, 90], [CX + 520, 0.24, 84], [CX - 640, 0.34, 140], [CX - 610, 0.38, 118], [CX - 668, 0.42, 104], [CX - 740, 0.36, 132], [CX - 772, 0.44, 96],
        [CX + 560, 0.36, 128], [CX + 590, 0.4, 110], [CX + 700, 0.34, 124]];
      K.forEach(([x, z, h], i) => this.kelp.push({ frames: genKelp(h, 100 + i), x, z, off: r() * KELP_FRAMES, speed: 7 + r() * 5 }));
    });
    // creatures
    step(2, () => this.spawnCreatures(r));
    step(3, () => {
      // Render what the opening needs now; queue every other variant for
      // time-sliced background rendering (nearest-size fallback meanwhile).
      const now = new Map(), later = new Map();
      for (const c of this.creatures) {
        if (!SPECIES[c.kind]) continue;
        if (!now.has(c.kind)) { now.set(c.kind, new Set()); later.set(c.kind, new Set()); }
        now.get(c.kind).add(sizeAt(c.len, c.z));
        for (let z = Math.max(0, c.z - 0.25); z <= Math.min(1, c.z + 0.25); z += 0.05) later.get(c.kind).add(sizeAt(c.len, z));
      }
      for (const [k, set] of now) for (const L of set) warmLevel(k, L);
      const glint = (k) => k === 'trevally' || k === 'bait' || k === 'giant';
      for (const [k, set] of now) for (const L of set) queueVariants(k, L, [1, 3], glint(k));
      for (const [k, set] of later) for (const L of set) if (!now.get(k).has(L)) queueVariants(k, L, [1, 3], glint(k));
      for (const c of this.creatures) {
        if (c.kind === 'ray') for (let f = 0; f < RAY_FRAMES; f++) renderRay(sizeAt(c.len, c.z), f);
        if (c.kind === 'turtle') for (let f = 0; f < TURTLE_FRAMES; f++) renderTurtle(sizeAt(c.len, c.z), f);
      }
      // transition school + finale jellies
      for (const L of [18, 21, 24, 34, 38, 42, 60, 72, 84]) queueVariants('trevally', L, [1, 3], true);
      for (const sz of [14, 18, 22]) for (const hue of ['pink', 'blue']) for (let f = 0; f < JELLY_FRAMES; f++) queueWarm(() => renderJelly(sz, f, hue));
      for (const c of this.creatures) {
        if (c.kind === 'ray') for (let z = c.z - 0.2; z <= c.z + 0.2; z += 0.05) { const s = sizeAt(c.len, z); for (let f = 0; f < RAY_FRAMES; f++) queueWarm(() => renderRay(s, f)); }
        if (c.kind === 'turtle') for (let z = c.z - 0.2; z <= c.z + 0.2; z += 0.05) { const s = sizeAt(c.len, z); for (let f = 0; f < TURTLE_FRAMES; f++) queueWarm(() => renderTurtle(s, f)); }
      }
    });
    step(1, () => {
      this.columns = [[CX - 196, 0.66], [CX + 302, 0.7], [CX - 660, 0.5], [CX + 712, 0.56]].map(([x, z]) => ({ x, z, acc: 0 }));
      this.rays = [-820, -540, -300, -90, 120, 330, 560, 820].map((dx, i) => ({ x: CX + dx, z: 0.55, w: 26 + r() * 30, w2: 70 + r() * 60, ph: r() * TAU, sp: 0.2 + r() * 0.3, a: 0.06 + r() * 0.05, lean: 0.18 + r() * 0.12 }));
      for (let i = 0; i < 170; i++) this.snow.push({ x: CX + (r() - 0.5) * 900, y: 60 + r() * 240, z: r(), vx: (r() - 0.5) * 3, vy: 1 + r() * 3, s: r() < 0.12 ? 2 : 1, a: 0.25 + r() * 0.5, ph: r() * TAU });
    });
    const total = steps.reduce((a, s) => a + s[0], 0);
    let done = 0;
    const prof = typeof location !== 'undefined' && location.search.includes('prof');
    for (const [i, [w, fn]] of steps.entries()) {
      const t0 = performance.now();
      fn();
      if (prof) console.log('build step', i, (performance.now() - t0).toFixed(0) + 'ms');
      done += w;
      progress(done / total);
      await nextFrame();
    }
    // sort static props once by depth
    this.props.sort((a, b) => b.z - a.z);
  }

  spawnCreatures(r) {
    const add = (c) => { this.creatures.push(c); return c; };
    // trevally school (hero)
    const trev = [];
    for (let i = 0; i < 118; i++) trev.push(add(new Creature('trevally', { x: CX + (r() - 0.5) * 300, y: 110 + r() * 90, z: 0.25 + r() * 0.35, len: 30 + r() * 6, speed: 26, anim: 8, glint: true, vx: (r() - 0.5) * 40 })));
    this.trevSchool = new School(trev, { radius: 30, sep: 13, speed: 28, path: (t) => [CX + Math.sin(t * 0.09) * 360 + Math.sin(t * 0.21) * 80, 145 + Math.sin(t * 0.17) * 40, 0.42 + Math.sin(t * 0.05) * 0.14] });
    // bait ball
    const bait = [];
    for (let i = 0; i < 190; i++) bait.push(add(new Creature('bait', { x: CX - 400 + (r() - 0.5) * 120, y: 120 + r() * 60, z: 0.2 + r() * 0.3, len: 10 + r() * 3, speed: 34, anim: 12, glint: true, turnRate: 6, vx: 20 })));
    this.baitSchool = new School(bait, { radius: 18, sep: 6, speed: 34, wc: 0.7, wt: 0.5, path: (t) => [CX + Math.sin(t * 0.13 + 2) * 520, 125 + Math.sin(t * 0.31) * 45, 0.32 + Math.sin(t * 0.09) * 0.1] });
    // big cruisers
    add(new Creature('shark', { x: CX - 500, y: 170, z: 0.52, len: 132, speed: 15, anim: 5, turnRate: 0.9, dir: 1 })).cruiseY = [140, 230];
    add(new Creature('shark', { x: CX + 420, y: 150, z: 0.66, len: 124, speed: 13, anim: 5, turnRate: 0.9, dir: -1 })).cruiseY = [120, 210];
    add(new Creature('reefshark', { x: CX + 150, y: 120, z: 0.3, len: 100, speed: 19, anim: 6, turnRate: 1.1, dir: 1 })).cruiseY = [90, 200];
    add(new Creature('ray', { x: CX - 200, y: 110, z: 0.4, len: 84, speed: 12, anim: 5, turnRate: 0.7, dir: -1 })).cruiseY = [80, 170];
    add(new Creature('ray', { x: CX + 600, y: 140, z: 0.6, len: 70, speed: 10, anim: 5, turnRate: 0.7, dir: 1 })).cruiseY = [90, 190];
    add(new Creature('turtle', { x: CX - 700, y: 130, z: 0.3, len: 66, speed: 9, anim: 4, turnRate: 0.8, dir: 1 })).cruiseY = [90, 170];
    for (let i = 0; i < 6; i++) add(new Creature('giant', { x: CX + (r() - 0.5) * 1200, y: 120 + r() * 120, z: 0.1 + r() * 0.2, len: 46 + r() * 8, speed: 20 + r() * 6, anim: 7, glint: true, turnRate: 1.6, dir: r.sign() }));
    // groupers near rock bases
    add(new Creature('grouper', { x: CX - 220, y: 246, z: 0.4, len: 68, speed: 6, mode: 'hover', homeR: 60, anim: 4, turnRate: 1.2 }));
    add(new Creature('grouper', { x: CX + 230, y: 250, z: 0.38, len: 64, speed: 6, mode: 'hover', homeR: 60, anim: 4, turnRate: 1.2 }));
    // reef fish around the massifs
    const homes = [[CX - 250, 130, 0.4], [CX - 210, 190, 0.38], [CX - 300, 230, 0.4], [CX + 200, 200, 0.4], [CX + 260, 150, 0.4], [CX + 330, 110, 0.4], [CX - 90, 244, 0.5], [CX + 150, 246, 0.5], [CX - 960, 180, 0.2], [CX + 960, 190, 0.2]];
    const reef = [['tang', 20, 7], ['butterfly', 18, 7], ['snapper', 26, 8], ['batfish', 26, 5]];
    for (let i = 0; i < 34; i++) {
      const [k, len, n] = reef[i % reef.length];
      const h = homes[i % homes.length];
      add(new Creature(k, { x: h[0] + (r() - 0.5) * 60, y: h[1] + (r() - 0.5) * 30, z: h[2] + (r() - 0.5) * 0.1, len: len + r() * 4, speed: 8 + r() * 6, mode: 'hover', home: [h[0], h[1], h[2]], homeR: 50, anim: n + 2, turnRate: 4 }));
    }
    // distant silhouettes
    for (let i = 0; i < 26; i++) add(new Creature(r() < 0.7 ? 'trevally' : 'snapper', { x: CX + (r() - 0.5) * 1400, y: 90 + r() * 130, z: 0.88 + r() * 0.1, len: 30, speed: 10 + r() * 8, anim: 6, dir: r.sign() }));
    this.trev = trev;
    this.bait = bait;
  }

  // ------------------------------------------------------------ resize --
  resize(W, H) {
    this.W = W; this.H = H;
    this.curves0Y = frameCurves(W, H, CY).camY0;
    this.cam.y = this.curves0Y;
    this.tank = makeCanvas(W, H);
    this.tmp = makeCanvas(560, 300);
    this.refl = makeCanvas(W, H);
    // dithered backdrop gradient
    const pal = ramp(['#0a2f86', '#0f3f9e', '#1552b8', '#1b66cc', '#2379dc', '#2d8ce8', '#3a9ef2', '#52b2f8'], 8);
    const b = new Buf(W, H);
    for (let y = 0; y < H; y++) {
      const wy = y - H / 2 + this.curves0Y;
      const v = clamp(1 - (wy - 50) / 240);
      for (let x = 0; x < W; x++) {
        const cx = (x - W / 2) / (W * 0.8);
        const l = v * 6.2 + (1 - cx * cx) * 1.2 - 0.6;
        b.set(x, y, pal[clamp(Math.round(l + (bayer(x, y) - 0.5) * 1.1), 0, 7)]);
      }
    }
    this.backdrop = b.toCanvas();
    this.fogGrad = null;
    this.frame = genFrame(W, H, CY);
    this.curves = frameCurves(W, H, CY);
    this.camY0 = this.curves.camY0;
    this.winTop = this.curves.topWorld;
    this.ceil = makeCanvas(W, H + 8);
    this.yTop = 64 - this.curves.extra * 0.75;
  }

  // ------------------------------------------------------------ update --
  update(dt) {
    this.t += dt;
    this.trevSchool.update(dt, this);
    this.baitSchool.update(dt, this);
    for (const c of this.creatures) c.update(dt, this);
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (c.dead || (c.mode === 'rise' && c.y < this.yTop - 80)) this.creatures.splice(i, 1);
    }
    // bubble columns
    for (const col of this.columns) {
      col.acc += dt * 9;
      while (col.acc > 1) {
        col.acc -= 1;
        const rr = R();
        this.bubbles.add({ kind: 'bubble', x: col.x + (R() - 0.5) * 6, y: this.floorY(col.z) - 4, z: col.z + (R() - 0.5) * 0.02, vx: 0, vy: -(26 + R() * 22), age: 0, life: 12, r: rr < 0.6 ? 1 : rr < 0.9 ? 2 : 3, wob: 10, wobF: 5 + R() * 3, ph: R() * TAU, fade: false });
      }
    }
    this.bubbles.update(dt);
    const top = this.yTop - 20;
    this.bubbles.list = this.bubbles.list.filter((b) => b.y > top);
    for (const s of this.snow) {
      s.x += (s.vx + Math.sin(this.t * 0.4 + s.ph) * 2) * dt;
      s.y += s.vy * dt * 0.4;
      const [sx, sy] = this.toScreen(s.x, s.y, s.z);
      if (sx < -4) s.x += this.W + 8; else if (sx > this.W + 4) s.x -= this.W + 8;
      if (s.y > this.floorY(s.z)) s.y = this.yTop;
    }
    this.fx.update(dt);
    this.couple.update(dt);
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      if (g.life) { g.age = (g.age || 0) + dt; if (g.age > g.life) this.glows.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------ render --
  drawProp(ctx, p) {
    const [sx, sy] = this.toScreen(p.x, p.y, p.z);
    const X = Math.round(sx), Y = Math.round(sy);
    if (X > this.W || X + p.img.width < 0) return;
    ctx.drawImage(p.img, X, Y);
    if (p.light && p.caus > 0) {
      const t = this.tmp, tc = t.ctx;
      const w = p.img.width, h = p.img.height;
      tc.globalCompositeOperation = 'copy';
      tc.fillStyle = this.causPattern;
      const ox = Math.round(-(p.x) * 0.9), oy = 0;
      tc.setTransform(1, 0, 0, 1, ox % 96, oy);
      tc.fillRect(-ox % 96, 0, w, h);
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.globalCompositeOperation = 'destination-in';
      tc.drawImage(p.light, 0, 0);
      tc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.caus * this.light;
      ctx.drawImage(t, 0, 0, w, h, X, Y, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawKelp(ctx, k) {
    const f = k.frames[Math.floor(this.t * k.speed * 0.5 + k.off) % KELP_FRAMES];
    const [sx, sy] = this.toScreen(k.x, this.floorY(k.z) + 3, k.z);
    ctx.drawImage(f, Math.round(sx - f.ox), Math.round(sy - f.oy));
  }

  fog(ctx, a) {
    if (!this.fogGrad) {
      const g = ctx.createLinearGradient(0, this.toScreen(0, this.winTop + 8, 0.5)[1], 0, this.toScreen(0, 300, 0.5)[1]);
      g.addColorStop(0, '#46a8f6');
      g.addColorStop(0.5, '#2a80e0');
      g.addColorStop(1, '#1a5cc2');
      this.fogGrad = g;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = this.fogGrad;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
  }

  drawSand(ctx) {
    const tex = this.sand, tw = tex.width, th = tex.height;
    for (let y = FLOOR_FAR - 2; y <= FLOOR_NEAR + 12; y++) {
      const z = clamp((FLOOR_NEAR - y) / (FLOOR_NEAR - FLOOR_FAR), 0, 1);
      const [sx, sy] = this.toScreen(CX, y, z);
      const row = Math.round((1 - z) * (th - 1));
      let x0 = Math.round(sx - this.W / 2 - CX) % tw;
      if (x0 > 0) x0 -= tw;
      for (let x = x0; x < this.W; x += tw) ctx.drawImage(tex, 0, row, tw, 1, x, Math.round(sy), tw, 1);
    }
    // caustics on sand
    const [, s0] = this.toScreen(CX, FLOOR_FAR, 1);
    const [, s1] = this.toScreen(CX, FLOOR_NEAR + 12, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22 * this.light;
    ctx.fillStyle = this.causPattern;
    const off = Math.round(-(this.cam.x - CX) * 0.85);
    ctx.setTransform(1, 0, 0, 0.4, off % 96, Math.round(s0));
    ctx.fillRect(-off % 96, 0, this.W, Math.round((s1 - s0) / 0.4));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawRays(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    const t = this.t;
    for (const r of this.rays) {
      const [sx] = this.toScreen(r.x, 0, r.z);
      const top = this.toScreen(0, this.winTop - 10, r.z)[1], bot = this.toScreen(0, 300, r.z)[1];
      const a = r.a * (0.55 + 0.45 * Math.sin(t * r.sp + r.ph)) * this.light;
      const w1 = r.w * (0.8 + 0.2 * Math.sin(t * 0.3 + r.ph)), w2 = r.w2;
      const lean = (bot - top) * r.lean;
      if (sx + lean + w2 < -20 || sx - w2 > this.W + 20) continue;
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, `rgba(170,225,255,${a})`);
      g.addColorStop(0.55, `rgba(120,200,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - w1 / 2, top);
      ctx.lineTo(sx + w1 / 2, top);
      ctx.lineTo(sx + lean + w2 / 2, bot);
      ctx.lineTo(sx + lean - w2 / 2, bot);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  renderTank() {
    const ctx = this.tank.ctx;
    const W = this.W, H = this.H;
    this.causPattern = ctx.createPattern(this.caustics[Math.floor(this.t * 9) % this.caustics.length], 'repeat');
    ctx.drawImage(this.backdrop, 0, 0);
    // distant ridges
    const ridge = (img, z, dy) => {
      const [sx, sy] = this.toScreen(CX - img.width / 2, this.floorY(z) + dy - img.height, z);
      ctx.drawImage(img, Math.round(sx), Math.round(sy));
    };
    ridge(this.farRidge2, 1, 4);
    ctx.globalAlpha = 0.55; ridge(this.farRidge, 0.97, 8); ctx.globalAlpha = 1;
    this.drawSand(ctx);
    // depth-sorted drawables
    const list = [];
    for (const p of this.props) list.push([p.z, 0, p]);
    for (const k of this.kelp) list.push([k.z, 1, k]);
    for (const c of this.creatures) list.push([c.z, 2, c]);
    for (const e of this.extras) list.push([e.z, 3, e]);
    list.sort((a, b) => b[0] - a[0]);
    let fi = 0;
    let bi = 0;
    const bl = this.bubbles.list.slice().sort((a, b) => b.z - a.z);
    const proj = (p) => this.toScreen(p.x, p.y, p.z);
    for (const [z, type, o] of list) {
      while (fi < FOG.length && z < FOG[fi].z) { this.fog(ctx, FOG[fi].a); fi++; }
      while (bi < bl.length && bl[bi].z > z) { this.drawBubble(ctx, bl[bi]); bi++; }
      if (type === 0) this.drawProp(ctx, o);
      else if (type === 1) this.drawKelp(ctx, o);
      else if (type === 2) o.draw(ctx, this);
      else o.draw(ctx);
    }
    while (fi < FOG.length) { this.fog(ctx, FOG[fi].a); fi++; }
    while (bi < bl.length) { this.drawBubble(ctx, bl[bi]); bi++; }
    // glows (heart light etc.)
    for (const g of this.glows) {
      const [sx, sy] = this.toScreen(g.x, g.y, g.z);
      let k = g.life ? Math.sin(Math.PI * clamp(g.age / g.life)) : 1;
      if (g.beat) { const ph = (this.t * 1.1) % 1; k *= 0.75 + 0.35 * (Math.exp(-(((ph - 0.08) / 0.05) ** 2)) + 0.7 * Math.exp(-(((ph - 0.28) / 0.06) ** 2))); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (g.a ?? 1) * k;
      const s = glowSprite(g.r, g.col);
      ctx.drawImage(s, Math.round(sx - g.r), Math.round(sy - g.r));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.drawRays(ctx);
    // marine snow
    for (const s of this.snow) {
      const [sx, sy] = this.toScreen(s.x, s.y, s.z);
      const tw = 0.6 + 0.4 * Math.sin(this.t * 2 + s.ph);
      ctx.globalAlpha = s.a * tw * (1 - s.z * 0.6);
      ctx.fillStyle = s.z < 0.3 ? '#e8f8ff' : '#a8dcff';
      ctx.fillRect(Math.round(sx), Math.round(sy), s.s, s.s);
    }
    ctx.globalAlpha = 1;
    this.fx.draw(ctx, proj);
    // top light falloff
    const ty0 = this.toScreen(0, this.winTop + 8, 0)[1], ty1 = this.toScreen(0, this.winTop + 108, 0)[1];
    const tg = ctx.createLinearGradient(0, ty0, 0, ty1);
    tg.addColorStop(0, `rgba(160,220,255,${0.22 * this.light})`);
    tg.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, ty1);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBubble(ctx, b) {
    const [sx, sy] = this.toScreen(b.x, b.y, b.z);
    const s = bubbleSprite(b.r);
    ctx.drawImage(s, Math.round(sx) - s.o, Math.round(sy) - s.o);
  }

  render(ctx) {
    const W = this.W, H = this.H;
    this.renderTank();
    ctx.drawImage(this.tank, 0, 0);
    // ceiling panels scroll with the camera; the curved frame is screen space
    const dy = Math.round(this.cam.y - this.camY0);
    const cc = this.ceil.ctx;
    cc.globalCompositeOperation = 'copy';
    cc.fillStyle = cc.createPattern(this.ceilTile, 'repeat');
    const ox = Math.round(-this.cam.x) % 60;
    cc.setTransform(1, 0, 0, 1, ox, -dy);
    cc.fillRect(-ox, dy, W, H + 8);
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(this.frame.mask, 0, 0);
    cc.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.ceil, 0, -this.frame.M - dy);
    ctx.drawImage(this.frame, 0, -this.frame.M - dy);
    // glossy floor reflection of the tank
    const sillS = this.curves.sill(W / 2) - dy;
    const ledge = Math.round(sillS + 21);
    const rh = H - ledge;
    if (rh > 0) {
      const rc = this.refl.ctx;
      rc.globalCompositeOperation = 'copy';
      const sy = sillS;
      rc.setTransform(1, 0, 0, -0.6, 0, 0);
      const sh = Math.round(rh / 0.6);
      rc.drawImage(this.tank, 0, Math.round(sy) - sh, W, sh, 0, -sh, W, sh);
      rc.setTransform(1, 0, 0, 1, 0, 0);
      rc.globalCompositeOperation = 'destination-in';
      const g = rc.createLinearGradient(0, 0, 0, rh);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      rc.fillStyle = g;
      rc.fillRect(0, 0, W, rh);
      rc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.24 * this.light;
      for (let y = 0; y < rh; y += 1) {
        const wob = Math.round(Math.sin(y * 0.7 + this.t * 2) * (y / rh) * 2);
        ctx.drawImage(this.refl, 0, y, W, 1, wob, ledge + y, W, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // the couple + reflection
    const img = this.couple.render();
    const [cx, cy] = this.toScreen(this.coupleX, this.coupleY, 0);
    const X = Math.round(cx - this.couple.R.ox), Y = Math.round(cy - this.couple.R.oy);
    const fs = this.couple.flip;
    ctx.globalAlpha = 0.28;
    ctx.setTransform(fs, 0, 0, -0.55, Math.round(cx), Math.round(cy) + 1);
    ctx.drawImage(img, -this.couple.R.ox, -this.couple.R.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (fs !== 1) {
      ctx.setTransform(fs, 0, 0, 1, Math.round(cx), 0);
      ctx.drawImage(img, -this.couple.R.ox, Y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else ctx.drawImage(img, X, Y);
  }
}
