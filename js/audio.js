// Procedural soundtrack: music box over an underwater hum, plus small SFX.
// Everything is synthesized with WebAudio, so there are no asset files.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  [53, 57, 60], // F
  [52, 55, 60], // C/E
  [50, 53, 57], // Dm
  [46, 50, 53], // Bb
  [53, 57, 60], // F
  [48, 52, 55], // C
  [46, 50, 53], // Bb
  [48, 52, 55], // C
];
// Melody: one entry per quarter note, 0 = rest/hold
const MELODY = [
  [72, 0, 69, 0], [67, 0, 0, 64], [65, 0, 69, 0], [74, 0, 0, 72],
  [72, 0, 69, 72], [67, 0, 0, 0], [65, 0, 62, 65], [64, 0, 0, 0],
];
const ARP = [0, 2, 1, 3, 4, 3, 1, 2];

export class SoundEngine {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.level = 0; // 0 ambient only, 1 arp, 2 melody, 3 finale
    this.step = 0;
    this.nextT = 0;
  }

  start() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.5);
    this.master.connect(ctx.destination);
    // reverb
    const len = ctx.sampleRate * 2.8;
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = imp;
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.42;
    this.verb.connect(verbGain).connect(this.master);
    // echo
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.39;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const dGain = ctx.createGain();
    dGain.gain.value = 0.28;
    this.delay.connect(dGain).connect(this.master);
    // music bus
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.16;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200;
    this.bus.connect(tone);
    tone.connect(this.master);
    tone.connect(this.verb);
    tone.connect(this.delay);
    // sfx bus
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.5;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.verb);
    this.ambience();
    this.nextT = ctx.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.ctx) this.ctx.suspend();
    if (on) { if (!this.ctx) this.start(); else this.ctx.resume(); }
  }

  ambience() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start();
  }

  note(m, t, vel = 1, dur = 1.8, bus = this.bus) {
    const ctx = this.ctx;
    const f = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(bus);
    for (const [mul, amp] of [[1, 1], [2, 0.28], [3.01, 0.08], [4.2, 0.03]]) {
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

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const spb = 60 / 74 / 2; // eighth notes at 74 bpm
    while (this.nextT < this.ctx.currentTime + 0.25) {
      const t = this.nextT;
      const bar = Math.floor(this.step / 8) % 8, e = this.step % 8;
      const ch = CHORDS[bar];
      const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24];
      if (this.level >= 1) this.note(tones[ARP[e]], t, e === 0 ? 0.9 : 0.55, 1.6);
      if (this.level >= 1 && e === 0) this.note(ch[0], t, 0.45, 2.6);
      if (this.level >= 2 && e % 2 === 0) {
        const m = MELODY[bar][e / 2];
        if (m) this.note(m + 12, t, 0.75, 2.2);
      }
      if (this.level >= 3 && e === 4 && Math.random() < 0.6) this.note(tones[4] + 12, t, 0.3, 1.2);
      if (Math.random() < 0.1) this.bubble(t + Math.random() * spb, 0.25);
      this.step++;
      this.nextT += spb;
    }
  }

  bubble(t = this.ctx.currentTime, vol = 0.5) {
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
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'dive':
        this.noise(t, 1.8, 300, 2600, 0.5, 0.8);
        for (let i = 0; i < 18; i++) this.bubble(t + Math.random() * 1.6, 0.8);
        break;
      case 'whoosh':
        this.noise(t, 1.6, 2400, 260, 0.4, 0.9);
        for (let i = 0; i < 8; i++) this.bubble(t + Math.random() * 1.2, 0.6);
        break;
      case 'chime':
        [84, 88, 91].forEach((m, i) => this.note(m, t + i * 0.09, 0.5, 2.4, this.sfxBus));
        break;
      case 'sparkle':
        [84, 88, 91, 96].forEach((m, i) => this.note(m, t + i * 0.06, 0.35, 1.4, this.sfxBus));
        break;
      case 'heart':
        this.note(77, t, 0.6, 1.8, this.sfxBus); this.note(81, t + 0.16, 0.6, 2.2, this.sfxBus);
        break;
      case 'pop':
        this.noise(t, 0.15, 1800, 600, 0.35, 2);
        this.bubble(t, 1);
        break;
      case 'ripple':
        this.noise(t, 1.4, 900, 200, 0.25, 1.5);
        [72, 79, 84].forEach((m, i) => this.note(m, t + i * 0.12, 0.35, 2.6, this.sfxBus));
        break;
      case 'type':
        this.note(96 + ((Math.random() * 5) | 0), t, 0.07, 0.25, this.sfxBus);
        break;
      case 'yes':
        [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => this.note(m, t + i * 0.07, 0.5, 2.8, this.sfxBus));
        this.noise(t, 1.2, 400, 3000, 0.3, 0.7);
        break;
      case 'escape':
        this.bubble(t, 1); this.bubble(t + 0.05, 1); this.bubble(t + 0.1, 0.8);
        break;
      default:
    }
  }
}
