// The director: choreographs the whole confession as an async script.
import { TAU, clamp, lerp, ease, R, heartPoint, fbm } from '../util.js';
import { CONFIG, fill } from '../config.js';
import { CX, CY } from '../world/scene.js';
import { Creature } from '../world/creatures.js';
import { Particles, burstSparks, burstHearts, heartSprite, bubbleSprite } from '../world/fx.js';
import { drawText, textWidth, textPixelsBold, wrap, chars, charX, LINE_H } from '../font.js';
import { bottleSprite, makePaper, drawRoll, drawSeal, drawBubbleButton, drawSpeaker, Sweep, BubbleCurtain } from './ui.js';
import { SoundEngine } from '../audio.js';
import { fishSprite } from '../art/fish.js';

export class Story {
  constructor(aq, post, opts = {}) {
    this.aq = aq;
    this.post = post;
    this.t = 0;
    this.timers = [];
    this.tweens = [];
    this.fx = new Particles();
    this.fxBack = new Particles();
    this.sound = new SoundEngine(CONFIG.sound);
    this.camX = CX - 560;
    this.camY = CY;
    this.title = null;
    this.hint = null;
    this.letter = null;
    this.question = null;
    this.buttons = [];
    this.finale = null;
    this.trans = null;
    this.bottle = null;
    this.tapWait = null;
    this.hoverClickable = false;
    this.mouse = [-99, -99];
    this.speakerOn = CONFIG.sound;
    this.showSpeaker = false;
    this.heartSparkle = null;
    this.heartRain = 0;
    this.jellyLoop = false;
    this.replay = null;
    this.bubbleAcc = 0;
    aq.cam.x = this.camX;
    aq.couple.mode = 'walk';
    aq.coupleX = CX - 470;
    post.p.blur = 1;
    post.p.dim = 0.4;
    this.debug = opts.debug;
  }

  start() { this.run(this.debug).catch((e) => console.error(e)); }

  // --------------------------------------------------------- primitives --
  wait(s) { return new Promise((res) => this.timers.push({ at: this.t + s, res })); }
  tween(dur, fn, ez = ease.linear) {
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn, ez, res }));
  }
  until(cond) { return new Promise((res) => this.timers.push({ cond, res })); }
  waitTap(check = null, timeout = 0) {
    return new Promise((res) => {
      this.tapWait = { check, res };
      if (timeout) this.wait(timeout).then(() => { if (this.tapWait && this.tapWait.res === res) { this.tapWait = null; res('timeout'); } });
    });
  }

  resize(W, H) {
    this.W = W; this.H = H;
    if (this.letter) this.layoutLetter();
  }

  // ------------------------------------------------------------- script --
  async run(debug) {
    const aq = this.aq;
    if (debug) {
      this.post.p.blur = 0; this.post.p.dim = 0;
      this.sound.level = 1;
      if (debug !== 'tank') {
        this.camX = CX; aq.cam.x = CX; aq.coupleX = CX;
        aq.couple.mode = 'back'; aq.couple.hold = 1; aq.couple.lean = 1;
        this.showSpeaker = CONFIG.sound;
      }
      const order = ['tank', 'heart', 'bottle', 'letter', 'question', 'finale'];
      const from = Math.max(0, order.indexOf(debug));
      if (from <= 0) { await this.arrival(); await this.hands(); }
      if (from <= 1) await this.heartScene();
      if (from <= 2) await this.bottleScene();
      if (from <= 3) await this.letterScene();
      if (from <= 4) await this.questionScene();
      await this.finaleScene();
      return;
    }
    await this.titleScene();
    await this.dive();
    await this.arrival();
    await this.hands();
    await this.heartScene();
    await this.bottleScene();
    await this.letterScene();
    await this.questionScene();
    await this.finaleScene();
  }

  async titleScene() {
    this.title = { a: 0 };
    { const T = this.title; this.tween(1.8, (k) => { if (T.a < 1 && this.title === T && !this.diving) T.a = k; }, ease.outCubic); }
    await this.wait(1.2);
    this.hint = { text: CONFIG.tapToBegin, y: () => Math.round(this.H * 0.66), a: 0 };
    { const h = this.hint; this.tween(0.8, (k) => { h.a = k; }); }
    await this.waitTap();
    this.hint = null;
    this.sound.start();
    this.showSpeaker = CONFIG.sound;
  }

  async dive() {
    this.diving = true;
    this.sound.sfx('dive');
    const tr = new BubbleCurtain(this.W, this.H, 2.4);
    this.trans = tr;
    const p = this.post.p;
    this.tween(2.4, (k) => {
      p.warp = Math.sin(k * Math.PI) * 1.3;
      p.blur = 1 - ease.inOutSine(k);
      p.dim = 0.4 * (1 - ease.inOutSine(k));
      if (this.title) this.title.a = 1 - clamp(k * 3);
    });
    await this.until(() => tr.covered());
    this.title = null;
    this.fxBack.clear();
    this.sound.level = 1;
    await this.until(() => tr.done);
    this.trans = null;
    p.warp = 0;
  }

  async arrival() {
    const aq = this.aq, c = aq.couple;
    c.mode = 'walk';
    const x0 = aq.coupleX, x1 = CX;
    this.tween(13.5, (k) => { this.camX = lerp(CX - 560, CX, k); }, ease.inOutSine);
    let x = x0;
    const speed = 36;
    await this.until(() => {
      const d = x1 - x;
      const v = Math.min(speed, d * 0.9 + 3);
      const dt = this.dt || 0.016;
      const step = Math.min(d, v * dt);
      x += step;
      aq.coupleX = x;
      c.walk += step / 11;
      c.moving = clamp(v / 26);
      return d < 0.5;
    });
    c.moving = 0;
    await this.wait(0.7);
    // turn toward the glass
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'back';
    await this.tween(0.2, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
    await this.wait(1.1);
  }

  async hands() {
    const aq = this.aq, c = aq.couple;
    this.showSpeaker = CONFIG.sound;
    await this.tween(2.0, (k) => { c.hold = k; }, ease.inOutCubic);
    this.sound.sfx('heart');
    aq.fx.add({ kind: 'heart', x: aq.coupleX, y: aq.coupleY - 44, z: 0, vx: 0, vy: -16, drag: 0.4, age: 0, life: 3.2, size: 2, ph: 0, wob: 8, wobF: 2 });
    for (let i = 0; i < 14; i++) {
      const a = R() * TAU, s = 20 + R() * 20;
      aq.fx.add({ kind: 'spark', x: aq.coupleX, y: aq.coupleY - 44, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.5, age: 0, life: 0.8 + R() * 0.5, size: 1 + (R() * 2 | 0), col: R() < 0.5 ? '#ffffff' : '#ffc4e0' });
    }
    await this.wait(0.9);
    await this.tween(2.4, (k) => { c.lean = k; }, ease.inOutSine);
    await this.wait(0.8);
  }

  // Swirling heart of trevally around the statue.
  formHeart(fish, cx, cy, cz, s, t0, full = false) {
    const rings = full ? [[1, 0.34], [0.84, 0.26], [0.68, 0.18], [0.52, 0.13], [0.36, 0.09]] : [[1, 0.46], [0.87, 0.32], [0.74, 0.22]];
    let idx = 0;
    const n = fish.length;
    rings.forEach(([sc, frac], j) => {
      const cnt = j === rings.length - 1 ? n - idx : Math.round(n * frac);
      for (let i = 0; i < cnt && idx < n; i++, idx++) {
        const f = fish[idx];
        const ph = (i / cnt) * TAU;
        const dir = j % 2 ? -1 : 1;
        const w = 0.26 / Math.max(0.5, sc);
        const zo = cz + (j - 2) * 0.012 + Math.sin(ph * 3) * 0.01;
        f.form = (t) => {
          const [hx, hy] = heartPoint(ph + dir * w * (t - t0));
          return [cx + hx * s * sc, cy + hy * s * sc, zo];
        };
        f.formK = 0;
      }
    });
  }

  releaseForm(fish, burst = 0, from = null) {
    for (const f of fish) {
      f.form = null;
      f.formK = 0;
      f.faceOverride = 0;
      f.mode = 'school';
      if (burst && from) {
        const dx = f.x - from[0], dy = f.y - from[1];
        const d = Math.hypot(dx, dy) || 1;
        f.vx += (dx / d) * burst * (0.6 + R() * 0.6);
        f.vy += (dy / d) * burst * (0.6 + R() * 0.6);
        f.flash = 1;
      }
    }
  }

  async heartScene() {
    const aq = this.aq;
    this.sound.level = 2;
    const s = Math.min(108, this.W * 0.36);
    const cx = CX + 30, cy = 178, cz = 0.3;
    this.formHeart(aq.trev, cx, cy, cz, s, aq.t);
    const glow = { x: cx, y: cy + 22, z: 0.34, r: Math.round(s * 1.3), col: '#ff5aa0', a: 0 };
    aq.glows.push(glow);
    await this.tween(3.6, (k) => { for (const f of aq.trev) f.formK = k; glow.a = 0.45 * k; }, ease.inOutSine);
    this.sound.sfx('sparkle');
    this.heartSparkle = { cx, cy, cz, s };
    await this.wait(7.5);
    this.heartSparkle = null;
    this.releaseForm(aq.trev, 20, [cx, cy + 20]);
    this.tween(2, (k) => { glow.a = 0.45 * (1 - k); }).then(() => { aq.glows.splice(aq.glows.indexOf(glow), 1); });
    await this.wait(1.2);
  }

  async bottleScene() {
    const aq = this.aq;
    const b = (this.bottle = { x: CX - 58, y: aq.yTop - 40, z: 0.05, ang: 0.6, a: 1, base: 196, glow: 0, bob: 0, landed: false });
    const self = this;
    b.draw = (ctx) => self.drawBottle(ctx);
    aq.extras = [b];
    this.sound.sfx('whoosh');
    await this.tween(4.8, (k) => {
      b.y = lerp(aq.yTop - 40, b.base, ease.outCubic(k));
      b.ang = 0.6 * Math.cos(k * 7) * (1 - k) + 0.1;
      if (R() < 0.5) aq.bubbles.add({ kind: 'bubble', x: b.x + (R() - 0.5) * 8, y: b.y - 6, z: b.z, vx: 0, vy: -20 - R() * 20, age: 0, life: 6, r: R() < 0.7 ? 1 : 2, wob: 8, wobF: 5, ph: R() * TAU, fade: false });
    });
    b.landed = true;
    this.tween(1, (k) => { b.glow = k; });
    await this.wait(0.6);
    const [sx, sy] = aq.toScreen(b.x, b.y, b.z);
    this.hint = { text: 'tap the bottle', y: () => Math.round(aq.toScreen(b.x, b.y, b.z)[1] + 26), x: () => Math.round(aq.toScreen(b.x, b.y, b.z)[0]), a: 0 };
    { const h = this.hint; this.tween(0.6, (k) => { h.a = k; }); }
    this.bottleHot = true;
    await this.waitTap((x, y) => {
      const [bx, by] = aq.toScreen(b.x, b.y, b.z);
      return Math.hypot(x - bx, y - by) < 34 || this.t - this.bottleHotT > 5;
    }, 16);
    this.bottleHot = false;
    this.hint = null;
    void sx; void sy;
  }

  async letterScene() {
    const aq = this.aq, p = this.post.p;
    const b = this.bottle;
    let bx = this.W / 2, by = this.H / 2;
    if (b) [bx, by] = aq.toScreen(b.x, b.y, b.z);
    this.sound.sfx('pop');
    this.sound.sfx('ripple');
    burstSparks(this.fx, bx, by, 26, { speed: 70 });
    for (let i = 0; i < 30; i++) this.fx.add({ kind: 'bubble', x: bx + (R() - 0.5) * 10, y: by, vx: (R() - 0.5) * 60, vy: -30 - R() * 70, drag: 1.2, ay: -20, age: 0, life: 1.6 + R(), r: 1 + (R() * 4 | 0), wob: 12, wobF: 6, ph: R() * TAU });
    p.rip = [bx / this.W, by / this.H, 0, 1];
    this.tween(2.2, (k) => { p.rip[2] = k * 1.6; p.rip[3] = 1 - k; }, ease.outQuad).then(() => { p.rip[3] = 0; });
    if (b) this.tween(0.8, (k) => { b.a = 1 - k; b.y -= 0.3; }).then(() => { aq.extras = []; this.bottle = null; });
    this.tween(1.4, (k) => { p.blur = k; p.dim = 0.32 * k; }, ease.inOutSine);
    this.tween(0.4, (k) => { p.uiGlow = lerp(0.55, 0.1, k); });
    this.letter = { open: 0, n: 0, done: false, seal: 0 };
    this.layoutLetter();
    await this.wait(0.9);
    this.sound.sfx('chime');
    { const L = this.letter; await this.tween(1.3, (k) => { L.open = k; }, ease.outBack); }
    this.letter.typing = true;
    await this.until(() => this.letter.done);
    this.sound.sfx('chime');
    { const L = this.letter; await this.tween(0.5, (k) => { L.seal = k; }, ease.outBack); }
    await this.wait(0.8);
    this.hint = { text: 'tap to continue', y: () => Math.min(this.H - 8, Math.round(this.H / 2 + this.letter.h / 2 + 12)), a: 0 };
    { const h = this.hint; this.tween(0.6, (k) => { h.a = k; }); }
    await this.waitTap();
    this.hint = null;
  }

  layoutLetter() {
    const L = this.letter;
    const maxW = Math.min(this.W - 20, 300);
    const inner = maxW - 34;
    const lines = [];
    for (const raw of CONFIG.letter) for (const l of wrap(fill(raw), inner)) lines.push(l);
    let lh = LINE_H;
    let h = lines.length * lh + 44;
    if (h > this.H - 40) { lh = 9; h = lines.length * lh + 40; }
    L.lines = lines; L.lh = lh; L.w = maxW; L.h = h;
    L.total = lines.reduce((a, l) => a + chars(l).length, 0);
    L.paper = makePaper(maxW, h);
  }

  async questionScene() {
    const aq = this.aq, c = aq.couple, p = this.post.p;
    this.sound.sfx('whoosh');
    const sw = new Sweep(this.W, this.H, 2.9);
    this.trans = sw;
    await this.until(() => sw.covered());
    this.letter = null;
    p.blur = 0; p.dim = 0; p.uiGlow = 0.55; p.rip[3] = 0;
    c.mode = 'face'; c.hands = 1; c.hold = 0; c.lean = 0; c.hug = 0;
    this.camX = CX; aq.cam.x = CX;
    const words = this.formWords(CONFIG.fishWords);
    await this.until(() => sw.done);
    this.trans = null;
    this.sound.level = 2;
    await this.tween(3.2, (k) => { for (const f of words.fish) { f.formK = k; f.glowA = k; } words.glow.a = 0.3 * k; }, ease.inOutSine);
    this.sound.sfx('sparkle');
    await this.wait(0.8);
    this.question = { a: 0 };
    { const Q = this.question; this.tween(1, (k) => { Q.a = k; }, ease.outCubic); }
    await this.wait(0.7);
    this.noCount = 0;
    this.buttons = [
      { id: 'yes', label: CONFIG.yes, pink: true, w: textWidth(CONFIG.yes) + 22, h: 15, ph: 0, alpha: 0, rel: [-1, 0] },
      { id: 'no', label: CONFIG.no, pink: false, w: textWidth(CONFIG.no) + 16, h: 13, ph: 1.7, alpha: 0, rel: [1, 0] },
    ];
    this.layoutButtons();
    this.tween(0.6, (k) => { for (const b of this.buttons) b.alpha = k; });
    await new Promise((res) => { this.onYes = res; });
    this.words = words;
  }

  layoutButtons() {
    const [, cy] = this.aq.toScreen(this.aq.coupleX, this.aq.coupleY, 0);
    const below = this.H - cy > 46;
    for (const b of this.buttons) {
      if (b.free) continue;
      if (below) { b.x = Math.round(this.W / 2 + b.rel[0] * 34); b.y = Math.round(cy + 24); }
      else { b.x = Math.round(this.W / 2 + b.rel[0] * Math.min(86, this.W * 0.3)); b.y = Math.round(cy - 30); }
    }
  }

  formWords(str) {
    const aq = this.aq;
    const lines = String(str).split('\n');
    const pix = lines.map((l) => textPixelsBold(l));
    const tw = Math.max(...pix.map((p) => p.w));
    const cell = clamp(Math.floor((this.W - 30) / tw), 3, 6);
    const lineH = 10 * cell;
    const cz = 0.1;
    const totalH = lines.length * lineH - 3 * cell;
    const top = 128 - totalH / 2;
    const targets = [];
    pix.forEach((p, li) => {
      const ox = CX - (p.w * cell) / 2;
      for (const [x, y] of p.px) targets.push([ox + x * cell + cell / 2, top + li * lineH + y * cell, cz + (x % 2) * 0.004]);
    });
    const pool = aq.bait.slice();
    let tgts = targets;
    if (targets.length > pool.length) {
      tgts = [];
      for (let i = 0; i < pool.length; i++) tgts.push(targets[Math.floor((i * targets.length) / pool.length)]);
    }
    tgts.sort((a, b) => a[0] - b[0]);
    pool.sort((a, b) => a.x - b.x);
    const chosen = [];
    const step = pool.length / tgts.length;
    tgts.forEach((tg, i) => {
      const f = pool[Math.floor(i * step)];
      const bob = R() * TAU;
      f.form = (t) => [tg[0] + Math.sin(t * 1.3 + bob) * 0.5, tg[1] + Math.sin(t * 2.1 + bob) * 0.6, tg[2]];
      f.formFace = 1;
      f.formK = 0;
      chosen.push(f);
    });
    const glow = { x: CX, y: top + totalH / 2, z: 0.12, r: Math.round(Math.min(this.W * 0.5, tw * cell * 0.62)), col: '#9fe0ff', a: 0 };
    aq.glows.push(glow);
    return { fish: chosen, glow, center: [CX, top + totalH / 2] };
  }

  async finaleScene() {
    const aq = this.aq, c = aq.couple, p = this.post.p;
    const yes = this.buttons.find((b) => b.id === 'yes');
    const bx = yes ? yes.x : this.W / 2, by = yes ? yes.y : this.H / 2;
    this.sound.sfx('yes');
    this.sound.level = 3;
    p.flash = [1, 0.75, 0.88, 0.55];
    this.tween(1.1, (k) => { p.flash[3] = 0.55 * (1 - k); });
    p.rip = [bx / this.W, by / this.H, 0, 1];
    this.tween(2.4, (k) => { p.rip[2] = k * 1.8; p.rip[3] = 1 - k; }, ease.outQuad).then(() => { p.rip[3] = 0; });
    burstHearts(this.fx, bx, by, 26, { speed: 110, spread: TAU, ay: -30, life: 2.6 });
    burstSparks(this.fx, bx, by, 40, { speed: 120 });
    const Qf = this.question;
    this.tween(0.6, (k) => { for (const b of this.buttons) b.alpha = 1 - k; if (Qf) Qf.a = 1 - k; }).then(() => { this.buttons = []; this.question = null; });
    // release the fish words in a burst
    if (this.words) {
      this.releaseForm(this.words.fish, 90, this.words.center);
      const g = this.words.glow;
      const wf = this.words.fish;
      this.tween(1.5, (k) => { g.a = 0.3 * (1 - k); for (const f of wf) f.glowA = 1 - k; }).then(() => aq.glows.splice(aq.glows.indexOf(g), 1));
    }
    // hug
    this.tween(1.8, (k) => { c.hug = k; }, ease.inOutCubic);
    this.tween(2, (k) => { p.tint = [1 + 0.05 * k, 1 - 0.02 * k, 1 + 0.02 * k]; p.bloom = 0.75 + 0.25 * k; });
    await this.wait(1.6);
    this.sound.sfx('heart');
    aq.fx.add({ kind: 'heart', x: aq.coupleX, y: aq.coupleY - 100, z: 0, vx: 0, vy: -10, drag: 0.3, age: 0, life: 4, size: 3, ph: 0, wob: 6, wobF: 2 });
    for (let i = 0; i < 20; i++) {
      const a = R() * TAU, s = 25 + R() * 25;
      aq.fx.add({ kind: 'spark', x: aq.coupleX, y: aq.coupleY - 96, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 2.5, age: 0, life: 0.8 + R() * 0.6, size: 1 + (R() * 3 | 0), col: R() < 0.5 ? '#ffffff' : '#ffc4e0' });
    }
    // giant heart of every trevally, jellies rising, hearts from the sand
    const s = Math.min(112, this.W * 0.42);
    const cx = CX + 22, cy = 148, cz = 0.32;
    this.formHeart(aq.trev, cx, cy, cz, s, aq.t, true);
    const glow = { x: cx, y: cy + 20, z: 0.34, r: Math.round(s * 1.35), col: '#ff4f98', a: 0 };
    aq.glows.push(glow);
    this.tween(3.4, (k) => { for (const f of aq.trev) f.formK = k; glow.a = 0.4 * k; }, ease.inOutSine);
    this.heartSparkle = { cx, cy, cz, s };
    this.jellyLoop = true;
    this.heartRain = 1;
    for (let i = 0; i < 9; i++) this.spawnJelly(true);
    await this.wait(1.4);
    this.finale = { a: 0 };
    { const F = this.finale; this.tween(1.6, (k) => { F.a = k; }, ease.outCubic); }
    await this.wait(9);
    this.replay = { a: 0 };
    { const Rp = this.replay; this.tween(1, (k) => { Rp.a = k; }); }
  }

  spawnJelly(initial = false) {
    const aq = this.aq;
    const z = 0.15 + R() * 0.6;
    const [x] = aq.fromScreen(R() * this.W, 0, z);
    const j = new Creature('jelly', { x, y: initial ? aq.floorY(z) - R() * 120 : aq.floorY(z) + 10, z, len: R() < 0.4 ? 22 : R() < 0.6 ? 18 : 14, speed: 5 + R() * 5, mode: 'rise', anim: 3 + R() * 1.5 });
    j.hue = R() < 0.65 ? 'pink' : 'blue';
    j.vx = 0; j.vy = -j.speed;
    aq.creatures.push(j);
  }

  // ------------------------------------------------------------- update --
  update(dt) {
    this.dt = dt;
    this.t += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.at != null && this.t >= tm.at) || (tm.cond && tm.cond())) { this.timers.splice(i, 1); tm.res(); }
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = clamp(tw.t / tw.dur);
      tw.fn(tw.ez(k));
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    const aq = this.aq;
    // camera: smooth follow with a gentle floating drift
    aq.cam.x += (this.camX + Math.sin(this.t * 0.21) * 3 - aq.cam.x) * Math.min(1, dt * 3);
    aq.cam.y += (this.camY + Math.sin(this.t * 0.17) * 1.5 - aq.cam.y) * Math.min(1, dt * 3);
    if (this.trans) this.trans.update(dt);
    this.fx.update(dt);
    this.fxBack.update(dt);
    // ambient UI bubbles on the title
    if (this.title) {
      this.bubbleAcc += dt * 6;
      while (this.bubbleAcc > 1) {
        this.bubbleAcc--;
        this.fxBack.add({ kind: 'bubble', x: R() * this.W, y: this.H + 6, vx: 0, vy: -14 - R() * 20, age: 0, life: 12, r: R() < 0.7 ? 1 : 2, wob: 6, wobF: 3, ph: R() * TAU, alpha: 0.6, fade: false });
      }
    }
    if (this.letter && this.letter.typing && !this.letter.done) {
      const before = Math.floor(this.letter.n);
      this.letter.n += dt * 32;
      if (Math.floor(this.letter.n / 3) !== Math.floor(before / 3)) this.sound.sfx('type');
      if (this.letter.n >= this.letter.total) { this.letter.n = this.letter.total; this.letter.done = true; }
    }
    if (this.heartSparkle && R() < dt * 14) {
      const h = this.heartSparkle;
      const [hx, hy] = heartPoint(R() * TAU);
      aq.fx.add({ kind: 'spark', x: h.cx + hx * h.s, y: h.cy + hy * h.s, z: h.cz - 0.02, vx: 0, vy: -4, age: 0, life: 0.6 + R() * 0.6, size: 1 + (R() * 3 | 0), col: R() < 0.6 ? '#ffffff' : '#ffc4e0' });
    }
    if (this.heartRain && R() < dt * 5) {
      const z = 0.1 + R() * 0.5;
      const [x] = aq.fromScreen(R() * this.W, 0, z);
      aq.fx.add({ kind: 'heart', x, y: aq.floorY(z) - 4, z, vx: 0, vy: -12 - R() * 14, age: 0, life: 7, size: R() < 0.7 ? 0 : 1, ph: R() * TAU, wob: 10, wobF: 2, fin: 0.6, alpha: 0.9 });
    }
    if (this.jellyLoop) {
      const n = aq.creatures.reduce((a, c) => a + (c.kind === 'jelly' ? 1 : 0), 0);
      if (n < 9 && R() < dt * 0.8) this.spawnJelly();
    }
    if (this.bottle && this.bottle.landed) {
      const b = this.bottle;
      b.bob += dt;
      b.y = b.base + Math.sin(b.bob * 1.4) * 2.2;
      b.ang = Math.sin(b.bob * 1.1) * 0.16 + 0.1;
      if (R() < dt * 3) aq.fx.add({ kind: 'spark', x: b.x + (R() - 0.5) * 30, y: b.y + (R() - 0.5) * 16, z: b.z - 0.01, vx: 0, vy: -5, age: 0, life: 0.7, size: 1 + (R() * 2 | 0), col: '#fff4c8' });
    }
    if (this.bottleHot && this.bottleHotT == null) this.bottleHotT = this.t;
    if (this.buttons.length) this.layoutButtons();
    // hover state
    this.hoverClickable = false;
    for (const b of this.buttons) {
      b.hover = Math.abs(this.mouse[0] - b.x) < b.w / 2 + 2 && Math.abs(this.mouse[1] - b.y) < b.h / 2 + 2;
      if (b.hover && b.id === 'yes') this.hoverClickable = true;
    }
    if (this.tapWait && !this.tapWait.check) this.hoverClickable = true;
    if (this.bottleHot) {
      const b = this.bottle;
      const [bx, by] = aq.toScreen(b.x, b.y, b.z);
      if (Math.hypot(this.mouse[0] - bx, this.mouse[1] - by) < 34) this.hoverClickable = true;
    }
    if (this.speakerHover() || (this.replay && this.replayHover())) this.hoverClickable = true;
  }

  // -------------------------------------------------------------- input --
  speakerRect() { return [this.W - 16, 6, 12, 11]; }
  speakerHover() { const [x, y, w, h] = this.speakerRect(); return this.showSpeaker && this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h; }
  replayRect() { const w = textWidth('replay') + 14; return [this.W - w - 6, this.H - 16, w, 12]; }
  replayHover() { const [x, y, w, h] = this.replayRect(); return this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h; }

  pointer(type, x, y) {
    this.mouse = [x, y];
    if (type === 'move') {
      const no = this.buttons.find((b) => b.id === 'no');
      if (no && no.alpha > 0.9 && Math.hypot(x - no.x, y - no.y) < no.w / 2 + 8) this.escapeNo(x, y);
      return;
    }
    if (type !== 'down' && type !== 'key') return;
    if (type === 'down' && this.speakerHover()) {
      this.speakerOn = !this.speakerOn;
      this.sound.setEnabled(this.speakerOn);
      return;
    }
    if (type === 'down' && this.replay && this.replay.a > 0.5 && this.replayHover()) { location.reload(); return; }
    for (const b of this.buttons) {
      if (b.alpha < 0.5) continue;
      const hit = type === 'key' ? b.id === 'yes' : Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(y - b.y) < b.h / 2 + 3;
      if (!hit) continue;
      if (b.id === 'yes' && this.onYes) { const f = this.onYes; this.onYes = null; f(); return; }
      if (b.id === 'no') { this.escapeNo(x, y); return; }
    }
    if (this.tapWait) {
      const tw = this.tapWait;
      if (type === 'key' || !tw.check || tw.check(x, y)) { this.tapWait = null; tw.res(); }
    }
  }

  escapeNo(px, py) {
    const no = this.buttons.find((b) => b.id === 'no');
    const yes = this.buttons.find((b) => b.id === 'yes');
    if (!no || no.moving) return;
    this.noCount++;
    this.sound.sfx('escape');
    for (let i = 0; i < 10; i++) this.fx.add({ kind: 'bubble', x: no.x + (R() - 0.5) * no.w, y: no.y, vx: (R() - 0.5) * 40, vy: -20 - R() * 40, drag: 1.5, age: 0, life: 1.2, r: 1 + (R() * 2 | 0) });
    if (this.noCount > CONFIG.noEscapes.length) {
      // the "no" gives up and pops
      burstSparks(this.fx, no.x, no.y, 16, { speed: 50, col: '#cfeaff' });
      this.buttons = this.buttons.filter((b) => b !== no);
      if (yes) { yes.w += 8; yes.h += 2; }
      return;
    }
    no.label = CONFIG.noEscapes[(this.noCount - 1) % CONFIG.noEscapes.length];
    no.w = textWidth(no.label) + 14;
    let tx, ty, tries = 0;
    do {
      tx = 20 + R() * (this.W - 40);
      ty = 30 + R() * (this.H - 50);
      tries++;
    } while (tries < 40 && (Math.hypot(tx - px, ty - py) < 70 || (yes && Math.hypot(tx - yes.x, ty - yes.y) < 50) || Math.abs(tx - this.W / 2) < 40));
    const fx0 = no.x, fy0 = no.y;
    no.free = true;
    no.moving = true;
    this.tween(0.45, (k) => { no.x = lerp(fx0, tx, k); no.y = lerp(fy0, ty, k); }, ease.outBack).then(() => { no.moving = false; });
  }

  // --------------------------------------------------------------- draw --
  drawBottle(ctx) {
    const b = this.bottle;
    if (!b) return;
    const aq = this.aq;
    const [sx, sy] = aq.toScreen(b.x, b.y, b.z);
    const img = bottleSprite(b.ang);
    ctx.globalAlpha = b.a;
    if (b.glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.glow * (0.55 + 0.2 * Math.sin(this.t * 3)) * b.a;
      ctx.fillStyle = 'rgba(255,240,200,0.25)';
      for (let r = 14; r > 4; r -= 3) { ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), r, 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = b.a;
    }
    ctx.drawImage(img, Math.round(sx) - img.o, Math.round(sy) - img.o);
    ctx.globalAlpha = 1;
  }

  drawTitle(ctx) {
    const T = this.title;
    const W = this.W, H = this.H;
    const sc = W >= 520 ? 3 : 2;
    const str = CONFIG.title;
    const y = Math.round(H * 0.36);
    const t = this.t;
    const sweep = ((t * 0.35) % 1.6 - 0.3) * textWidth(str) * sc;
    const x0 = Math.round(W / 2 - (textWidth(str) * sc) / 2);
    const cs = chars(str);
    // per-character so we can wave & shimmer
    cs.forEach((ch, i) => {
      const cx = x0 + charX(str, i, sc);
      const dy = Math.round(Math.sin(t * 2 + i * 0.5) * 1.5);
      const lit = Math.abs(cx - x0 - sweep) < 10 * sc;
      drawText(ctx, ch, cx, y + dy, { scale: sc, color: lit ? '#ffffff' : '#d8f0ff', outline: '#0a1a44', shadow: '#ff5a9a', alpha: T.a });
    });
    drawText(ctx, 'for ' + CONFIG.to, W / 2, y + 9 * sc + 8, { align: 'center', color: '#ffb3d4', outline: '#2a0a24', alpha: T.a });
    const h = heartSprite(1);
    ctx.globalAlpha = T.a * (0.7 + 0.3 * Math.sin(t * 4));
    ctx.drawImage(h, Math.round(W / 2 - h.ox), Math.round(y - 14 - h.oy + Math.sin(t * 2) * 2));
    ctx.globalAlpha = 1;
  }

  drawHint(ctx) {
    const h = this.hint;
    const a = h.a * (0.7 + 0.3 * Math.sin(this.t * 3.2));
    const y = h.y();
    const w = textWidth(h.text);
    const cx = clamp(h.x ? h.x() : this.W / 2, w / 2 + 16, this.W - w / 2 - 16);
    drawText(ctx, h.text, cx, y, { align: 'center', color: '#ffffff', outline: '#08183c', alpha: a });
    const b = bubbleSprite(2);
    ctx.globalAlpha = a;
    ctx.drawImage(b, Math.round(cx - w / 2 - 10) - b.o, y + 3 - b.o + Math.round(Math.sin(this.t * 4) * 1.5));
    ctx.drawImage(b, Math.round(cx + w / 2 + 9) - b.o, y + 3 - b.o + Math.round(Math.cos(this.t * 4) * 1.5));
    ctx.globalAlpha = 1;
  }

  drawLetter(ctx) {
    const L = this.letter;
    const W = this.W, H = this.H;
    const open = clamp(L.open, 0, 1.1);
    const vis = Math.max(2, Math.round(L.h * Math.min(1, open)));
    const x = Math.round(W / 2 - L.w / 2);
    const yc = Math.round(H / 2);
    const y0 = yc - Math.round(vis / 2);
    // soft drop shadow
    ctx.fillStyle = 'rgba(2,8,30,0.35)';
    ctx.fillRect(x + 3, y0 + 4, L.w, vis);
    ctx.drawImage(L.paper, 0, Math.round((L.h - vis) / 2), L.w, vis, x, y0, L.w, vis);
    // water caustics dancing on the paper
    const caus = this.aq.caustics[Math.floor(this.t * 8) % this.aq.caustics.length];
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y0, L.w, vis); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07;
    for (let yy = y0 - ((this.t * 4) % 96); yy < y0 + vis; yy += 96) for (let xx = x; xx < x + L.w; xx += 96) ctx.drawImage(caus, Math.round(xx), Math.round(yy));
    ctx.restore();
    ctx.globalAlpha = 1;
    drawRoll(ctx, x, y0 - 1, L.w);
    drawRoll(ctx, x, y0 + vis, L.w);
    if (L.open < 0.98) return;
    // typed text
    let n = Math.floor(L.n);
    const top = y0 + 18;
    L.lines.forEach((line, i) => {
      if (n <= 0) return;
      const len = chars(line).length;
      const special = i === 0 || i === L.lines.length - 1;
      drawText(ctx, line, x + 17, top + i * L.lh, { color: special ? '#b8285a' : '#3e2544', count: n });
      if (n < len && n > 0 && Math.floor(this.t * 6) % 2 === 0) {
        const cx = x + 17 + charX(line, n);
        ctx.fillStyle = '#b8285a';
        ctx.fillRect(cx, top + i * L.lh + 7, 3, 1);
      }
      n -= len;
    });
    if (L.seal > 0) {
      ctx.globalAlpha = clamp(L.seal);
      drawSeal(ctx, x + L.w - 20, y0 + vis - 16 + Math.round((1 - clamp(L.seal)) * -6), this.t);
      ctx.globalAlpha = 1;
    }
  }

  drawQuestion(ctx) {
    const Q = this.question;
    const str = fill(CONFIG.question);
    const sc = this.W >= 360 && textWidth(str) * 2 < this.W - 20 ? 2 : 1;
    const wt = this.aq.curves.top(0) - 4;
    const y = Math.max(8, Math.round(wt / 2 - (7 * sc) / 2) - 2);
    const t = this.t;
    drawText(ctx, str, this.W / 2, y, {
      scale: sc, align: 'center', color: '#ffffff', outline: '#3a0a2a', shadow: '#ff5a9a', alpha: Q.a,
      wave: (i) => Math.sin(t * 3 - i * 0.45) * 1.6,
    });
  }

  drawFinale(ctx) {
    const F = this.finale;
    const str = fill(CONFIG.finale);
    const sc = textWidth(str) * 3 < this.W - 24 ? 3 : textWidth(str) * 2 < this.W - 16 ? 2 : 1;
    const wt = this.aq.curves.top(0) - 4;
    const y = Math.max(6, Math.round(wt / 2 - (7 * sc) / 2) - 5);
    const t = this.t;
    drawText(ctx, str, this.W / 2, y, {
      scale: sc, align: 'center', color: '#fff4fa', outline: '#4a0a30', shadow: '#ff4f98', alpha: F.a,
      wave: (i) => Math.sin(t * 2.4 - i * 0.5) * 1.5,
    });
    drawText(ctx, fill(CONFIG.finaleSub), this.W / 2, y + 7 * sc + 6, { align: 'center', color: '#ffc4e0', outline: '#2a0a24', alpha: F.a * 0.9 });
  }

  draw(ctx) {
    this.fxBack.draw(ctx);
    if (this.title) this.drawTitle(ctx);
    if (this.letter) this.drawLetter(ctx);
    if (this.question) this.drawQuestion(ctx);
    for (const b of this.buttons) drawBubbleButton(ctx, b, this.t);
    if (this.finale) this.drawFinale(ctx);
    if (this.hint) this.drawHint(ctx);
    this.fx.draw(ctx);
    if (this.trans) this.trans.draw(ctx);
    if (this.replay) {
      const [x, y, w] = this.replayRect();
      const hv = this.replayHover();
      drawText(ctx, '♥ replay', x + w / 2, y + 2, { align: 'center', color: hv ? '#ffffff' : '#ffb3d4', outline: '#2a0a24', alpha: this.replay.a * (hv ? 1 : 0.75) });
    }
    if (this.showSpeaker) { const [x, y] = this.speakerRect(); drawSpeaker(ctx, x + 2, y + 2, this.speakerOn, this.speakerHover()); }
  }
}
