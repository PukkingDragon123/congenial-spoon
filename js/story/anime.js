// Anime-style overlays for big feelings: pop-up emotes over someone's head,
// manga focus lines closing in, speed bursts, an impact flash, and bouncy
// shout text. Everything is drawn on the UI layer in screen pixels; `at` is
// a function returning where to anchor, so an effect follows its character.
import { TAU, clamp, R } from '../util.js';
import { drawText, textWidth } from '../font.js';

export class AnimeFX {
  constructor() {
    this.items = [];
    this.focus = 0;      // 0..1 strength of the focus lines
    this.focusAt = null; // () => [x, y]
    this.flash = 0;
    this.shake = 0;
  }

  emote(at, text, life = 1.4, col = '#ff3a6a') { this.items.push({ kind: 'emote', at, text, life, age: 0, col }); }
  burst(at, life = 0.5, col = '#ffffff') { this.items.push({ kind: 'burst', at, life, age: 0, col, seed: R() * TAU }); }
  shout(at, text, life = 1.3, col = '#ffe14a') { this.items.push({ kind: 'shout', at, text, life, age: 0, col }); }
  impact(at, strength = 1) {
    this.flash = Math.max(this.flash, 0.75 * strength);
    this.shake = Math.max(this.shake, 0.35 * strength);
    this.focus = Math.max(this.focus, strength);
    this.focusAt = at;
    this.burst(at, 0.6);
  }

  update(dt) {
    for (const it of this.items) it.age += dt;
    this.items = this.items.filter((it) => it.age < it.life);
    this.focus = Math.max(0, this.focus - dt * 0.9);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.shake = Math.max(0, this.shake - dt);
  }

  // camera jitter for the story to add to the stage camera
  jitter() { return this.shake > 0 ? [(R() - 0.5) * 6 * this.shake, (R() - 0.5) * 4 * this.shake] : [0, 0]; }

  draw(ctx, W, H) {
    if (this.focus > 0.02 && this.focusAt) this.drawFocus(ctx, W, H);
    for (const it of this.items) {
      const [x, y] = it.at();
      const k = it.age / it.life;
      if (it.kind === 'burst') this.drawBurst(ctx, x, y, it, k);
      else if (it.kind === 'emote') this.drawEmote(ctx, x, y, it, k, W > 400 ? 2 : 1);
      else if (it.kind === 'shout') this.drawShout(ctx, x, y, it, k, W > 400 ? 3 : 2);
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // manga concentration lines: thin wedges from the screen edge towards a
  // point, redrawn at random every frame so they flicker
  drawFocus(ctx, W, H) {
    const [cx, cy] = this.focusAt();
    const Rr = Math.hypot(W, H);
    ctx.globalAlpha = Math.min(1, this.focus) * 0.85;
    ctx.fillStyle = '#ffffff';
    const n = 56;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.08;
      const inner = Rr * (0.2 + R() * 0.16) + 40 * (1 - this.focus);
      const w = 0.012 + R() * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a - w) * Rr, cy + Math.sin(a - w) * Rr);
      ctx.lineTo(cx + Math.cos(a + w) * Rr, cy + Math.sin(a + w) * Rr);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBurst(ctx, x, y, it, k) {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = it.col;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = it.seed + (i / n) * TAU;
      const r0 = 8 + k * 26, r1 = r0 + 6 + (i % 2) * 6 * (1 - k);
      for (let r = r0; r < r1; r += 1) ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // a white speech bubble with a tail that pops in big and settles
  drawEmote(ctx, x, y, it, k, base) {
    const pop = it.age < 0.08 ? 2.4 : it.age < 0.18 ? 1.6 : 1;
    const sc = base + (pop > 1.5 ? 1 : 0);
    const tw = textWidth(it.text) * sc, th = 7 * sc;
    const bob = Math.round(Math.sin(it.age * 8) * 1);
    const bw = tw + 6, bh = th + 5;
    const bx = Math.round(x - bw / 2), by = Math.round(y - bh - 6 + bob - (pop - 1) * 3);
    ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    ctx.fillStyle = '#10142a';
    ctx.fillRect(bx - 1, by, bw + 2, bh); ctx.fillRect(bx, by - 1, bw, bh + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bw, bh);
    // tail
    ctx.fillStyle = '#10142a';
    ctx.fillRect(Math.round(x) - 1, by + bh, 3, 1); ctx.fillRect(Math.round(x), by + bh + 1, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x), by + bh, 1, 1); ctx.fillRect(Math.round(x), by + bh + 1, 1, 1);
    drawText(ctx, it.text, bx + 3, by + 3, { scale: sc, color: it.col });
    // little shock marks either side
    if (it.text.includes('!')) {
      ctx.fillStyle = '#ffffff';
      for (const s of [-1, 1]) for (let j = 0; j < 3; j++) ctx.fillRect(Math.round(x + s * (bw / 2 + 3 + j)), by + 2 + j * 2 - (s > 0 ? 0 : 0), 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  // chunky bouncing text with a coloured shadow, letters landing one by one
  drawShout(ctx, x, y, it, k, sc) {
    const a = k > 0.8 ? (1 - k) / 0.2 : 1;
    const t = it.age;
    drawText(ctx, it.text, x, y - 30 - Math.round(clamp(1 - t * 5) * 10), {
      scale: sc, align: 'center', color: '#ffffff', outline: '#2a0a3a', shadow: it.col, alpha: a,
      wave: (i) => Math.sin(t * 12 - i * 0.9) * 1.5 * (1 - k),
    });
  }
}
