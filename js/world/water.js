// Water: a real wave simulation over the tank glass. A coarse height field
// obeys the 2D wave equation (each cell is pulled towards the average of its
// neighbours, momentum carries it past, a little damping settles it), and it
// is disturbed by the fish swimming through it, by taps, by the beat, and by
// a slow swell along the surface. Every frame its slopes and a mask of where
// the water is go to the compositor as a small texture: the tank is refracted
// through the slopes and glints where they catch the light.

const GW = 128;

export class Water {
  constructor() {
    this.gw = GW; this.gh = 72;
    this.alloc();
    this.acc = 0;
    this.t = 0;
    this.dropT = 0;
    this.maskKey = '';
    this.strength = 1;
    this.lastBeat = 0;
  }

  alloc() {
    const n = this.gw * this.gh;
    this.h = new Float32Array(n);
    this.v = new Float32Array(n);
    this.mask = new Float32Array(n);
    this.tex = new Uint8Array(n * 4);
  }

  resize(W, H) {
    const gh = Math.max(24, Math.round((GW * H) / W));
    if (gh !== this.gh) { this.gh = gh; this.alloc(); }
    this.W = W; this.H = H;
    this.maskKey = '';
  }

  // screen px -> cell
  cell(sx, sy) { return [Math.floor((sx / this.W) * this.gw), Math.floor((sy / this.H) * this.gh)]; }

  // Push the surface down in a soft round dent (a drop, a tap, a fish).
  splash(sx, sy, amp = 1, rad = 1.6) {
    if (!this.W) return;
    const [cx, cy] = this.cell(sx, sy), r = Math.ceil(rad * 2), { gw, gh } = this;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const x = cx + i, y = cy + j;
      if (x < 1 || y < 1 || x >= gw - 1 || y >= gh - 1) continue;
      const k = y * gw + x;
      if (!this.mask[k]) continue;
      this.v[k] -= amp * Math.exp(-(i * i + j * j) / (rad * rad));
    }
  }

  // Where the water is: inside the window, but never over the couple, who
  // stand on this side of the glass.
  buildMask(stage) {
    const { gw, gh, W, H } = this;
    const c = stage.curves, win = stage.win;
    const m = this.mask;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const sx = ((x + 0.5) / gw) * W, sy = ((y + 0.5) / gh) * H;
      let inside = !!c && sy > c.top(sx) + 1 && sy < c.sill(sx) - 1;
      if (inside && win && (sx < win.l + 2 || sx > win.r - 2)) inside = false;
      if (x < 1 || y < 1 || x > gw - 2 || y > gh - 2) inside = false; // the grid edge is never water
      m[y * gw + x] = inside ? 1 : 0;
    }
  }

  cutCouple(stage) {
    const cp = stage.couple;
    if (!cp || !cp.R) return;
    const R = cp.R, mm = R.m;
    // the couple's drawn extent, from their raster
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    for (let y = 0; y < R.h; y += 3) for (let x = 0; x < R.w; x += 2) if (mm[y * R.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
    if (x1 < x0) return;
    const [fx, fy] = stage.toScreen(stage.coupleX, stage.coupleY, 0);
    const lift = cp.hop || 0;
    const L = fx - R.ox + x0 - 3, Rr = fx - R.ox + x1 + 3, T = fy - R.oy + y0 - lift - 4;
    const { gw, gh, W, H } = this;
    for (let y = 0; y < gh; y++) {
      const sy = ((y + 0.5) / gh) * H;
      if (sy < T) continue;
      for (let x = 0; x < gw; x++) {
        const sx = ((x + 0.5) / gw) * W;
        if (sx > L && sx < Rr) { const k = y * gw + x; this.cut[k] = 1; }
      }
    }
  }

  step() {
    const { gw, gh, h, v, mask } = this;
    const c2 = 0.2, damp = 0.986;
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
      const k = y * gw + x;
      if (!mask[k]) { v[k] = 0; continue; }
      // outside the glass counts as still water, so waves reflect softly
      const n = (mask[k - 1] ? h[k - 1] : h[k]) + (mask[k + 1] ? h[k + 1] : h[k]) + (mask[k - gw] ? h[k - gw] : h[k]) + (mask[k + gw] ? h[k + gw] : h[k]);
      v[k] = (v[k] + c2 * (n - 4 * h[k])) * damp;
    }
    for (let k = 0; k < h.length; k++) h[k] = mask[k] ? Math.max(-3, Math.min(3, (h[k] + v[k]) * 0.999)) : 0;
  }

  update(dt, stage, beat = 0) {
    if (!this.W || !stage) return;
    this.t += dt;
    const key = stage.constructor.name + this.W + 'x' + this.H + ':' + Math.round(stage.cam.y);
    if (key !== this.maskKey) { this.maskKey = key; this.buildMask(stage); }
    // fish wakes: anything moving pushes the water aside
    for (const c of stage.creatures) {
      const sp = Math.hypot(c.vx || 0, c.vy || 0);
      if (sp < 6 || Math.random() > 0.18) continue;
      const [sx, sy] = stage.toScreen(c.x, c.y, c.z);
      if (sx < 0 || sy < 0 || sx >= this.W || sy >= this.H) continue;
      const size = Math.min(2.2, 0.6 + (c.len || 16) / 40);
      this.splash(sx, sy, Math.min(0.25, sp * 0.0022) * size * (1 - (c.z || 0) * 0.6), 1.3 + size * 0.5);
    }
    // a slow swell rolling along under the surface
    const c = stage.curves;
    if (c) {
      const [, row] = this.cell(0, Math.max(c.top(this.W / 2), 0) + 14);
      if (row > 0 && row < this.gh - 1) for (let x = 1; x < this.gw - 1; x++) {
        const k = row * this.gw + x;
        if (this.mask[k]) this.v[k] += (Math.sin(x * 0.22 - this.t * 1.7) * 0.012 + Math.sin(x * 0.07 + this.t * 0.9) * 0.01) * Math.min(1, dt * 60);
      }
    }
    // the odd drip, and a ring on the beat
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.dropT = 0.25 + Math.random() * 0.6;
      this.splash(Math.random() * this.W, Math.random() * this.H * 0.8, 0.25 + Math.random() * 0.35, 2);
    }
    if (beat > 0.95 && this.t - this.lastBeat > 0.4) {
      this.lastBeat = this.t;
      this.splash(this.W * (0.2 + Math.random() * 0.6), this.H * (0.25 + Math.random() * 0.35), 1.1, 2.2);
    }
    // fixed-rate steps so the waves look the same at any frame rate
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= 1 / 60) { this.step(); this.acc -= 1 / 60; }
    this.pack(stage);
  }

  // slopes -> RG, water mask -> B, height -> A
  pack(stage) {
    const { gw, gh, h, mask, tex } = this;
    // keep the water level where it is: splashes only push down, so take the
    // mean back out and the waves ride around zero
    let sum = 0, n = 0;
    for (let k = 0; k < h.length; k++) if (mask[k]) { sum += h[k]; n++; }
    if (n) { const mean = sum / n; for (let k = 0; k < h.length; k++) if (mask[k]) h[k] -= mean; }
    this.cut = this.cut && this.cut.length === mask.length ? this.cut.fill(0) : new Uint8Array(mask.length);
    this.cutCouple(stage);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x, o = k * 4;
      const m = mask[k] && !this.cut[k] ? 1 : 0;
      if (!mask[k]) { tex[o] = 128; tex[o + 1] = 128; tex[o + 2] = 0; tex[o + 3] = 128; continue; }
      // slopes from water cells only, so the window edges don't read as cliffs
      const hh = (j) => (j >= 0 && j < h.length && mask[j] ? h[j] : h[k]);
      const hx = x > 0 && x < gw - 1 ? hh(k + 1) - hh(k - 1) : 0;
      const hy = y > 0 && y < gh - 1 ? hh(k + gw) - hh(k - gw) : 0;
      tex[o] = Math.max(0, Math.min(255, 128 + hx * 70));
      tex[o + 1] = Math.max(0, Math.min(255, 128 + hy * 70));
      tex[o + 2] = m * 255;
      tex[o + 3] = Math.max(0, Math.min(255, 128 + h[k] * 60));
    }
  }
}
