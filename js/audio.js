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
    this.buffer = null;
    this.source = null;
    this.startedAt = 0;
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

  // Decode ahead of time so playback can start instantly on the first tap.
  async load() {
    if (this.buffer || this._loading) return;
    this._loading = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('no webaudio');
      this.ctx = this.ctx || new AC();
      const res = await fetch(this.src);
      if (!res.ok) throw new Error('fetch ' + res.status);
      const raw = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(raw);
      this.ready = true;
    } catch (e) {
      console.warn('soundtrack unavailable:', e.message);
      this.ready = false;
    }
    this._loading = false;
  }

  start() {
    if (this.playing) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    const ctx = this.ctx;
    if (!ctx) { this.playing = true; return; }
    if (ctx.state === 'suspended') ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);
    // music bus, with an analyser tapped off it
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.gain.linearRampToValueAtTime(0.92, ctx.currentTime + 2.0);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.musicGain.connect(this.analyser);
    this.musicGain.connect(this.master);
    // sfx bus, sat under the music
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.34;
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
    if (this.buffer) {
      const s = ctx.createBufferSource();
      s.buffer = this.buffer;
      s.connect(this.musicGain);
      s.start();
      this.source = s;
      this.startedAt = ctx.currentTime;
    }
    this.playing = true;
  }

  // Song position in seconds. Falls back to a free-running clock.
  get time() {
    if (this.source && this.ctx && !this.sim) return this.ctx.currentTime - this.startedAt;
    return this.free;
  }

  get duration() { return this.buffer ? this.buffer.duration : 225.4; }

  update(dt) {
    if (!this.playing) return;
    if (!this.source || this.sim) this.free += dt;
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
    if (!this.ctx) return;
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
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
