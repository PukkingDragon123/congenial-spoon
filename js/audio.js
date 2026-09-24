import { ENERGY, ENERGY_HZ } from './energy.js';
// Soundtrack: plays the song and exposes its loudness and a beat pulse (from
// a pre-measured energy map) so the whole tank can move with the music. Small
// SFX are synthesised on top. If the song can't play, the clock free-runs so
// the story still plays, just silently.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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

  // Before the song: a low, soft wash of water, like standing by the glass.
  ambience(on) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    if (on && !this.amb) {
      const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.07; lg.gain.value = 160;
      lfo.connect(lg).connect(lp.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 2.5);
      src.connect(lp).connect(g).connect(this.sfxBus);
      src.start(t); lfo.start(t);
      this.amb = { src, lfo, g };
    } else if (!on && this.amb) {
      const a = this.amb;
      this.amb = null;
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(0.0001, t + 2.5);
      a.src.stop(t + 2.6); a.lfo.stop(t + 2.6);
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
    this.ambience(false);
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
