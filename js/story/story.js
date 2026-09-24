// The director: choreographs the whole confession as an async script.
import { TAU, clamp, lerp, ease, R, heartPoint, heartArc } from '../util.js';
import { CONFIG, fill } from '../config.js';
import { CX, CY } from '../world/scene.js';
import { Creature, sizeAt } from '../world/creatures.js';
import { queueVariants } from '../art/fish.js';
import { Particles, burstSparks, burstHearts, burstStars, popRing, bubbleSprite } from '../world/fx.js';
import { drawText, textWidth, textPixels, textPixelsBold, wrap, chars, charX, LINE_H } from '../font.js';
import { bottleSprite, makePaper, drawRoll, drawSeal, drawBubbleButton, drawSpeaker, Sweep, BubbleCurtain, LightBloom, bubbleLetter, heartFish } from './ui.js';
import { SoundEngine } from '../audio.js';
import { AnimeFX } from './anime.js';
import { heartFriends } from '../world/friends.js';
import { PhotoMode } from './photo.js';
import { Quest } from './quest.js';
import { Dialog } from './dialog.js';

// the finale: the whole tank spells these out, one after another
const LOVE_WORDS = ['I', 'LOVE', 'YOU'];
// the stretch of the song's opening that repeats during the photo quest:
// one phrase, measured so the jump back lands on the same beat
const SONG_LOOP = [1.2, 6.25];
const CROWD_KINDS = ['tang', 'butterfly', 'snapper', 'batfish', 'giant'];

const WHALE_Z = 0.62;

export class Story {
  constructor(aq, post, opts = {}) {
    this.aq = aq;
    this.post = post;
    this.t = 0;
    this.timers = [];
    this.tweens = [];
    this.fx = new Particles();
    this.fxBack = new Particles();
    this.anime = new AnimeFX();
    this.meetX = null; // where she stands before they meet
    this.sun = 0;      // summer sunlight streaming in from above, 0..1
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
    this.photo = new PhotoMode(this);
    this.quest = null;
    this.dialog = new Dialog(this);
    this.guyAt = null;       // apart: where he stands in the world
    this.photoReady = false; // the camera comes out for the photo quest
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
      const jump = { jelly: 8, reef: 23, walk: 41, hook: 54.5, bottle: 90, letter: 110, question: 136, finale: 151 };
      this.songOffset = jump[debug] ?? 0;
      this.photoReady = true;
      this.sound.loop = null;
      this.sound.start();
      this.showSpeaker = CONFIG.sound;
      const order = ['jelly', 'reef', 'walk', 'hook', 'bottle', 'letter', 'question', 'finale'];
      const from = Math.max(0, order.indexOf(debug));
      this.hud = from < 3;
      if (from === 0) this.enterRoom(this.rooms.jelly, CX - 260, CX - 320);
      if (from === 1) this.enterRoom(this.rooms.reef, CX - 160, CX - 220);
      if (from >= 4) this.enterMainTank();
      if (from <= 0) await this.jellyScene();
      if (from <= 1) await this.reefScene();
      if (from <= 2) await this.mainWalk();
      if (from <= 3) await this.hookScene();
      if (from <= 4) await this.bottleScene();
      if (from <= 5) await this.letterScene();
      if (from <= 6) await this.questionScene();
      await this.finaleScene();
      return;
    }
    await this.titleScene();
    await this.dive();
    await this.photoQuest();
    await this.jellyScene();
    await this.reefScene();
    await this.mainWalk();
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

  // Walk the couple to x1, timed to arrive as the song reaches `until` (or
  // another clock, before the song has started). Speed eases in and out, so
  // steps start and settle gently.
  // solo: only she walks (apart), with her own stride.
  walkTo(x1, until, clock = () => this.songT, solo = false) {
    const st = this.stage, c = this.aq.couple;
    const W = solo ? 'girlWalk' : 'walk', M = solo ? 'girlMoving' : 'moving';
    if (solo) c.girlPose = 'walk'; else c.mode = 'walk';
    let v = 0;
    return this.until(() => {
      const d = x1 - st.coupleX;
      const remain = Math.max(0.35, until - clock());
      const want = clamp(Math.min(d / remain * 1.15, Math.sqrt(Math.max(0, d)) * 5), 0, 36);
      const dt = this.dt || 0.016;
      v += (want - v) * Math.min(1, dt * 2.2);
      const step = Math.min(d, v * dt);
      st.coupleX += step;
      c[W] += step / 7.5;
      c[M] += (clamp(v / 18) - c[M]) * Math.min(1, dt * 5);
      if (d < 0.4 || clock() >= until) {
        st.coupleX = x1;
        // let the last step settle instead of freezing mid-stride
        const settle = c[W];
        this.tween(0.35, (k) => { c[M] *= 1 - k; c[W] = settle + k * 0.3; });
        return true;
      }
      return false;
    });
  }

  // Apart, he walks on his own to x1 (in the world) while she stays put.
  guyWalkTo(x1, until) {
    const c = this.aq.couple;
    c.mode = 'walk';
    let v = 0;
    return this.until(() => {
      const d = x1 - this.guyAt, dt = this.dt || 0.016;
      const remain = Math.max(0.35, until - this.songT);
      const want = clamp(Math.min(d / remain * 1.15, Math.sqrt(Math.max(0, d)) * 5), 0, 36);
      v += (want - v) * Math.min(1, dt * 2.2);
      const step = Math.min(d, v * dt);
      this.guyAt += step;
      c.walk += step / 7.5;
      c.moving += (clamp(v / 18) - c.moving) * Math.min(1, dt * 5);
      if (d < 0.4 || this.songT >= until) {
        this.guyAt = x1;
        const settle = c.walk;
        this.tween(0.35, (k) => { c.moving *= 1 - k; c.walk = settle + k * 0.3; });
        return true;
      }
      return false;
    });
  }

  async turnToGlass() {
    const c = this.aq.couple;
    if (c.apart && !c.guyOn) {
      // just her
      await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
      c.girlPose = 'back';
      await this.tween(0.2, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
      c.flip = 1;
      return;
    }
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'back';
    await this.tween(0.2, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
  }

  // Screen point just above his or her head, for emotes and effects.
  headAt(who = 'guy') {
    return () => {
      const st = this.stage, c = this.aq.couple, gh = c.gap / 2;
      const x = st.coupleX + (who === 'guy' ? -gh + (c.apart ? c.guyDX : 0) : gh + (c.apart ? c.girlDX : 0));
      const [sx, sy] = st.toScreen(x, st.coupleY - (who === 'guy' ? 76 : 70) - (who === 'guy' ? c.hop : 0), 0);
      return [Math.round(sx), Math.round(sy)];
    };
  }

  // Tween the whole look of the scene from wherever it is now: colour grade,
  // saturation, sunlight, the tank's own light, vignette and extra glow.
  grade(dur, g, ez = ease.inOutSine) {
    const p = this.post.p, st = this.stage;
    const from = { tint: p.tint.slice(), sat: p.sat, vig: p.vig, dim: p.dim, sun: this.sun, light: st.light ?? 1, glow: this.bloomAdd || 0 };
    const tok = (this.gradeTok = {});
    return this.tween(dur, (k) => {
      if (this.gradeTok !== tok) return; // a newer grade took over
      if (g.tint) p.tint = from.tint.map((v, i) => lerp(v, g.tint[i], k));
      if (g.sat != null) p.sat = lerp(from.sat, g.sat, k);
      if (g.vig != null) p.vig = lerp(from.vig, g.vig, k);
      if (g.dim != null) p.dim = lerp(from.dim, g.dim, k);
      if (g.sun != null) this.sun = lerp(from.sun, g.sun, k);
      if (g.light != null) st.light = lerp(from.light, g.light, k);
      if (g.glow != null) this.bloomAdd = lerp(from.glow, g.glow, k);
    }, ez);
  }

  // A small idle gesture in the back view (c.point / c.glance): ease in,
  // hold for a moment, ease out.
  gesture(key, at, hold) {
    const c = this.aq.couple;
    return this.atSong(at).then(async () => {
      await this.tween(0.5, (k) => { c[key] = k; }, ease.inOutSine);
      await this.wait(hold);
      await this.tween(0.5, (k) => { c[key] = 1 - k; }, ease.inOutSine);
    });
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
    // the song starts inside the tap, going round its first few seconds
    // until the photo quest is done
    this.sound.loop = SONG_LOOP;
    this.sound.armed = true;
    await this.waitTap();
    this.hint = null;
    this.sound.start();      // no-op if the tap already started it
    this.showSpeaker = CONFIG.sound;
  }

  // The plunge: a swell of bubbles, then an arched wall of foam sweeps up and
  // reveals the jellyfish hall while the water wobbles.
  async dive() {
    const p = this.post.p;
    await this.wait(0.3);
    this.diving = true;
    this.sound.sfx('dive');
    for (let i = 0; i < 90; i++) {
      this.fxBack.add({ kind: 'bubble', x: R() * this.W, y: this.H + 4 + R() * 60, vx: (R() - 0.5) * 8, vy: -50 - R() * 90, age: 0, life: 4, r: R() < 0.55 ? 1 : R() < 0.9 ? 2 : 3, wob: 9, wobF: 4, ph: R() * TAU, alpha: 0.8, fade: false });
    }
    this.tween(1.4, (k) => { p.warp = k * 0.7; });
    await this.wait(1.3);
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
    { const c = this.aq.couple; c.apart = true; c.guyOn = false; c.girlOn = true; c.girlPose = 'walk'; } // she comes on her own
    this.grade(3, { tint: [0.92, 0.88, 1.16], sat: 1.2, vig: 0.74 });   // the jelly hall: dim and violet
    this.hud = true;
    this.stage.sendWave(CX - 700, 1, { speed: 900, amp: 7, width: 220, life: 3 });
    await this.until(() => tr.done);
    this.trans = null;
    this.tween(1.4, (k) => { p.warp = 0.7 * (1 - k); });
  }

  // Before the story moves on: the jellyfish hall, her on her own with a
  // camera and the song's opening going round. A Mameshiba in a scuba suit
  // paddles over, chats (you pick her replies), and hands her a photo quest
  // for its encyclopedia. When it's done she heads for the reef and the song
  // carries on.
  async photoQuest() {
    const st = this.stage, c = this.aq.couple, P = this.photo, D = this.dialog;
    const bean = st.bean;
    this.tween(4.5, (k) => { this.camX = lerp(CX - 260, CX - 170, k); }, ease.inOutSine);
    await this.walkTo(CX - 190, this.t + 4, () => this.t, true);
    await this.turnToGlass();
    if (bean) bean.go = () => [st.coupleX + 44, st.coupleY - 150 - (st.extra || 0) * 0.2];
    await this.wait(1.4);
    this.anime.emote(this.headAt('girl'), '?', 1.1, '#3a6aff');
    // her reply, then the bean's answer to it
    const chat = async (line, replies, answers) => {
      const i = await D.ask('bean', line, replies);
      await D.say('her', replies[i], { life: 0.55, cps: 80 });
      await D.say('bean', answers[i]);
      return i;
    };
    await D.say('bean', 'oh! a visitor! hi hi!');
    await chat("I'm Mameshiba. Part bean, part dog, all facts.", ['a talking bean??', 'cute scuba suit!'], [
      'A talking bean with a degree in jellyfish, thank you very much.',
      'Thank you!! Beans sink, so safety first.',
    ]);
    await chat('Did you know jellyfish are older than dinosaurs? Older than TREES?', ['older than trees??', 'they look good for their age'], [
      'Yep! Jellies: over 500 million years. Trees: about 385 million. Babies.',
      "No brain, no heart, no bones. No stress. That's the secret.",
    ]);
    await chat("I'm making an encyclopedia of everyone who lives here. Will you take the photos?", ["let's do it!", "what's in it for me?"], [
      'Yay!! A real photographer!',
      'Points! Puzzle pieces! A fun fact with every photo! And my eternal respect.',
    ]);
    await D.say('bean', 'Every photo of an animal unlocks a jigsaw piece and a fun fact. Finish a jigsaw and you win its keychain!');
    this.photoReady = true;
    const Q = (this.quest = new Quest(this, 'PHOTO QUEST', 'jellyfish hall', [
      ['jelly', 'a moon jelly'], ['nettle', 'a sea nettle'], ['bigjelly', 'a giant jelly'],
    ], 30));
    this.sound.sfx('chime');
    let snaps = 0;
    Q.point = () => { if (P.on || snaps || P.album) return null; const [x, y, w] = P.camRect(); return [x + w / 2, y - 3]; };
    const cheers = ['Yes!! One down!', 'Ooh, great shot!', 'A natural!'];
    let ci = 0;
    P.onSnap = (info) => {
      snaps++;
      const had = Q.items.filter((it) => it.done).length;
      if (Q.snapped(info.keys)) { P.points += Q.bonus; P.save(); return; }
      if (Q.items.filter((it) => it.done).length > had) D.say('bean', cheers[ci++ % cheers.length], { life: 1.4 });
    };
    await D.say('bean', 'First, three jellies for page one. Tap your camera to hold it up!', { until: () => P.on || snaps > 0 });
    D.say('bean', 'Now tap a jelly to snap it. The card says which ones!', { life: 2.6 });
    await this.until(() => Q.done);
    P.onSnap = null;
    // let the stamp and the print have their moment
    await this.wait(3.3);
    await this.until(() => !P.prints.length);
    if (this.quest === Q) this.quest = null;
    if (!P.album) P.on = false;
    c.point = 0;
    await chat("QUEST CLEAR! You're officially my favourite human.", ['what now?', 'can I keep snapping?'], [
      'The clownfish reef is next door. Go say hi!',
      'Always! Your album is by the camera. Now go, go, the reef is next door!',
    ]);
    this.sound.loop = null;  // the song carries on from here
    if (bean) bean.go = null;
  }

  // Tap a creature and it reacts with a little sparkle.
  tapCreature(x, y) {
    const st = this.stage;
    let best = null, bd = 1e9;
    for (const c of st.creatures) {
      const [sx, sy] = st.toScreen(c.x, c.y - (c.hitDY ?? (c.kind === 'crab' ? 5 : 0)), c.z);
      const r = Math.max(9, (c.len || c.size || 16) * 0.45);
      const d = Math.hypot(sx - x, sy - y);
      if (d < r && d < bd) { bd = d; best = c; }
    }
    if (this.water) this.water.splash(x, y, best ? 2.6 : 3.4, 3.2);
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
    c.flip = 1; c.moving = 0; c.mode = 'back'; c.hug = 0; c.point = 0; c.glance = 0;
    c.apart = false; c.girlDX = 0; c.hop = 0; this.meetX = null;
    c.hold = together ? 1 : 0; c.lean = together ? 1 : 0;
  }

  // Walk into a gallery from the left.
  enterRoom(room, camFrom, coupleFrom) {
    const c = this.aq.couple;
    this.camX = camFrom;
    this.setStage(room);
    room.cam.x = camFrom;
    room.coupleX = coupleFrom;
    c.hold = 0; c.lean = 0; c.hug = 0; c.point = 0; c.glance = 0; c.mode = 'walk'; c.flip = 1;
  }

  // Chapter 1: the jellyfish hall, now with the song. She wanders along the
  // glass on her own, pointing out the jellies.
  async jellyScene() {
    const c = this.aq.couple;
    if (!c.apart) { c.apart = true; c.guyOn = false; c.girlOn = true; }
    this.photoReady = true;
    this.credit = { a: 0 };
    { const C = this.credit; this.tween(1, (k) => { C.a = k; }); this.atSong(12).then(() => this.tween(1.2, (k) => { C.a = 1 - k; })); }
    const cam0 = this.camX;
    this.tween(14, (k) => { this.camX = lerp(cam0, CX, k); }, ease.inOutSine);
    await this.atSong(8.5);
    await this.walkTo(CX - 8, 16, undefined, true);
    await this.turnToGlass();
    this.gesture('point', 17.2, 1.6);
    this.gesture('point', 20.4, 1.4);
  }

  // Chapter 2: the clownfish reef. He's already there at the glass; she
  // walks in past him, he spots her and can't hide how happy he is, jumps
  // around, then comes over and they shake hands.
  async reefScene() {
    const reef = this.rooms.reef;
    const c = this.aq.couple, gh = c.gap / 2;
    const Xb = CX - 14;               // where he stands
    const Xq = Xb + 2 * gh + 34;      // where she stops, just past him
    const meet = () => {
      c.apart = true; c.guyOn = true; c.girlOn = true;
      c.mode = 'back'; c.girlPose = 'walk'; c.girlWave = 0; c.shake = 0; c.hop = 0; c.girlDX = 0;
      this.guyAt = Xb; this.meetX = null;
    };
    if (reef && this.stage !== reef) {
      await this.atSong(23.6);
      this.sound.sfx('chime');
      await this.go(reef, new LightBloom(this.W, this.H, 2.6, [190, 240, 255]), () => { this.enterRoom(reef, CX - 160, CX - 150); meet(); });
    } else meet();
    this.grade(2.5, { tint: [0.96, 1.07, 1.08], sat: 1.28, vig: 0.48, sun: 0.35, light: 1.1 });   // the reef: bright daylight
    const st = this.stage, A = this.anime;
    const him = this.headAt('guy'), her = this.headAt('girl');
    const hop = (h, d) => this.tween(d, (k) => { c.hop = Math.sin(k * Math.PI) * h; });
    // a slow pan along the reef; a narrow screen stays on the two of them
    this.tween(10, (k) => {
      const q = st.coupleX + gh, mid = this.guyAt != null ? (this.guyAt + q) / 2 : st.coupleX, m = this.W * 0.18;
      this.camX = clamp(lerp(CX - 160, CX, k), mid - m, mid + m);
    }, ease.inOutSine);
    await this.walkTo(Xq - gh, 27.4, undefined, true);
    // he spots her
    c.mode = 'side';
    this.sound.sfx('ding');
    A.emote(him, '!', 1.3);
    A.focus = 1; A.focusAt = him;
    await hop(7, 0.32);
    await this.atSong(28.2);
    // she turns round and waves
    c.girlPose = 'side';
    A.emote(her, '?', 0.8, '#3a6aff');
    await this.wait(0.5);
    this.tween(0.4, (k) => { c.girlWave = k; }, ease.outBack);
    await this.atSong(29.8);
    // he can't keep still
    c.mode = 'front'; c.pose = 'cheer';
    this.sound.sfx('boing');
    for (let i = 0; i < 3; i++) {
      const [hx, hy] = him();
      burstStars(this.fx, hx, hy + 6, 5, { speed: 36, size: 4 });
      this.fx.add({ kind: 'spark', x: hx + 6, y: hy - 2, vx: 20, vy: -30, drag: 1, age: 0, life: 0.6, size: 2, col: '#9ad8ff' });
      A.burst(him, 0.35);
      await hop(10 - i * 2, 0.36);
      if (i === 1) this.sound.sfx('boing');
    }
    c.pose = 'wave';
    this.tween(0.4, (k) => { c.girlWave = 1 - k; });
    await this.atSong(31.2);
    // he walks over and holds out his hand
    await this.guyWalkTo(Xq - 2 * gh - 4, 32.4);
    c.mode = 'side';
    this.tween(0.3, (k) => { c.shake = k; }, ease.outCubic);
    this.sound.sfx('pop'); this.sound.sfx('sparkle');
    {
      const hands = () => { const [x, y] = st.toScreen(Xq - gh - 2, st.coupleY - 40, 0); return [Math.round(x), Math.round(y)]; };
      A.burst(hands, 0.6, '#fff4a0');
      A.focus = 0.7; A.focusAt = hands;
      const [hx, hy] = hands();
      burstStars(this.fx, hx, hy, 10, { speed: 50, size: 5 });
    }
    await this.atSong(34.2);
    await this.tween(0.3, (k) => { c.shake = 1 - k; });
    // he steps in beside her and they watch the reef together
    await this.guyWalkTo(Xq - 2 * gh, 35.2);
    st.coupleX = Xq - gh;
    this.guyAt = null;
    c.apart = false; c.guyDX = 0; c.girlDX = 0; c.shake = 0; c.girlPose = 'back';
    c.mode = 'walk'; c.moving = 0;
    await this.turnToGlass();
    this.gesture('glance', 36.8, 2.2);
    await this.atSong(38.7);
    A.emote(her, '♪', 0.9, '#ff5aa0');
  }

  // Chapter 3: along the great Buddha tank, arriving at the middle of the
  // window right as the chorus hits.
  async mainWalk() {
    const aq = this.aq, c = aq.couple;
    await this.atSong(41.4);
    await this.mainReady;
    this.sound.sfx('whoosh');
    await this.go(aq, new Sweep(this.W, this.H, 2.9), () => {
      this.camX = CX - 520;
      this.setStage(aq);
      aq.coupleX = CX - 470;
      c.mode = 'walk'; c.hold = 0; c.lean = 0; c.hug = 0; c.flip = 1;
      c.apart = false; c.girlOn = true; c.girlDX = 0; c.hop = 0; this.meetX = null;
    });
    this.tween(13.5, (k) => { this.camX = lerp(CX - 520, CX, k); }, ease.inOutSine);
    this.grade(3, { tint: [0.84, 0.94, 1.14], sat: 1.0, vig: 0.66, sun: 0, dim: 0.08 });   // deep, cool blue before the hook
    await this.walkTo(CX, 56.6);
  }

  // The hook: the minnows pour into a heart and the couple face each other.
  async hookScene() {
    const aq = this.aq, c = aq.couple, p = this.post.p;
    const s = Math.min(96, this.W * 0.36);
    const cx = CX + 34, cy = 146, cz = 0.3;
    if (this.stage !== aq) this.enterMainTank(false);
    await this.atSong(55.0);
    this.formHeart(aq.bait, cx, cy, cz, s, aq.t, true);
    for (const f of aq.bait) f.formFace = 0;
    const glow = { x: cx, y: cy + 14, z: 0.34, r: Math.round(s * 1.5), col: '#ff5aa0', a: 0, beat: true };
    aq.glows.push(glow);
    this.tween(2.8, (k) => { for (const f of aq.bait) f.formK = k; glow.a = 0.5 * k; }, ease.inOutSine);
    await this.atSong(57.9);
    // she turns to him; he turns to her
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'face'; c.hands = 1; c.hug = 0;
    await this.tween(0.22, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
    this.heartPop(aq, aq.coupleX, aq.coupleY - 62, true);
    this.sound.sfx('sparkle');
    this.heartSparkle = { cx, cy, cz, s };
    // the heart's pink glow falls on them
    const blue = aq.coupleLight.slice(), pink = [255, 160, 210];
    // the whole tank flips to golden summer light in a heartbeat
    p.flash = [1, 0.9, 0.7, 0.45];
    this.tween(0.9, (k) => { p.flash[3] = 0.45 * (1 - k); });
    this.grade(1.4, { tint: [1.2, 1.07, 0.86], sat: 1.36, vig: 0.44, sun: 1.1, light: 1.25, dim: 0, glow: 0.12 }, ease.outCubic);
    this.tween(3, (k) => { aq.coupleLight = blue.map((v, i) => lerp(v, pink[i], k * 0.7)); });
    // "this could be us", pointing at them as they face each other
    this.atSong(59.6).then(() => {
      const C = this.cbu = { a: 0 };
      this.tween(0.5, (k) => { C.a = k; }, ease.outBack);
      this.atSong(69.5).then(() => this.tween(0.6, (k) => { C.a = 1 - k; })).then(() => { if (this.cbu === C) this.cbu = null; });
    });
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
    const lit = aq.coupleLight.slice();
    this.tween(2, (k) => {
      glow.a = 0.5 * (1 - k);
      aq.coupleLight = lit.map((v, i) => lerp(v, blue[i], k));
    }).then(() => { aq.glows.splice(aq.glows.indexOf(glow), 1); });
    this.grade(3.5, { tint: [0.98, 0.97, 1.08], sat: 1.06, vig: 0.55, sun: 0.15, light: 1, glow: 0 });   // the gold fades to evening
    // back to the glass, hand in hand now
    await this.tween(0.16, (k) => { c.flip = 1 - 0.45 * k; });
    c.mode = 'back'; c.hold = 1; c.lean = 0; c.hug = 0;
    await this.tween(0.22, (k) => { c.flip = 0.55 + 0.45 * k; }, ease.outBack);
    c.flip = 1;
    this.tween(3, (k) => { c.lean = k; }, ease.inOutSine);
  }

  // Everyone in the tank celebrates: fish flip and hop, crabs jump, the
  // buddies roll, and sparkles and bubbles burst all over the water.
  celebrate() {
    const aq = this.aq;
    for (const c of aq.creatures) {
      if (c.react) c.react(c.x + (R() - 0.5) * 20, c.y + 10, 0.9);
      if (c.kind === 'crab') c.hop = 1;
      if (c.kind === 'jelly') c.lit = 1.6;
      if ('hopT' in c) c.hopT = 1;
    }
    for (let i = 0; i < 8; i++) {
      this.wait(i * 0.35).then(() => {
        const x = R() * this.W, y = 30 + R() * this.H * 0.5;
        burstStars(this.fx, x, y, 8, { speed: 60, size: 5 });
        popRing(this.fx, x, y, { r1: 20, col: '#fff4c0' });
      });
    }
    aq.sendWave(CX - 800, 1, { speed: 900, amp: 9, width: 260, life: 3 });
  }

  // Summer sunlight: a warm glow at the surface and beams slanting down.
  drawSun(ctx) {
    const a = this.sun;
    if (a <= 0.01) return;
    const W = this.W, H = this.H, t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W * 0.92, -H * 0.15, 0, W * 0.92, -H * 0.15, H * 0.8);
    g.addColorStop(0, `rgba(255,230,160,${0.2 * a})`);
    g.addColorStop(0.5, `rgba(255,210,140,${0.05 * a})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const x0 = W * (0.1 + i * 0.14) + Math.sin(t * 0.3 + i * 1.7) * 14;
      const w = 10 + (i % 3) * 7;
      const al = a * (0.05 + 0.035 * Math.sin(t * 0.8 + i * 2.3));
      if (al <= 0) continue;
      const bg = ctx.createLinearGradient(0, 0, 0, H * 0.85);
      bg.addColorStop(0, `rgba(255,240,190,${al})`);
      bg.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w - H * 0.35, H * 0.85); ctx.lineTo(x0 - H * 0.35 - w * 0.5, H * 0.85);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
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
    this.grade(5, { tint: [0.8, 0.87, 1.2], sat: 0.9, sun: 0 });   // night falls for the letter
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
    this.grade(2, { tint: [1.05, 1.0, 1.04], sat: 1.18, vig: 0.55, dim: 0 });
    c.mode = 'face'; c.hands = 1; c.hold = 0; c.lean = 0; c.hug = 0;
    this.camX = CX; aq.cam.x = CX;
    this.warmLoveFish();
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
    this.grade(2.5, { tint: [1.1, 0.95, 1.08], vig: 0.95, dim: 0.16, sat: 1.12 });
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

  formWords(str, o = {}) {
    const aq = this.aq;
    const lines = String(str).split('\n');
    const pix = lines.map((l) => textPixelsBold(l));
    const tw = Math.max(...pix.map((p) => p.w));
    const cell = clamp(Math.floor((this.W - 30) / tw), 3, 6);
    const lineH = 10 * cell;
    const cz = o.cz ?? 0.1;
    const totalH = lines.length * lineH - 3 * cell;
    const top = o.top ?? 128 - totalH / 2;
    const targets = [];
    pix.forEach((p, li) => {
      const ox = CX - (p.w * cell) / 2;
      for (const [x, y] of p.px) targets.push([ox + x * cell + cell / 2, top + li * lineH + y * cell, cz + (x % 2) * 0.004]);
    });
    const pool = (o.pool || aq.bait).slice();
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
    const glow = { x: CX, y: top + totalH / 2, z: cz + 0.02, r: Math.round(Math.min(this.W * 0.5, tw * cell * 0.62)), col: o.glow || '#9fe0ff', a: 0 };
    aq.glows.push(glow);
    return { fish: chosen, glow, center: [CX, top + totalH / 2] };
  }

  // How big the finale's fish lettering is on this screen.
  letterCell(words) {
    const tw = Math.max(...words.map((w) => textPixelsBold(w).w));
    return { tw, cell: clamp(Math.floor((this.W - 40) / tw), 3, 6) };
  }

  // Draw the lettering fish at their smaller size ahead of time (while the
  // question waits) so the finale never shows them at the wrong size.
  warmLoveFish() {
    const len = Math.max(9, this.letterCell(LOVE_WORDS).cell * 2 + 1);
    for (const k of ['trevally', ...CROWD_KINDS]) for (const z of [0.05, 0.14]) queueVariants(k, sizeAt(len, z), [1, 3]);
  }

  // Fish spelling words one after another in the middle of the tank. The ones
  // a word doesn't need swim a ring around it; between words everybody breaks
  // off into the ring, then regroups into the next word.
  wordLoop(pool, words, o = {}) {
    const aq = this.aq, cz = o.cz ?? 0.1;
    const pix = words.map((w) => textPixelsBold(w));
    const { tw, cell } = this.letterCell(words);
    // the fish grow with the lettering so the strokes read solid
    for (const f of pool) f.len = Math.max(9, cell * 2 + 1);
    // the middle of the window on screen, pinned there in the world
    const par = 1 - 0.5 * cz, c = aq.curves;
    const mid = c ? (Math.max(c.top(this.W / 2), 0) + c.sill(this.W / 2)) / 2 - 6 : this.H * 0.4;
    const cx = CX + (aq.cam.x - CX) * par, cy = CY + (aq.cam.y - CY) * par + mid - this.H / 2;
    const L = { words, pix, cell, cx, cy, cz, fish: pool.slice(), slot: new Map(), swirl: 1, i: -1 };
    L.rx = Math.min((tw * cell) / 2 + 26, this.W / 2 - 22);
    L.ry = Math.max((7 * cell) / 2 + 22, L.rx * 0.36);
    const jx = Math.min(26, this.W * 0.08);
    // a soft shadow in the water behind the letters, so glowing fish read
    // against the bright tank
    const plate = (L.plate = { z: cz + 0.03, w: 60, h: 7 * cell + 24, a: 0 });
    plate.draw = (ctx) => {
      if (plate.a < 0.01) return;
      const [sx, sy] = aq.toScreen(cx, cy, plate.z);
      ctx.save();
      ctx.translate(sx, sy);
      const r = plate.h * 0.9, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      ctx.scale((plate.w * 0.55) / r, 1);
      g.addColorStop(0, 'rgba(4,20,58,1)');
      g.addColorStop(0.55, 'rgba(4,20,58,0.6)');
      g.addColorStop(1, 'rgba(4,20,58,0)');
      ctx.globalAlpha = plate.a;
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    };
    aq.extras.push(plate);
    for (const f of L.fish) {
      const u = R(), jr = R(), bob = R() * TAU, zo = (R() - 0.5) * 0.05;
      f.form = (t) => {
        const s = !L.swirl && L.slot.get(f);
        if (s) return [s[0] + Math.sin(t * 1.3 + bob) * 0.5, s[1] + Math.sin(t * 2.1 + bob) * 0.6, cz + s[2]];
        const a = (u + t * 0.06) * TAU;
        return [cx + Math.cos(a) * (L.rx + jr * jx), cy + Math.sin(a) * (L.ry + jr * 16), cz + 0.02 + zo + Math.sin(a) * 0.03];
      };
      f.formFace = 0;
      f.formK = 0;
      f.glowCol = o.glow;
    }
    return L;
  }

  // Word i: each letter pixel takes the nearest free fish.
  wordGather(L, i) {
    const P = L.pix[i], cell = L.cell;
    let tg = P.px.map(([x, y]) => [L.cx - (P.w * cell) / 2 + x * cell + cell / 2, L.cy - (7 * cell) / 2 + y * cell + cell / 2, (x % 2) * 0.004]);
    if (tg.length > L.fish.length) tg = L.fish.map((_, k) => tg[Math.floor((k * tg.length) / L.fish.length)]);
    // the outermost pixels choose first so the middle doesn't steal them
    tg.sort((a, b) => Math.abs(b[0] - L.cx) - Math.abs(a[0] - L.cx));
    // only the silver trevally write, so the letters read as one colour; the
    // bright reef fish keep circling
    const free = new Set(L.fish.filter((f) => f.kind === 'trevally'));
    if (free.size < tg.length) for (const f of L.fish) free.add(f);
    L.slot.clear();
    for (const s of tg) {
      let best = null, bd = Infinity;
      for (const f of free) { const d = (f.x - s[0]) ** 2 + (f.y - s[1]) ** 2; if (d < bd) { bd = d; best = f; } }
      if (!best) break;
      free.delete(best);
      L.slot.set(best, s);
      best.formFace = 1;
    }
    for (const f of L.fish) if (!L.slot.has(f)) f.formFace = 0;
    L.i = i;
    L.swirl = 0;
    const pl = L.plate, w0 = pl.w, w1 = P.w * cell + 70;
    this.tween(1.4, (k) => { pl.w = lerp(w0, w1, k); }, ease.inOutSine);
  }

  async runWordLoop(L) {
    const aq = this.aq, pl = L.plate;
    this.tween(2, (k) => { pl.a = 0.5 * k; });
    for (let i = 0, first = true; this.loveLoop === L; i = (i + 1) % L.words.length, first = false) {
      this.wordGather(L, i);
      // the first time they come from all over the tank, so give them longer
      await this.wait(first ? 2.6 : 1.3);
      if (this.loveLoop !== L) return;
      // the letters light up as they settle
      const lit = [...L.slot.keys()];
      this.tween(0.6, (k) => { for (const f of lit) f.glowA = Math.max(f.glowA, k); });
      await this.wait(0.6);
      if (this.loveLoop !== L) return;
      burstStars(aq.fx, L.cx, L.cy, 10, { speed: 60, size: 5 });
      await this.wait(L.words[i].length > 3 ? 2.6 : 2.1);
      if (this.loveLoop !== L) return;
      // break off and swim round
      L.swirl = 1;
      for (const f of L.fish) f.formFace = 0;
      this.tween(0.8, (k) => { for (const f of lit) f.glowA = Math.min(f.glowA, 1 - k); });
      await this.wait(1.7);
    }
  }

  async finaleScene() {
    const aq = this.aq, c = aq.couple, p = this.post.p;
    const yes = this.buttons.find((b) => b.id === 'yes');
    const bx = yes ? yes.x : this.W / 2, by = yes ? yes.y : this.H / 2;
    this.sound.sfx('yes');
    p.flash = [1, 0.95, 0.8, 0.7];
    this.tween(1.3, (k) => { p.flash[3] = 0.7 * (1 - k); });
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
    // summer: bright, warm, sunbeams pouring in
    this.grade(2.2, { tint: [1.24, 1.1, 0.84], sat: 1.42, vig: 0.36, dim: 0, sun: 1.3, light: 1.3, glow: 0.18 }, ease.outCubic);
    this.celebrate();
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
    // dolphins and seahorses arrive and swim a heart around the couple
    this.friends = heartFriends(CX, aq.coupleY - 105, 0.15, Math.min(95, this.W * 0.32), CX + this.W / 2);
    aq.creatures.push(...this.friends);
    // and every fish in the tank comes to the middle of the glass to spell it
    // out, one word at a time, circling round between the words
    const crowd = aq.trevSchool.m.concat(aq.creatures.filter((f) => CROWD_KINDS.includes(f.kind)));
    this.warmLoveFish();
    const loop = (this.loveLoop = this.wordLoop(crowd, LOVE_WORDS, { cz: 0.08, glow: '#ffc08a' }));
    this.tween(2.5, (k) => { for (const f of loop.fish) { f.formK = k; f.shadeA = k; } }, ease.inOutSine);
    this.runWordLoop(loop);
    await this.wait(1.2);
    const whale = aq.spawnWhaleShark();
    whale.x = CX + this.W / 2 + 60;
    // a slow, gentle glide in the background
    whale.speed = clamp(this.W * 0.02, 6, 11);
    whale.vx = -whale.speed;
    this.sound.sfx('chime');
    this.trevPath = this.trevPath || aq.trevSchool.path;
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
    // the minnows come home to frame the Buddha
    this.formHeart(aq.bait, CX + 34, 146, 0.3, Math.min(96, this.W * 0.36), aq.t, true);
    for (const f of aq.bait) f.formFace = 0;
    aq.glows.push({ x: CX + 34, y: 160, z: 0.34, r: Math.round(Math.min(96, this.W * 0.36) * 1.6), col: '#ff5aa0', a: 0.3, beat: true });
    this.heartSparkle = { cx: CX + 34, cy: 146, cz: 0.3, s: Math.min(96, this.W * 0.36) };
    this.tween(5, (k) => { for (const f of aq.bait) f.formK = k; }, ease.inOutSine);
    await this.atSong(203);
    this.chorus = false;
    this.grade(8, { tint: [1.18, 0.98, 0.9], sat: 1.22, sun: 0.85, light: 1.12, glow: 0.06 });   // a warm sunset to close
    await this.wait(3);
    this.replay = { a: 0 };
    { const Rp = this.replay; this.tween(1, (k) => { Rp.a = k; }); }
  }

  // ------------------------------------------------------------ lyrics --
  // Film-style subtitles: each line types in over a soft backing, rests,
  // then fades, releasing a few bubbles. Lines turn pink after the reveal.
  updateLyrics(dt) {
    const t = this.songT;
    while (this.lyricQueue.length && this.lyricQueue[0].t <= t) {
      const L = this.lyricQueue.shift();
      if (t - L.t < 2.5 && this.sound.playing) this.spawnLyric(L, this.lyricQueue.length ? this.lyricQueue[0].t - L.t : 6);
    }
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      const L = this.lyrics[i];
      L.age += dt;
      if (!L.bubbled && L.age > L.life - 0.5) {
        L.bubbled = true;
        for (let q = 0; q < 8; q++) this.fx.add({ kind: 'bubble', x: L.x + (R() - 0.5) * L.w, y: L.y + 3 * L.sc, vx: (R() - 0.5) * 10, vy: -18 - R() * 22, drag: 1.2, age: 0, life: 1.4 + R(), r: 1 + (R() * 2 | 0), wob: 8, wobF: 5, ph: R() * TAU, alpha: 0.8 });
      }
      if (L.age > L.life + 0.1) this.lyrics.splice(i, 1);
    }
  }

  spawnLyric(L, gap = 6) {
    const text = fill(L.text);
    const st = this.stage;
    const low = L.band === 'low' || this.question || this.finale;
    let sc = textWidth(text) * 2 + 24 < this.W * 0.86 ? 2 : 1;
    if (textWidth(text) + 20 > this.W) sc = 1;
    const top = st.curves ? st.curves.top(this.W / 2) : 30;
    const sill = st.curves && st.curves.sill ? st.curves.sill(this.W / 2) : this.H * 0.8;
    const y = low ? Math.round(Math.min(this.H - 12 - 7 * sc, sill + 4)) : Math.round(Math.max(10, top + 12));
    // one line at a time: an earlier line gives way
    for (const o of this.lyrics) o.life = Math.min(o.life, o.age + 0.3);
    // too wide for the screen: break at the space nearest the middle
    let lines = [text];
    if (textWidth(text) * sc + 20 > this.W) {
      const words = text.split(' ');
      let best = 1, bd = 1e9;
      for (let k = 1; k < words.length; k++) { const d = Math.abs(textWidth(words.slice(0, k).join(' ')) - textWidth(words.slice(k).join(' '))); if (d < bd) { bd = d; best = k; } }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const yy = low && lines.length > 1 ? y - 10 * sc : y;
    this.lyrics.push({ text, lines, sc, x: this.W / 2, y: yy, age: 0, life: clamp(gap - 0.4, 2.6, 6), w: Math.max(...lines.map((l) => textWidth(l))) * sc, n: chars(text).length, love: L.t >= 57.5 });
  }

  drawLyrics(ctx) {
    for (const L of this.lyrics) {
      const a = clamp(L.age / 0.35) * clamp((L.life - L.age) / 0.6);
      if (a <= 0) continue;
      let count = Math.min(L.n, Math.floor(L.age * 38) + 1);
      const lh = 10 * L.sc;
      const pw = L.w + 18, ph = 7 * L.sc + 9 + (L.lines.length - 1) * lh;
      const px = Math.round(L.x - pw / 2), py = Math.round(L.y - 4 - (L.sc - 1));
      ctx.globalAlpha = a * 0.66;
      ctx.fillStyle = L.love ? '#06204e' : '#040c26';
      ctx.fillRect(px + 2, py, pw - 4, ph);
      ctx.fillRect(px, py + 2, pw, ph - 4);
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.globalAlpha = 1;
      const rise = Math.round((1 - ease.outCubic(clamp(L.age / 0.5))) * 3);
      L.lines.forEach((line, li) => {
        const c = Math.max(0, count);
        count -= chars(line).length + 1;
        if (c <= 0) return;
        drawText(ctx, line, L.x, L.y + rise + li * lh, L.love
          ? { align: 'center', scale: L.sc, count: c, color: '#ffffff', outline: '#08265e', shadow: '#3aa8ff', alpha: a }
          : { align: 'center', scale: L.sc, count: c, color: '#dff2ff', outline: '#0b2a5c', shadow: '#2a86d8', alpha: a });
      });
    }
    ctx.globalAlpha = 1;
  }

  // "this could be us" with an arrow pointing at the couple
  drawThisCouldBeUs(ctx) {
    const C = this.cbu;
    if (!C || C.a <= 0) return;
    const st = this.stage;
    const [cx, cy] = st.toScreen(st.coupleX, st.coupleY - 64, 0);
    const text = 'this could be us 👀';
    const tw = textWidth(text);
    const bob = Math.round(Math.sin(this.t * 3) * 1.5);
    // beside them if there's room, otherwise centred above their heads
    let tx = Math.round(cx + 34), ty = Math.round(cy - 34 + bob), side = 1;
    if (tx + tw + 18 > this.W - 4) { tx = Math.round(cx - 34 - tw - 16); side = -1; }
    if (tx < 4) { tx = Math.round(clamp(cx - tw / 2, 4, this.W - tw - 4)); ty = Math.round(cy - 30 + bob); side = 0; }
    ctx.globalAlpha = C.a;
    drawText(ctx, text, tx, ty, { color: '#ffffff', outline: '#0a1a44', shadow: '#3aa8ff' });
    // a hand-drawn arrow curving down to them
    const sx = side < 0 ? tx + tw - 4 : side > 0 ? tx + 4 : Math.round(clamp(cx, tx + 4, tx + tw - 4)), sy = ty + 10;
    const hx = cx + side * 10, hy = cy - 4;
    ctx.fillStyle = '#ffffff';
    let lx = sx, ly = sy;
    for (let k = 1; k <= 16; k++) {
      const u = k / 16;
      const x = Math.round((1 - u) * (1 - u) * sx + 2 * u * (1 - u) * (sx + (hx - sx) * 0.1) + u * u * hx);
      const y = Math.round((1 - u) * (1 - u) * sy + 2 * u * (1 - u) * (hy - 2) + u * u * hy);
      ctx.fillRect(x, y, 2, 2);
      lx = x; ly = y;
    }
    const dx = hx - (sx + (hx - sx) * 0.1), dy = 0.0001 + hy - (hy - 2);
    const ang = Math.atan2(dy, dx);
    for (const off of [2.5, -2.5]) {
      for (let k = 1; k <= 5; k++) ctx.fillRect(Math.round(lx - Math.cos(ang + off * 0.3) * k), Math.round(ly - Math.sin(ang + off * 0.3) * k), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawCredit(ctx) {
    const C = this.credit;
    if (!C || C.a <= 0) return;
    const text = '♪ Always · Daniel Caesar';
    const w = textWidth(text) + 12;
    const y = this.H - 18;
    ctx.globalAlpha = C.a * 0.5;
    ctx.fillStyle = '#040c26';
    ctx.fillRect(6, y - 3, w, 13);
    ctx.globalAlpha = 1;
    drawText(ctx, text, 12, y, { color: '#e8f4ff', outline: '#0a1a44', alpha: C.a });
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
    const [jx, jy] = this.anime.jitter();
    st.cam.x += jx; st.cam.y += jy;
    this.anime.update(dt);
    this.photo.update(dt);
    if (this.quest) this.quest.update(dt);
    this.dialog.update(dt);
    // she raises the camera to her eye when you do
    { const c = aq.couple, up = this.photo.on && !this.photo.album ? 1 : 0; c.girlCam += (up - c.girlCam) * Math.min(1, dt * 9); }
    if (aq.couple.apart && this.meetX != null) aq.couple.girlDX = this.meetX - st.coupleX - aq.couple.gap / 2;
    if (aq.couple.apart && this.guyAt != null) aq.couple.guyDX = this.guyAt - (st.coupleX - aq.couple.gap / 2);
    // the music reaches into the tank
    st.pulse = snd.pulse;
    st.energy = snd.level;
    if (this.photo.album) {
      // keep the paper readable: no glow over the album
      this.post.p.bloom = lerp(this.post.p.bloom, 0.12, Math.min(1, dt * 8));
      this.post.p.uiGlow = lerp(this.post.p.uiGlow, 0.06, Math.min(1, dt * 10));
      this.albumGlow = true;
    } else if (this.albumGlow) {
      this.post.p.uiGlow = lerp(this.post.p.uiGlow, 0.55, Math.min(1, dt * 6));
      if (this.post.p.uiGlow > 0.54) { this.post.p.uiGlow = 0.55; this.albumGlow = false; }
    }
    if (this.photo.album) { /* bloom handled above */ } else if (!this.letter) this.post.p.bloom = lerp(this.post.p.bloom, 0.75 + snd.level * 0.35 + snd.pulse * 0.15 + (this.bloomAdd || 0), Math.min(1, dt * 4));
    if (this.chorus && snd.pulse === 1) {
      this.waveAcc++;
      if (this.waveAcc % 4 === 0) st.sendWave(this.waveAcc % 8 === 0 ? st.cam.x - 700 : st.cam.x + 700, this.waveAcc % 8 === 0 ? 1 : -1, { speed: 720, amp: 4, width: 170, life: 3 });
      for (const k of aq.crabs || []) if (k.form) k.hop = 0.7;
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
    if ((this.tapWait && !this.tapWait.check) || this.dialog.waiting()) this.hoverClickable = true;
    if (this.bottleHot) {
      const b = this.bottle;
      const [bx, by] = aq.toScreen(b.x, b.y, b.z);
      if (Math.hypot(this.mouse[0] - bx, this.mouse[1] - by) < 34) this.hoverClickable = true;
    }
    if (this.speakerHover() || (this.replay && this.replayHover())) this.hoverClickable = true;
    if (this.photo.wantsPointer(this.mouse)) this.hoverClickable = true;
  }

  // -------------------------------------------------------------- input --
  speakerRect() { return [this.W - 16, 6, 12, 11]; }
  speakerHover() { const [x, y, w, h] = this.speakerRect(); return this.showSpeaker && this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h; }
  replayRect() { const w = textWidth('replay') + 14; return [this.W - w - 6, this.H - 16, w, 12]; }
  replayHover() { const [x, y, w, h] = this.replayRect(); return this.mouse[0] >= x && this.mouse[0] <= x + w && this.mouse[1] >= y && this.mouse[1] <= y + h; }

  pointer(type, x, y) {
    this.mouse = [x, y];
    if (this.photo.album && this.photo.pointer(type, x, y)) return; // the album sits over everything
    if (type === 'down' && this.speakerHover()) { this.speakerOn = !this.speakerOn; this.sound.setEnabled(this.speakerOn); return; }
    if ((type === 'down' || type === 'key') && this.dialog.tap(type === 'key' ? null : x, y)) return;
    if (this.photo.pointer(type, x, y)) return;
    if (type === 'move') {
      const no = this.buttons.find((b) => b.id === 'no');
      if (no && no.alpha > 0.9 && Math.hypot(x - no.x, y - no.y) < no.w / 2 + 8) this.escapeNo(x, y);
      return;
    }
    if (type !== 'down' && type !== 'key') return;
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
      drawText(ctx, line, x + 17, top + i * L.lh, { color: special ? '#1e5aa8' : '#1c2e4e', count: n });
      if (n < len && n > 0 && Math.floor(this.t * 6) % 2 === 0) {
        const cx = x + 17 + charX(line, n);
        ctx.fillStyle = '#1e5aa8';
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
      scale: sc, align: 'center', color: '#ffffff', outline: '#08265e', shadow: '#3aa8ff', alpha: Q.a,
      wave: (i) => Math.sin(t * 3 - i * 0.45) * 1.6,
    });
  }

  // The names, spelled in bubbles in the middle of the screen, with a little
  // heart-shaped fish swimming between them. The bubbles float up from below
  // and gather into the letters, then keep bobbing like they're underwater.
  finaleLayout() {
    const F = this.finale, W = this.W, H = this.H, key = W + 'x' + H;
    if (F.layout && F.layout.key === key) return F.layout;
    const parts = fill(CONFIG.finale).split(/♥|❤/).map((p) => p.trim()).filter(Boolean);
    const A = textPixels(parts[0] || ''), B = parts[1] ? textPixels(parts[1]) : null;
    const fishW = (sp) => (B ? sp * 11 : 0);
    // one line if the bubbles can stay big, otherwise the names stack with
    // the fish between them
    let sp = [8, 7, 6, 5, 4].find((q) => (A.w + (B ? B.w : 0)) * q + fishW(q) + (B ? q * 4 : 0) < W - 16);
    const stacked = !sp;
    if (stacked) sp = [8, 7, 6, 5, 4, 3, 2].find((q) => Math.max(A.w, B ? B.w : 0) * q < W - 12) || 2;
    const bubbles = [], cy = Math.round(H * 0.44);
    const place = (P, x0, y0) => { for (const [px, py] of P.px) bubbles.push({ tx: Math.round(x0 + px * sp), ty: Math.round(y0 + py * sp) }); };
    let fish;
    if (!stacked) {
      const total = A.w * sp + (B ? fishW(sp) + sp * 4 + B.w * sp : 0);
      let x = W / 2 - total / 2;
      place(A, x, cy - 3.5 * sp);
      x += A.w * sp + sp * 2;
      fish = [x + fishW(sp) / 2, cy];
      if (B) place(B, x + fishW(sp) + sp * 2, cy - 3.5 * sp);
    } else {
      const lh = 8 * sp;
      place(A, W / 2 - (A.w * sp) / 2, cy - lh - sp * 5);
      fish = [W / 2, cy];
      if (B) place(B, W / 2 - (B.w * sp) / 2, cy + sp * 5);
    }
    for (const b of bubbles) {
      b.sx = b.tx + (R() - 0.5) * 70; b.sy = H + 8 + R() * 90;
      b.delay = R() * 0.8 + (b.tx / W) * 0.5; b.ph = R() * TAU;
    }
    const bottom = Math.max(...bubbles.map((b) => b.ty), fish[1] + sp * 3);
    F.layout = { key, bubbles, sp, r: Math.max(1, Math.floor(sp / 2)), fish, bottom };
    return F.layout;
  }

  drawFinale(ctx) {
    const F = this.finale;
    if (F.t0 == null) F.t0 = this.t;
    const L = this.finaleLayout(), t = this.t, age = t - F.t0;
    const spr = bubbleLetter(L.r);
    for (const b of L.bubbles) {
      const k = clamp((age - b.delay) / 1.5);
      if (k <= 0) continue;
      const e = ease.outBack(k);
      const drift = (1 - k) * Math.sin(age * 5 + b.ph) * 5;
      const wave = Math.sin(t * 2.2 - b.tx * 0.035) * 1.4 * k;
      const wob = Math.sin(t * 2.6 + b.ph) * 0.6 * k;
      ctx.drawImage(spr, Math.round(lerp(b.sx, b.tx, e) + drift) - spr.o, Math.round(lerp(b.sy, b.ty, e) + wave + wob) - spr.o);
    }
    // the heart fish pops in once the names have gathered
    const fk = clamp((age - 1.6) / 0.6);
    if (fk > 0) {
      const size = Math.max(2, L.sp * 3 * ease.outBack(fk));
      const img = heartFish(size, t);
      const fx = L.fish[0] + size * 0.3 + Math.sin(t * 1.3) * L.sp * 0.5, fy = L.fish[1] + Math.sin(t * 2.1) * L.sp * 0.6;
      const x = Math.round(fx - img.cx), y = Math.round(fy - img.cy);
      ctx.drawImage(img, x, y);
      if (fk >= 1 && t - (F.lastBub || 0) > 0.9) {
        F.lastBub = t;
        this.fx.add({ kind: 'bubble', x: x + img.mouth[0] + 1, y: y + img.mouth[1] - 1, vx: 6, vy: -14, drag: 0.6, age: 0, life: 1.8, r: R() < 0.5 ? 1 : 2 });
      }
    }
    drawText(ctx, fill(CONFIG.finaleSub), this.W / 2, Math.round(L.bottom + L.sp * 2 + 4), { align: 'center', color: '#e6f6ff', outline: '#08265e', alpha: clamp((age - 2) / 1) * F.a });
  }

  draw(ctx) {
    this.fxBack.draw(ctx);
    if (this.worldCanvas) this.drawSun(this.worldCanvas.ctx); // light in the water, not on the glass
    if (this.title) this.drawTitle(ctx);
    this.drawLyrics(ctx);
    this.drawThisCouldBeUs(ctx);
    this.drawCredit(ctx);
    if (this.letter) this.drawLetter(ctx);
    if (this.question) this.drawQuestion(ctx);
    for (const b of this.buttons) drawBubbleButton(ctx, b, this.t);
    if (this.hint) this.drawHint(ctx);
    this.fx.draw(ctx);
    this.anime.draw(ctx, this.W, this.H);
    if (this.trans) this.trans.draw(ctx);
    if (this.replay) {
      const [x, y, w] = this.replayRect();
      const hv = this.replayHover();
      drawText(ctx, '✦ replay', x + w / 2, y + 2, { align: 'center', color: hv ? '#ffffff' : '#ffb3d4', outline: '#2a0a24', alpha: this.replay.a * (hv ? 1 : 0.75) });
    }
    if (this.showSpeaker) { const [x, y] = this.speakerRect(); drawSpeaker(ctx, x + 2, y + 2, this.speakerOn, this.speakerHover()); }
    this.photo.draw(ctx);
    if (!this.photo.album) {
      // over the viewfinder, under the album; on a narrow screen the quest
      // card tucks in under the dialogue box
      if (this.quest) { this.quest.top = this.W < 340 ? Math.max(5, this.dialog.bottom() + 3) : 5; this.quest.draw(ctx); }
      this.dialog.draw(ctx);
    }
  }
}
