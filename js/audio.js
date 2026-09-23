// Soundtrack: plays the song and exposes a live analysis of it (overall
// level, bass, and a decaying beat pulse) so the whole tank can move with the
// music. Small SFX are still synthesised on top. If the track can't load the
// clock free-runs so the story still plays, just silently.

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

  // Stream the song through an <audio> element: it starts faster than
  // decoding, and browsers reliably allow it once unlocked by a tap.
  async load() {
    if (this.el) return;
    const el = (this.el = new Audio());
    el.src = this.src;
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    await new Promise((res) => {
      const done = () => { el.removeEventListener('canplaythrough', done); el.removeEventListener('error', fail); this.ready = true; res(); };
      const fail = () => { console.warn('soundtrack unavailable'); res(); };
      el.addEventListener('canplaythrough', done);
      el.addEventListener('error', fail);
      el.load();
    });
  }

  // Must run synchronously inside a user gesture (pointerdown / keydown).
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !this.ctx) this.ctx = new AC();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    // play-and-pause inside the gesture so a later play() is allowed
    if (this.el && !this.playing) {
      const pr = this.el.play();
      if (pr && pr.then) pr.then(() => { if (!this.playing) { this.el.pause(); this.el.currentTime = 0; } }).catch(() => {});
    }
  }

  start() {
    if (this.playing) return;
    const ctx = this.ctx;
    this.playing = true;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.enabled ? 0.34 : 0;
      const verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 2.2);
      const imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = imp.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
      verb.buffer = imp;
      const vg = ctx.createGain();
      vg.gain.value = 0.3;
      this.sfxBus.connect(verb).connect(vg).connect(this.master);
      this.sfxBus.connect(this.master);
    }
    if (this.el) {
      const el = this.el;
      el.currentTime = 0;
      el.volume = this.enabled ? 1 : 0;
      el.muted = !this.enabled;
      // tap the element for the analyser; if that fails it still plays
      let same = false;
      try { same = new URL(el.currentSrc || el.src, location.href).origin === location.origin; } catch (e) { /* ignore */ }
      if (ctx && !this.analyser && same) {
        try {
          const src = ctx.createMediaElementSource(el);
          this.analyser = ctx.createAnalyser();
          this.analyser.fftSize = 512;
          this.analyser.smoothingTimeConstant = 0.72;
          this.freq = new Uint8Array(this.analyser.frequencyBinCount);
          src.connect(this.analyser);
          this.analyser.connect(this.master);
        } catch (e) { this.analyser = null; }
      }
      const pr = el.play();
      if (pr && pr.catch) pr.catch((e) => { console.warn('play blocked:', e.message); this.blocked = true; });
      this.source = el;
    }
  }

  // Retry from a later tap if the first play() was refused.
  retry() {
    if (this.blocked && this.el) { this.blocked = false; this.unlocked = false; this.unlock(); this.el.play().catch(() => { this.blocked = true; }); }
  }

  // Song position in seconds. Falls back to a free-running clock.
  get time() {
    if (this.source && !this.sim && !this.source.paused) return this.source.currentTime;
    if (this.source && !this.sim && this.source.currentTime > 0) return this.source.currentTime;
    return this.free;
  }

  get duration() { return (this.el && this.el.duration) || 225.4; }

  update(dt) {
    if (!this.playing) return;
    if (!this.source || this.sim || this.blocked || (this.source.paused && this.source.currentTime === 0)) this.free += dt;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.beat = Math.max(0, this.beat - dt * 2.4);
    if (!this.analyser || this.sim) {
      // no live signal: keep a gentle pulse so the tank still moves
      const b = Math.floor(this.time / (60 / 72));
      if (b !== this._lastB) { this._lastB = b; this.pulse = 1; this.beat = 1; }
      this.level += (0.4 - this.level) * Math.min(1, dt * 2);
      return;
    }
    this.analyser.getByteFrequencyData(this.freq);
    const f = this.freq, n = f.length;
    let lo = 0, mid = 0, hi = 0;
    for (let i = 1; i < 8; i++) lo += f[i];
    for (let i = 8; i < 48; i++) mid += f[i];
    for (let i = 48; i < n; i++) hi += f[i];
    lo /= 7 * 255; mid /= 40 * 255; hi /= (n - 48) * 255;
    this.bass += (lo - this.bass) * Math.min(1, dt * 14);
    this.high += (hi - this.high) * Math.min(1, dt * 10);
    const lv = lo * 0.55 + mid * 0.45;
    this.level += (lv - this.level) * Math.min(1, dt * 6);
    // beat = bass jumping above its running average
    this._avg += (lo - this._avg) * Math.min(1, dt * 1.1);
    this._cool -= dt;
    if (lo > this._avg * 1.28 + 0.02 && this._cool <= 0 && lo > 0.06) {
      this._cool = 0.22;
      this.beat = 1;
      this.pulse = 1;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.el) { this.el.muted = !on; this.el.volume = on ? 1 : 0; }
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
      case 'escape':
        this.bubble(t, 0.9); this.bubble(t + 0.05, 0.9); this.bubble(t + 0.1, 0.7);
        break;
      default:
    }
  }
}
