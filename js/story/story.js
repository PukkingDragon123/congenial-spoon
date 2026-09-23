// The director: choreographs the whole confession as an async script.
import { TAU, clamp, lerp, ease, R, heartPoint, heartArc } from '../util.js';
import { CONFIG, fill } from '../config.js';
import { CX, CY } from '../world/scene.js';
import { Creature } from '../world/creatures.js';
import { Particles, burstSparks, burstHearts, burstStars, popRing, bubbleSprite } from '../world/fx.js';
import { drawText, textWidth, textPixelsBold, wrap, chars, charX, glyph, LINE_H } from '../font.js';

const glyphW = (ch) => glyph(ch).w;
import { bottleSprite, makePaper, drawRoll, drawSeal, drawBubbleButton, drawSpeaker, Sweep, BubbleCurtain, LightBloom } from './ui.js';
import { SoundEngine } from '../audio.js';

const WHALE_Z = 0.36;

export class Story {
  constructor(aq, post, opts = {}) {
    this.aq = aq;
    this.post = post;
    this.t = 0;
    this.timers = [];
    this.tweens = [];
    this.fx = new Particles();
    this.fxBack = new Particles();
    this.sound = new SoundEngine(CONFIG.sound, CONFIG.music);
    this.rooms = opts.rooms || {};
    this.stage = this.rooms.jelly || aq;   // whichever tank is on screen
    this.camX = CX - 260;
    this.camY = 0; // offset from the aquarium's base camera height
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
    // song-synced state
    this.songOffset = 0;
    this.lyricQueue = (CONFIG.lyrics || []).map(([t, text, band]) => ({ t, text, band: band || 'high' }));
    this.lyrics = [];
    this.waveAcc = 0;
    this.hud = false;
    this.stage.cam.x = this.camX;
    aq.couple.mode = 'walk';
    this.stage.coupleX = CX - 330;
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

  // ---- the song's clock: every story beat is pinned to a moment in the track
  get songT() { return this.sound.time + this.songOffset; }
  atSong(t) { return this.until(() => this.songT >= t); }
  // Resolves on a tap, or on its own when the song reaches `t`.
  tapOrSong(t, check = null) {
    return new Promise((res) => {
      let done = false;
      const finish = (how) => { if (done) return; done = true; this.tapWait = null; res(how); };
      this.tapWait = { check, res: () => finish('tap') };
      this.until(() => done || this.songT >= t).then(() => finish('time'));
    });
  }

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
      await this.mainReady;
      this.post.p.blur = 0; this.post.p.dim = 0;
      const jump = { jelly: 8, reef: 23, tunnel: 41, hook: 55.5, bottle: 90, letter: 110, question: 136, finale: 151 };
      this.songOffset = jump[debug] ?? 0;
      this.sound.start();
      this.showSpeaker = CONFIG.sound;
      const order = ['jelly', 'reef', 'tunnel', 'hook', 'bottle', 'letter', 'question', 'finale'];
      const from = Math.max(0, order.indexOf(debug));
      this.hud = from < 3;
      if (from === 0) this.enterRoom(this.rooms.jelly, CX - 260, CX - 320);
      if (from === 1) this.enterRoom(this.rooms.reef, CX - 160, CX - 220);
      if (from >= 4) this.enterMainTank();
      if (from <= 0) await this.jellyScene();
      if (from <= 1) await this.reefScene();
      if (from <= 2) await this.tunnelScene();
      if (from <= 3) await this.hookScene();
      if (from <= 4) await this.bottleScene();
      if (from <= 5) await this.letterScene();
      if (from <= 6) await this.questionScene();
      await this.finaleScene();
      return;
    }
    await this.titleScene();
    await this.dive();
    await this.jellyScene();
    await this.reefScene();
    await this.tunnelScene();
    await this.hookScene();
    await this.bottleScene();
    await this.letterScene();
    await this.questionScene();
    await this.finaleScene();
  }

  // Switch which tank is on screen (call while a transition covers it).
  setStage(st) {
    this.stage = st;
    st.cam.x = this.camX;
    st.cam.y = st.camY0;
    st.waves.length = 0;
  }

  // Swap tanks under a transition, then wait for it to clear.
  async go(st, trans, onSwap = null) {
    this.trans = trans;
    await this.until(() => trans.covered());
    this.setStage(st);
    if (onSwap) onSwap();
    await this.until(() => trans.done);
    if (this.trans === trans) this.trans = null;
  }

  // Walk the couple to x1, timed to arrive as the song reaches `until`.
  walkTo(x1, until) {
    const st = this.stage, c = this.aq.couple;
    c.mode = 'walk';
    return this.until(() => {
      const d = x1 - st.coupleX;
      const remain = Math.max(0.35, until - this.songT);
      const v = clamp(d / remain, 0, 40);
      const dt = this.dt || 0.016;
      const step = Math.min(d, v * dt);
      st.coupleX += step;
      c.walk += step / 8;
      c.moving = clamp(v / 22);
      if (d < 0.5 || this.songT >= until) { st.coupleX = x1; c.moving = 0; return true; }
      return false;
    });
  }

  async turnToGlass() {
    const c = this.aq.couple;
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'back';
    await this.tween(0.2, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
  }

  heartPop(st, x, y, big = false) {
    this.sound.sfx('heart');
    st.fx.add({ kind: 'heart', x, y, z: 0, vx: 0, vy: -16, drag: 0.4, age: 0, life: 3.2, size: big ? 3 : 2, ph: 0, wob: 8, wobF: 2 });
    burstStars(st.fx, x, y, big ? 12 : 8, { speed: 34, size: 5 });
    popRing(st.fx, x, y, { r1: big ? 40 : 26, col: '#ffc4e0' });
    for (let i = 0; i < 14; i++) {
      const a = R() * TAU, sp = 20 + R() * 20;
      st.fx.add({ kind: 'spark', x, y, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.5, age: 0, life: 0.8 + R() * 0.5, size: 1 + (R() * 2 | 0), col: R() < 0.5 ? '#ffffff' : '#ffc4e0' });
    }
  }

  async titleScene() {
    this.title = { a: 0 };
    { const T = this.title; this.tween(1.8, (k) => { if (T.a < 1 && this.title === T && !this.diving) T.a = k; }, ease.outCubic); }
    await this.wait(0.6);
    this.hint = { text: CONFIG.tapToBegin, y: () => Math.round(this.H * 0.66), a: 0 };
    { const h = this.hint; this.tween(0.8, (k) => { h.a = k; }); }
    this.sound.armed = true; // the next tap starts the song inside the tap itself
    await this.waitTap();
    this.hint = null;
    this.sound.start();      // no-op if the tap already started it
    this.showSpeaker = CONFIG.sound;
  }

  // The plunge: a swell of bubbles, then an arched wall of foam sweeps up and
  // reveals the jellyfish hall while the water wobbles.
  async dive() {
    const p = this.post.p;
    await this.atSong(4.5);
    this.diving = true;
    this.sound.sfx('dive');
    for (let i = 0; i < 90; i++) {
      this.fxBack.add({ kind: 'bubble', x: R() * this.W, y: this.H + 4 + R() * 60, vx: (R() - 0.5) * 8, vy: -50 - R() * 90, age: 0, life: 4, r: R() < 0.55 ? 1 : R() < 0.9 ? 2 : 3, wob: 9, wobF: 4, ph: R() * TAU, alpha: 0.8, fade: false });
    }
    this.tween(1.4, (k) => { p.warp = k * 0.7; });
    await this.atSong(5.8);
    const tr = new BubbleCurtain(this.W, this.H, 3.2);
    this.trans = tr;
    this.tween(3.2, (k) => {
      p.warp = 0.7 + Math.sin(k * Math.PI) * 1.4;
      p.blur = 1 - ease.inOutSine(k);
      p.dim = 0.4 * (1 - ease.inOutSine(k));
      if (this.title) this.title.a = 1 - clamp(k * 2.6);
    });
    await this.until(() => tr.covered());
    this.title = null;
    this.fxBack.clear();
    this.enterRoom(this.rooms.jelly || this.aq, CX - 260, CX - 320);
    this.hud = true;
    this.stage.sendWave(CX - 700, 1, { speed: 900, amp: 7, width: 220, life: 3 });
    await this.until(() => tr.done);
    this.trans = null;
    this.tween(1.4, (k) => { p.warp = 0.7 * (1 - k); });
  }

  // Tap a creature and it reacts with a little sparkle.
  tapCreature(x, y) {
    const st = this.stage;
    let best = null, bd = 1e9;
    for (const c of st.creatures) {
      const [sx, sy] = st.toScreen(c.x, c.y - (c.kind === 'crab' ? 5 : 0), c.z);
      const r = Math.max(9, (c.len || c.size || 16) * 0.45);
      const d = Math.hypot(sx - x, sy - y);
      if (d < r && d < bd) { bd = d; best = c; }
    }
    if (!best) {
      // a tap in empty water still makes a splash
      popRing(this.fx, x, y, { r1: 12, life: 0.4 });
      for (let i = 0; i < 4; i++) this.fx.add({ kind: 'bubble', x, y, vx: (R() - 0.5) * 30, vy: -20 - R() * 30, drag: 1.5, age: 0, life: 1, r: 1 + (R() * 2 | 0) });
      this.sound.sfx('escape');
      return;
    }
    best.react(best.x + (R() - 0.5) * 4, best.y + 8, 0.9);
    if (best.kind === 'crab') best.hop = 1;
    if (best.kind === 'jelly') best.lit = 1.6;
    popRing(this.fx, x, y, { r1: 18, col: '#ffe0f0' });
    burstStars(this.fx, x, y, 6, { speed: 40, size: 4 });
    this.sound.sfx('pop');
  }

  // Put the couple at the big window.
  enterMainTank(together = true) {
    const aq = this.aq, c = aq.couple;
    this.camX = CX;
    this.setStage(aq);
    aq.coupleX = CX;
    c.flip = 1; c.moving = 0; c.mode = 'back'; c.hug = 0;
    c.hold = together ? 1 : 0; c.lean = together ? 1 : 0;
  }

  // Walk into a gallery from the left.
  enterRoom(room, camFrom, coupleFrom) {
    const c = this.aq.couple;
    this.camX = camFrom;
    this.setStage(room);
    room.cam.x = camFrom;
    room.coupleX = coupleFrom;
    c.hold = 0; c.lean = 0; c.hug = 0; c.mode = 'walk'; c.flip = 1;
  }

  // Chapter 1: the jellyfish hall. Just two people visiting an aquarium.
  async jellyScene() {
    const c = this.aq.couple;
    this.tween(14, (k) => { this.camX = lerp(CX - 260, CX, k); }, ease.inOutSine);
    await this.atSong(8.5);
    await this.walkTo(CX, 16);
    await this.turnToGlass();
    await this.atSong(19.6);
    await this.tween(2.4, (k) => { c.hold = k; }, ease.inOutCubic);
    this.tween(2.6, (k) => { c.lean = k; }, ease.inOutSine);
  }

  // Chapter 2: the clownfish reef.
  async reefScene() {
    const reef = this.rooms.reef;
    const c = this.aq.couple;
    if (reef && this.stage !== reef) {
      await this.atSong(23.6);
      this.sound.sfx('chime');
      await this.go(reef, new LightBloom(this.W, this.H, 2.6, [190, 240, 255]), () => this.enterRoom(reef, CX - 160, CX - 220));
    }
    this.tween(10, (k) => { this.camX = lerp(CX - 160, CX, k); }, ease.inOutSine);
    await this.walkTo(CX - 20, 29.5);
    await this.turnToGlass();
    await this.tween(1.6, (k) => { c.hold = k; }, ease.inOutCubic);
    await this.atSong(37.6);
    this.heartPop(this.stage, this.stage.coupleX, this.stage.coupleY - 34);
    this.tween(2.4, (k) => { c.lean = k; }, ease.inOutSine);
  }

  // Chapter 3: the underwater tunnel, walking toward the light.
  async tunnelScene() {
    const tun = this.rooms.tunnel;
    const c = this.aq.couple;
    if (!tun) return;
    await this.atSong(41.6);
    this.sound.sfx('whoosh');
    await this.go(tun, new Sweep(this.W, this.H, 2.9), () => {
      this.camX = CX;
      this.setStage(tun);
      c.mode = 'back'; c.hold = 1; c.lean = 0.6; c.flip = 1;
      tun.coupleScale = 1.18; tun.walkSpeed = 0.5; tun.endGlow = 0;
    });
    this.tween(12, (k) => { tun.coupleScale = 1.18 - 0.2 * k; this.camX = CX + Math.sin(k * 3) * 30; });
    await this.atSong(46.5);
    // little hearts drift up around them in the tunnel light
    for (let i = 0; i < 6; i++) this.fx.add({ kind: 'heart', x: this.W / 2 + (R() - 0.5) * 50, y: this.H * 0.8, vx: (R() - 0.5) * 8, vy: -10 - R() * 8, age: 0, life: 4, size: R() < 0.6 ? 0 : 1, ph: R() * TAU, wob: 8, wobF: 2, fin: 0.6, alpha: 0.85 });
    await this.atSong(49.5);
    this.tween(4.5, (k) => { tun.endGlow = k; }, ease.inOutSine);
    await this.atSong(53.6);
  }

  // The hook: out of the tunnel into the great Buddha tank, and the game
  // stops pretending. The minnows rush into a heart right on the chorus.
  async hookScene() {
    const aq = this.aq, c = aq.couple, p = this.post.p;
    await this.atSong(54.0);
    await this.mainReady;
    this.sound.sfx('chime');
    const s = Math.min(96, this.W * 0.36);
    const cx = CX + 34, cy = 146, cz = 0.3;
    let glow;
    await this.go(aq, new LightBloom(this.W, this.H, 2.6, [240, 250, 255]), () => {
      this.enterMainTank(false);
      this.hud = false;
      // the minnows scatter wide, then pour into the heart
      for (const f of aq.bait) { f.x = cx + (R() - 0.5) * 600; f.y = 60 + R() * 200; }
      this.formHeart(aq.bait, cx, cy, cz, s, aq.t, true);
      for (const f of aq.bait) f.formFace = 0;
      glow = { x: cx, y: cy + 14, z: 0.34, r: Math.round(s * 1.5), col: '#ff5aa0', a: 0, beat: true };
      aq.glows.push(glow);
      this.tween(2.8, (k) => { for (const f of aq.bait) f.formK = k; glow.a = 0.5 * k; }, ease.inOutSine);
    });
    await this.atSong(57.9);
    // she turns to him; he turns to her
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'face'; c.hands = 1; c.hug = 0;
    await this.tween(0.22, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
    this.heartPop(aq, aq.coupleX, aq.coupleY - 62, true);
    this.sound.sfx('sparkle');
    this.heartSparkle = { cx, cy, cz, s };
    this.tween(3, (k) => { p.tint = [1 + 0.06 * k, 1 - 0.01 * k, 1 + 0.03 * k]; p.bloom = 0.75 + 0.3 * k; });
    aq.sendWave(CX - 800, 1, { speed: 780, amp: 6, width: 200, life: 3 });
    burstStars(aq.fx, cx, cy, 18, { speed: 70, size: 6 });
    this.chorus = true;
    this.heartRain = 0.5;
    const crabs = aq.crabs || [];
    await this.atSong(62.0);
    crabs.forEach((k, i) => {
      const u = crabs.length > 1 ? i / (crabs.length - 1) - 0.5 : 0;
      k.form = [cx - 6 + u * 320, 0.05 + Math.abs(u) * 0.2];
    });
    await this.atSong(72.0);
    this.tween(1.6, (k) => { c.hug = 0.35 * k; }, ease.inOutSine);
    await this.atSong(78.0);
    for (let i = 0; i < 4; i++) this.spawnJelly();
    await this.atSong(88.0);
    this.chorus = false;
    this.heartSparkle = null;
    this.heartRain = 0;
    this.releaseForm(aq.bait, 40, [cx, cy + 14]);
    for (const k of crabs) { k.form = null; k.react(cx, aq.floorY(0.1), 0.8); }
    this.tween(2, (k) => { glow.a = 0.5 * (1 - k); p.tint = [1.06 - 0.03 * k, 0.99, 1.03 - 0.015 * k]; }).then(() => { aq.glows.splice(aq.glows.indexOf(glow), 1); });
    // back to the glass, hand in hand now
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'back'; c.hold = 1; c.lean = 0; c.hug = 0;
    await this.tween(0.22, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
    this.tween(3, (k) => { c.lean = k; }, ease.inOutSine);
  }

  formHeart(fish, cx, cy, cz, s, t0, full = false, center = null) {
    // a thick outline of nested hearts, each circulating the other way; fish
    // are spaced by arc length so none bunch up at the tip or the dip
    const rings = full ? [[1, 0.36], [0.92, 0.33], [0.84, 0.31]] : [[1, 0.46], [0.88, 0.32], [0.76, 0.22]];
    const MIDY = 0.12; // the heart's visual centre in heart units
    let idx = 0;
    const n = fish.length;
    rings.forEach(([sc, frac], j) => {
      const cnt = j === rings.length - 1 ? n - idx : Math.round(n * frac);
      const dir = j % 2 ? -1 : 1;
      const loops = 0.03 / sc; // laps per second
      for (let i = 0; i < cnt && idx < n; i++, idx++) {
        const f = fish[idx];
        const u0 = i / cnt + j * 0.13;
        const zo = cz + (j - 1) * 0.012 + Math.sin(u0 * TAU * 3) * 0.008;
        f.form = (t) => {
          const [hx, hy] = heartArc(u0 + dir * loops * (t - t0));
          const [ox, oy] = center ? center(t) : [cx, cy];
          return [ox + hx * s * sc, oy + (MIDY + (hy - MIDY) * sc) * s, zo];
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

  async bottleScene() {
    const aq = this.aq;
    await this.atSong(91.0);
    const b = (this.bottle = { x: CX - 58, y: aq.yTop - 40, z: 0.05, ang: 0.6, a: 1, base: 196, glow: 0, bob: 0, landed: false });
    const self = this;
    b.draw = (ctx) => self.drawBottle(ctx);
    aq.extras = [b];
    this.sound.sfx('whoosh');
    await this.tween(7.0, (k) => {
      b.y = lerp(aq.yTop - 40, b.base, ease.outCubic(k));
      b.ang = 0.6 * Math.cos(k * 7) * (1 - k) + 0.1;
      if (R() < 0.5) aq.bubbles.add({ kind: 'bubble', x: b.x + (R() - 0.5) * 8, y: b.y - 6, z: b.z, vx: 0, vy: -20 - R() * 20, age: 0, life: 6, r: R() < 0.7 ? 1 : 2, wob: 8, wobF: 5, ph: R() * TAU, fade: false });
    });
    b.landed = true;
    aq.startle(b.x, b.y, 200, 0.6);
    this.tween(1, (k) => { b.glow = k; });
    await this.wait(0.8);
    this.hint = { text: 'tap the bottle', y: () => Math.round(aq.toScreen(b.x, b.y, b.z)[1] + 26), x: () => Math.round(aq.toScreen(b.x, b.y, b.z)[0]), a: 0 };
    { const h = this.hint; this.tween(0.6, (k) => { h.a = k; }); }
    this.bottleHot = true;
    // opens on a tap, or by itself when the verse runs out
    await this.tapOrSong(111.0, (x, y) => {
      const [bx, by] = aq.toScreen(b.x, b.y, b.z);
      return Math.hypot(x - bx, y - by) < 36;
    });
    this.bottleHot = false;
    this.hint = null;
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
    // type at a pace that fills the second verse
    this.letter.rate = clamp(this.letter.total / Math.max(6, 128 - this.songT), 10, 32);
    this.letter.typing = true;
    await this.until(() => this.letter.done);
    this.sound.sfx('chime');
    { const L = this.letter; await this.tween(0.5, (k) => { L.seal = k; }, ease.outBack); }
    await this.wait(0.8);
    this.hint = { text: 'tap to continue', y: () => Math.min(this.H - 8, Math.round(this.H / 2 + this.letter.h / 2 + 12)), a: 0 };
    { const h = this.hint; this.tween(0.6, (k) => { h.a = k; }); }
    await this.tapOrSong(134.2);
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
    // the big lift: foam rushes up and the tank comes back bright for the chorus
    await this.atSong(Math.min(134.4, this.songT + 0.1));
    this.sound.sfx('dive');
    const sw = new BubbleCurtain(this.W, this.H, 3.0);
    this.trans = sw;
    this.tween(3.0, (k) => { p.warp = Math.sin(k * Math.PI) * 1.2; });
    await this.until(() => sw.covered());
    this.letter = null;
    p.blur = 0; p.dim = 0; p.uiGlow = 0.55; p.rip[3] = 0;
    c.mode = 'face'; c.hands = 1; c.hold = 0; c.lean = 0; c.hug = 0;
    this.camX = CX; aq.cam.x = CX;
    const words = this.formWords(CONFIG.fishWords);
    this.trevPath = aq.trevSchool.path;
    aq.trevSchool.path = (t) => [CX + Math.sin(t * 0.1) * 260, 222 + Math.sin(t * 0.3) * 10, 0.62];
    await this.until(() => sw.done);
    this.trans = null;
    p.warp = 0;
    await this.tween(3.0, (k) => { for (const f of words.fish) { f.formK = k; f.glowA = k; } words.glow.a = 0.3 * k; }, ease.inOutSine);
    this.sound.sfx('sparkle');
    this.chorus = true;
    aq.sendWave(CX - 800, 1, { speed: 820, amp: 6, width: 220, life: 3 });
    burstStars(aq.fx, words.center[0], words.center[1], 18, { speed: 80, size: 6 });
    await this.atSong(144.0);
    // the room goes quiet around them: a soft spotlight, hearts drifting up
    this.tween(2.5, (k) => { p.vig = 0.55 + 0.4 * k; p.dim = 0.14 * k; p.tint = [1 + 0.05 * k, 0.99, 1 + 0.03 * k]; }, ease.inOutSine);
    this.heartRain = 0.5;
    this.question = { a: 0 };
    { const Q = this.question; this.tween(1, (k) => { Q.a = k; }, ease.outCubic); }
    await this.atSong(147.0);
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
    this.tween(1.5, (k) => { p.vig = 0.95 - 0.4 * k; p.dim = 0.14 * (1 - k); });
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
    if (this.trevPath) aq.trevSchool.path = this.trevPath;
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
    // the ending: a whale shark glides out of the blue carrying a heart of
    // minnows on its back, the trevally circling it like a halo
    this.chorus = true;
    this.jellyLoop = true;
    this.heartRain = 1;
    for (let i = 0; i < 7; i++) this.spawnJelly(true);
    const crabs = aq.crabs || [];
    crabs.forEach((k, i) => { const u = crabs.length > 1 ? i / (crabs.length - 1) - 0.5 : 0; k.form = [CX + u * 260, 0.05 + Math.abs(u) * 0.16]; });
    this.tween(4, (k) => { aq.light = 1 + 0.35 * k; });
    await this.wait(1.2);
    const whale = aq.spawnWhaleShark();
    whale.x = CX + this.W / 2 + 170;
    // slower on narrow screens so it stays in view for the chorus
    whale.speed = clamp(this.W * 0.045, 11, 21);
    whale.vx = -whale.speed;
    this.sound.sfx('chime');
    const s = Math.min(46, this.W * 0.2);
    const center = () => [whale.x - 24, whale.y - 60];
    this.formHeart(aq.bait, 0, 0, WHALE_Z - 0.05, s, aq.t, true, center);
    for (const f of aq.bait) f.formFace = 0;
    const glow = { x: 0, y: 0, z: WHALE_Z - 0.04, r: Math.round(s * 1.6), col: '#ff5aa0', a: 0, beat: true };
    aq.glows.push(glow);
    this.whaleGlow = { glow, center };
    this.heartSparkle = { cx: 0, cy: 0, cz: WHALE_Z - 0.06, s };
    this.tween(4, (k) => { for (const f of aq.bait) f.formK = k; glow.a = 0.45 * k; }, ease.inOutSine);
    this.trevPath = this.trevPath || aq.trevSchool.path;
    aq.trevSchool.path = (t) => [whale.x + Math.cos(t * 0.7) * 170, whale.y + Math.sin(t * 0.7) * 46, WHALE_Z + 0.06 + Math.sin(t * 0.7) * 0.12];
    await this.wait(2.2);
    this.finale = { a: 0 };
    { const F = this.finale; this.tween(1.6, (k) => { F.a = k; }, ease.outCubic); }
    // as the whale reaches them, everything answers
    await this.until(() => whale.x < CX + 40);
    this.heartPop(aq, aq.coupleX, aq.coupleY - 70, true);
    aq.startle(whale.x, whale.y, 260, 0.5);
    aq.sendWave(CX + 700, -1, { speed: 600, amp: 7, width: 240, life: 3.5 });
    // the song winds down; the light softens and the replay appears
    await this.until(() => this.songT >= 203 || whale.x < CX - this.W / 2 - 200);
    // the minnows leave the whale and come home to frame the Buddha
    this.whaleGlow = null;
    this.formHeart(aq.bait, CX + 34, 146, 0.3, Math.min(96, this.W * 0.36), aq.t, true);
    for (const f of aq.bait) f.formFace = 0;
    glow.x = CX + 34; glow.y = 160;
    this.heartSparkle = { cx: CX + 34, cy: 146, cz: 0.3, s: Math.min(96, this.W * 0.36) };
    this.tween(5, (k) => { for (const f of aq.bait) f.formK = k; }, ease.inOutSine);
    await this.atSong(203);
    this.chorus = false;
    this.tween(8, (k) => { aq.light = 1.35 - 0.3 * k; p.bloom = 1 - 0.15 * k; });
    await this.wait(3);
    this.replay = { a: 0 };
    { const Rp = this.replay; this.tween(1, (k) => { Rp.a = k; }); }
  }

  // ------------------------------------------------------------ lyrics --
  // Each line floats up letter by letter, every letter in its own bubble,
  // drifts a moment, then the bubbles pop one after another.
  updateLyrics(dt) {
    const t = this.songT;
    while (this.lyricQueue.length && this.lyricQueue[0].t <= t) {
      const L = this.lyricQueue.shift();
      if (t - L.t < 2.5 && this.sound.playing) this.spawnLyric(L, this.lyricQueue.length ? this.lyricQueue[0].t - L.t : 6);
    }
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      const L = this.lyrics[i];
      L.age += dt;
      if (!L.popped && L.age > L.life) {
        L.popped = true;
        L.popAt = L.age;
      }
      if (L.popped) {
        // pop the bubbles left to right
        const n = L.cs.length;
        const k = Math.floor((L.age - L.popAt) / 0.045);
        while (L.nPop < Math.min(n, k)) {
          const j = L.nPop++;
          if (L.cs[j] === ' ') continue;
          const [x, y] = this.lyricPos(L, j);
          popRing(this.fx, x, y, { r1: 6 + L.sc * 3, life: 0.35, col: '#dff6ff' });
          for (let q = 0; q < 2; q++) this.fx.add({ kind: 'bubble', x: x + (R() - 0.5) * 6, y, vx: (R() - 0.5) * 20, vy: -20 - R() * 30, drag: 1.5, age: 0, life: 1 + R(), r: 1 + (R() * 2 | 0), wob: 8, wobF: 5, ph: R() * TAU });
        }
        if (L.nPop >= n) this.lyrics.splice(i, 1);
      } else if (R() < dt * 4) {
        const j = (R() * L.cs.length) | 0;
        const [x, y] = this.lyricPos(L, j);
        this.fx.add({ kind: 'bubble', x, y: y - L.r, vx: 0, vy: -12 - R() * 12, age: 0, life: 1.6, r: 1, wob: 6, wobF: 4, ph: R() * TAU, alpha: 0.8 });
      }
    }
  }

  spawnLyric(L, gap = 6) {
    const text = fill(L.text);
    const cs = chars(text);
    let sc = textWidth(text) * 2 + 40 < this.W * (L.band === 'low' ? 0.46 : 0.9) ? 2 : 1;
    const st = this.stage;
    const top = st.curves ? st.curves.top(this.W / 2) : 30;
    const sill = st.curves && st.curves.sill ? st.curves.sill(this.W / 2) : this.H * 0.8;
    const high = L.band !== 'low' && !this.question && !this.finale;
    this.lyricSide = -(this.lyricSide || 1);
    const w = textWidth(text) * sc;
    const half = w / 2 + 8;
    let x = high ? this.W / 2 : this.W / 2 + this.lyricSide * this.W * 0.25;
    x = half * 2 > this.W ? this.W / 2 : clamp(x, half, this.W - half);
    const y = high ? Math.max(14, top + 18) : sill - 34;
    this.lyrics.push({ text, cs, sc, x, y, r: Math.round(3.2 * sc + 0.5), age: 0, life: clamp(gap - 0.9, 2.6, 5.4), love: L.t >= 57.5, popped: false, nPop: 0, w });
  }

  lyricPos(L, i) {
    const x0 = L.x - L.w / 2;
    const t = this.t;
    const g = glyphW(L.cs[i]) * L.sc;
    return [x0 + charX(L.text, i, L.sc) + g / 2 + Math.sin(t * 1.3 + i) * 0.6, L.y - L.age * 2 + Math.sin(t * 2.2 + i * 0.7) * 1.6];
  }

  drawLyrics(ctx) {
    for (const L of this.lyrics) {
      L.cs.forEach((ch, i) => {
        if (ch === ' ') return;
        if (L.popped && i < L.nPop) return;
        const a = clamp((L.age - i * 0.06) / 0.35);
        if (a <= 0) return;
        const [x, y] = this.lyricPos(L, i);
        const yy = y + (1 - ease.outCubic(a)) * 12;
        const b = bubbleSprite(L.r);
        ctx.globalAlpha = a * 0.7;
        ctx.drawImage(b, Math.round(x) - b.o, Math.round(yy + 3.5 * L.sc) - b.o);
        drawText(ctx, ch, Math.round(x), Math.round(yy), L.love
          ? { align: 'center', scale: L.sc, color: '#fff0f7', outline: '#4a0a30', shadow: '#ff6aa6', alpha: a }
          : { align: 'center', scale: L.sc, color: '#f2fbff', outline: '#0b2a5c', shadow: '#5ac0ff', alpha: a });
      });
    }
    ctx.globalAlpha = 1;
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
    const aq = this.aq, st = this.stage, snd = this.sound;
    // camera: smooth follow with a gentle floating drift that breathes on the beat
    st.cam.x += (this.camX + Math.sin(this.t * 0.21) * 3 - st.cam.x) * Math.min(1, dt * 3);
    st.cam.y += (st.camY0 + this.camY + Math.sin(this.t * 0.17) * 1.5 - snd.pulse * 1.2 - st.cam.y) * Math.min(1, dt * 3);
    // the music reaches into the tank
    st.pulse = snd.pulse;
    st.energy = snd.level;
    if (!this.letter) this.post.p.bloom = lerp(this.post.p.bloom, 0.75 + snd.level * 0.35 + snd.pulse * 0.15, Math.min(1, dt * 4));
    if (this.chorus && snd.pulse === 1) {
      this.waveAcc++;
      if (this.waveAcc % 4 === 0) st.sendWave(this.waveAcc % 8 === 0 ? st.cam.x - 700 : st.cam.x + 700, this.waveAcc % 8 === 0 ? 1 : -1, { speed: 720, amp: 4, width: 170, life: 3 });
      for (const k of aq.crabs || []) if (k.form) k.hop = 0.7;
    }
    if (this.whaleGlow) {
      const [x, y] = this.whaleGlow.center();
      this.whaleGlow.glow.x = x; this.whaleGlow.glow.y = y + 10;
      if (this.heartSparkle) { this.heartSparkle.cx = x; this.heartSparkle.cy = y; }
    }
    this.updateLyrics(dt);
    for (const k of st.creatures) if (k.lit) k.lit = Math.max(0, k.lit - dt * 0.6);
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
      this.letter.n += dt * (this.letter.rate || 32);
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
      if (type === 'key' || !tw.check || tw.check(x, y)) { this.tapWait = null; tw.res(); return; }
    }
    if (type === 'down' && this.hud && !this.trans && !this.letter) this.tapCreature(x, y);
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
    const str = CONFIG.title;
    const sc = textWidth(str) * 3 < W - 20 ? 3 : textWidth(str) * 2 < W - 12 ? 2 : 1;
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
    const sc = textWidth(str) * 2 < this.W - 20 ? 2 : 1;
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
    this.drawLyrics(ctx);
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
