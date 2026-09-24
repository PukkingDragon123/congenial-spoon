import { ENERGY, ENERGY_HZ } from './energy.js';
// Soundtrack: plays the song and exposes its loudness and a beat pulse (from
// a pre-measured energy map) so the whole tank can move with the music. Small
// SFX are synthesised on top. If the song can't play, the clock free-runs so
// the story still plays, just silently.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// The game's first tune: a little music box in F, looping for the photo quest
// before the song starts.
const CHORDS = [
  [53, 57, 60], [52, 55, 60], [50, 53, 57], [46, 50, 53],
  [53, 57, 60], [48, 52, 55], [46, 50, 53], [48, 52, 55],
];
// one entry per quarter note, 0 = rest
const MELODY = [
  [72, 0, 69, 0], [67, 0, 0, 64], [65, 0, 69, 0], [74, 0, 0, 72],
  [72, 0, 69, 72], [67, 0, 0, 0], [65, 0, 62, 65], [64, 0, 0, 0],
];
const ARP = [0, 2, 1, 3, 4, 3, 1, 2];

export class SoundEngine {
  constructor(enabled = true, src = 'audio/always.mp3') {
    this.enabled = enabled;
    this.src = src;
    this.ctx = null;
    this.source = null;
    this.free = 0;          // fallback clock when there is no audio
    this.playing = false;
    this.ready = false;
    this.sim = false;       // tests: follow the simulated clock instead of the track
    // live analysis, all 0..1
    this.level = 0;
    this.bass = 0;
    this.high = 0;
    this.beat = 0;
    this.pulse = 0;         // one-shot flash on a detected beat
    this._avg = 0;
    this._cool = 0;
  }

  // Download the song, then play it from a local blob through a plain
  // <audio> element. A plain element plays even with a phone's silent switch
  // on (Web Audio does not), and starting it from a blob avoids any trouble
  // with how the host serves media.
  async load() {
    if (this.el) return;
    const el = (this.el = new Audio());
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    try {
      const res = await fetch(this.src);
      if (!res.ok) throw new Error('fetch ' + res.status);
      const blob = await res.blob();
      el.src = URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
    } catch (e) {
      console.warn('song download failed, streaming instead:', e.message);
      el.src = this.src;
    }
    el.load();
    this.ready = true;
  }

  // Runs synchronously inside the tap, which is what browsers require.
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !this.ctx) { try { this.ctx = new AC(); } catch (e) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.bus();
    if (this.armed && !this.playing) { this.start(); return; }
    if (this.el && !this.primed && !this.playing) {
      // play a silent moment inside the tap so the song may start later
      // without one
      this.primed = true;
      this.el.muted = true;
      const pr = this.el.play();
      if (pr && pr.then) pr.then(() => { if (!this.playing) { this.el.pause(); this.el.currentTime = 0; } }).catch(() => {});
    }
  }

  // The effects mix, ready as soon as there's an audio context.
  bus() {
    const ctx = this.ctx;
    if (!ctx || this.sfxBus) return;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.enabled ? 0.34 : 0;
    this.sfxBus.connect(this.master);
  }

  // Before the song: the music box over a soft wash of water, looping until
  // the photo quest is done.
  musicBox(on) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    if (on && !this.box) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(1, t + 1.5);
      out.connect(this.sfxBus);
      // a little room: reverb and a soft echo
      const len = ctx.sampleRate * 2.6, imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      const verb = ctx.createConvolver(); verb.buffer = imp;
      const vg = ctx.createGain(); vg.gain.value = 0.5;
      verb.connect(vg).connect(out);
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.39;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
      delay.connect(dl).connect(fb).connect(delay);
      const dg = ctx.createGain(); dg.gain.value = 0.3;
      delay.connect(dg).connect(out);
      const bus = ctx.createGain(); bus.gain.value = 0.5;
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
      bus.connect(tone); tone.connect(out); tone.connect(verb); tone.connect(delay);
      // the water underneath
      const wl = ctx.sampleRate * 4, wb = ctx.createBuffer(1, wl, ctx.sampleRate), wd = wb.getChannelData(0);
      let last = 0;
      for (let i = 0; i < wl; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; wd[i] = last * 3.2; }
      const water = ctx.createBufferSource(); water.buffer = wb; water.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.08; lg.gain.value = 120;
      lfo.connect(lg).connect(lp.frequency);
      const wg = ctx.createGain(); wg.gain.value = 0.5;
      water.connect(lp).connect(wg).connect(out);
      water.start(t); lfo.start(t);
      const box = (this.box = { out, bus, water, lfo, step: 0, next: t + 0.4 });
      box.timer = setInterval(() => this.boxSchedule(), 60);
    } else if (!on && this.box) {
      const b = this.box;
      this.box = null;
      clearInterval(b.timer);
      b.out.gain.cancelScheduledValues(t);
      b.out.gain.setValueAtTime(b.out.gain.value, t);
      b.out.gain.linearRampToValueAtTime(0.0001, t + 1.6);
      b.water.stop(t + 1.7); b.lfo.stop(t + 1.7);
    }
  }

  boxSchedule() {
    const b = this.box, ctx = this.ctx;
    if (!b || ctx.state !== 'running') return;
    const spb = 60 / 74 / 2; // eighth notes at 74 bpm
    while (b.next < ctx.currentTime + 0.25) {
      const t = b.next;
      const bar = Math.floor(b.step / 8) % 8, e = b.step % 8;
      const ch = CHORDS[bar];
      const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24];
      this.note(tones[ARP[e]], t, e === 0 ? 0.9 : 0.55, 1.6, b.bus);
      if (e === 0) this.note(ch[0], t, 0.45, 2.6, b.bus);
      if (e % 2 === 0) { const m = MELODY[bar][e / 2]; if (m) this.note(m + 12, t, 0.75, 2.2, b.bus); }
      if (e % 2 === 0) b.beatAt = t;
      if (Math.random() < 0.1) this.bubble(t + Math.random() * spb, 0.25);
      b.step++;
      b.next += spb;
    }
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    const ctx = this.ctx;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      this.bus();
    }
    this.musicBox(false);
    if (this.el) {
      const el = this.el;
      try { el.currentTime = 0; } catch (e) { /* not seekable yet */ }
      el.muted = !this.enabled;
      el.volume = 1;
      const pr = el.play();
      if (pr && pr.catch) pr.catch((e) => { console.warn('play blocked:', e.message); this.blocked = true; });
      this.source = el;
    }
  }

  // A later tap retries if the browser refused the first play().
  retry() {
    if (this.blocked && this.el) {
      this.blocked = false;
      const t = this.free;
      try { this.el.currentTime = t; } catch (e) { /* ignore */ }
      this.el.play().catch(() => { this.blocked = true; });
    }
  }

  // Song position in seconds. Falls back to a free-running clock.
  get time() {
    const el = this.source;
    if (el && !this.sim && !this.blocked && (el.currentTime > 0 || !el.paused)) return el.currentTime;
    return this.free;
  }

  get duration() { return (this.el && this.el.duration) || 225.4; }

  energyAt(t) {
    const i = Math.floor(t * ENERGY_HZ);
    if (i < 0 || i * 2 + 1 >= ENERGY.length) return 0;
    return +ENERGY.substr(i * 2, 2) / 99;
  }

  update(dt) {
    if (!this.playing) return;
    const el = this.source;
    if (!el || this.sim || this.blocked || (el.paused && el.currentTime === 0)) this.free += dt;
    else this.free = el.currentTime;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.beat = Math.max(0, this.beat - dt * 2.4);
    const t = this.time;
    const e = this.energyAt(t);
    this.level += (e - this.level) * Math.min(1, dt * 6);
    this.bass = this.level;
    // pulse on a jump in loudness, and keep a gentle steady beat under it
    this._cool -= dt;
    if (e - this.energyAt(t - 0.25) > 0.1 && this._cool <= 0) { this._cool = 0.3; this.pulse = 1; this.beat = 1; }
    const b = Math.floor(t / (60 / 72));
    if (b !== this._lastB) { this._lastB = b; if (this._cool <= 0) { this.pulse = 1; this.beat = 1; } }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.el) this.el.muted = !on;
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------------ sfx --
  note(m, t, vel = 1, dur = 1.6, bus = this.sfxBus) {
    const ctx = this.ctx;
    const f = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(bus);
    for (const [mul, amp] of [[1, 1], [2, 0.26], [3.01, 0.07]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  bubble(t, vol = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 300 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 3.2, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.12);
  }

  noise(t, dur, f0, f1, vol, q = 1.2) {
    const ctx = this.ctx;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  sfx(name) {
    if (!this.ctx || !this.enabled || !this.sfxBus) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'dive':
        this.noise(t, 1.6, 300, 2400, 0.4, 0.8);
        for (let i = 0; i < 16; i++) this.bubble(t + Math.random() * 1.4, 0.7);
        break;
      case 'whoosh':
        this.noise(t, 1.3, 2200, 260, 0.32, 0.9);
        for (let i = 0; i < 8; i++) this.bubble(t + Math.random() * 1.0, 0.5);
        break;
      case 'chime':
        [84, 88, 91].forEach((m, i) => this.note(m, t + i * 0.09, 0.4, 2.0));
        break;
      case 'sparkle':
        [84, 88, 91, 96].forEach((m, i) => this.note(m, t + i * 0.06, 0.28, 1.2));
        break;
      case 'heart':
        this.note(77, t, 0.45, 1.6); this.note(81, t + 0.16, 0.45, 1.9);
        break;
      case 'pop':
        this.noise(t, 0.14, 1800, 600, 0.3, 2);
        this.bubble(t, 0.9);
        break;
      case 'ripple':
        this.noise(t, 1.2, 900, 200, 0.2, 1.5);
        [72, 79, 84].forEach((m, i) => this.note(m, t + i * 0.12, 0.28, 2.2));
        break;
      case 'type':
        this.note(96 + ((Math.random() * 5) | 0), t, 0.05, 0.22);
        break;
      case 'yes':
        [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => this.note(m, t + i * 0.07, 0.4, 2.4));
        this.noise(t, 1.0, 400, 2800, 0.24, 0.7);
        break;
      case 'ding':
        this.note(93, t, 0.5, 0.5); this.note(100, t + 0.08, 0.45, 0.9);
        break;
      case 'boing':
        [60, 67, 72].forEach((m, i) => this.note(m + 12, t + i * 0.05, 0.3, 0.3));
        break;
      case 'shutter':
        this.noise(t, 0.04, 5200, 3000, 0.55, 3);
        this.noise(t + 0.09, 0.05, 3000, 1400, 0.45, 3);
        break;
      case 'print':
        for (let i = 0; i < 14; i++) this.noise(t + 0.15 + i * 0.07, 0.06, 900, 500, 0.12, 4);
        break;
      case 'coin':
        this.note(88, t, 0.35, 0.3); this.note(95, t + 0.07, 0.35, 0.7);
        break;
      case 'escape':
        this.bubble(t, 0.9); this.bubble(t + 0.05, 0.9); this.bubble(t + 0.1, 0.7);
        break;
      case 'blub':
        for (let i = 0; i < 3; i++) this.bubble(t + i * (0.08 + Math.random() * 0.1), 0.35);
        break;
      case 'talk':
        this.note(88 + ((Math.random() * 7) | 0), t, 0.07, 0.12);
        break;
      default:
    }
  }
}
