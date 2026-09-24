// A photo quest: a little card in the corner listing what to snap. Each
// target ticks off with a pop when a photo catches it, and when the list is
// done a "quest clear" stamp slams onto the screen.
import { R, TAU, clamp, ease } from '../util.js';
import { drawText, textWidth } from '../font.js';
import { burstStars } from '../world/fx.js';

export class Quest {
  constructor(story, title, place, items, bonus = 30) {
    this.story = story;
    this.title = title;
    this.place = place;
    this.items = items.map(([keys, name]) => ({ keys: [].concat(keys), name, done: false, t: 0 }));
    this.bonus = bonus;
    this.t = 0;
    this.a = 0;
    this.clearT = -1;
    this.point = null; // () => [x, y] | null: bouncing arrow with a "tap!"
  }

  get done() { return this.items.every((i) => i.done); }

  // Called with the keys of everything in a photo; returns true if it
  // finished the quest.
  snapped(keys) {
    let hit = false;
    for (const it of this.items) {
      if (it.done || !it.keys.some((k) => keys.includes(k))) continue;
      it.done = true; it.t = 0; hit = true;
      const [x, y] = this.rowAt(this.items.indexOf(it));
      burstStars(this.story.fx, x + 4, y + 3, 7, { speed: 40, size: 4 });
    }
    if (hit) this.story.sound.sfx('ding');
    if (hit && this.done) { this.clearT = 0; return true; }
    return false;
  }

  update(dt) {
    this.t += dt;
    this.a = Math.min(1, this.a + dt * 3);
    for (const it of this.items) it.t += dt;
    if (this.clearT >= 0) this.clearT += dt;
  }

  box() {
    const w = Math.max(textWidth(this.title) + 22, ...this.items.map((i) => textWidth(i.name) + 22), 84);
    return [5, this.top ?? 5, w, 24 + this.items.length * 11];
  }
  rowAt(i) { const [x, y] = this.box(); return [x + 5, y + 21 + i * 11]; }

  draw(ctx) {
    if (this.point) { const pt = this.point(); if (pt) this.drawArrow(ctx, pt); }
    const out = this.clearT > 2.6 ? clamp((this.clearT - 2.6) / 0.5) : 0;
    const k = this.a * (1 - out);
    if (k > 0) {
      const [x, y0, w, h] = this.box();
      const y = Math.round(y0 - (1 - ease.outBack(this.a)) * 10 - out * 12);
      ctx.globalAlpha = k;
      // a little paper tag with a pin
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 1, y, w + 2, h); ctx.fillRect(x, y - 1, w, h + 2);
      ctx.fillStyle = '#fbf3de'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#efe2c2'; for (let yy = y + 18; yy < y + h - 2; yy += 11) ctx.fillRect(x + 3, yy + 9, w - 6, 1);
      ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = '#e8455f'; ctx.fillRect(x + w - 8, y - 2, 4, 4);
      ctx.fillStyle = '#ffb0c0'; ctx.fillRect(x + w - 7, y - 1, 1, 1);
      drawText(ctx, this.title, x + 5, y + 4, { color: '#c8305a' });
      drawText(ctx, this.place, x + 5, y + 12, { color: '#7a5a3a' });
      this.items.forEach((it, i) => {
        const [rx, ry] = this.rowAt(i);
        // the box, then a check that pops in bigger than it and settles
        ctx.fillStyle = '#6a5440'; ctx.fillRect(rx, ry, 7, 7);
        ctx.fillStyle = '#fffaf0'; ctx.fillRect(rx + 1, ry + 1, 5, 5);
        if (it.done) {
          const s = it.t < 0.25 ? 1 + (1 - it.t / 0.25) * 0.8 : 1;
          ctx.save();
          ctx.translate(rx + 3.5, ry + 3.5); ctx.scale(s, s);
          ctx.fillStyle = '#ff3a74';
          for (const [cx, cy] of [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2], [4, -3]]) ctx.fillRect(cx - 0.5, cy - 0.5, 2, 2);
          ctx.restore();
        }
        drawText(ctx, it.name, rx + 11, ry, { color: it.done ? '#8a7658' : '#3a2a4a' });
        if (it.done) {
          const sw = Math.round(textWidth(it.name) * clamp(it.t / 0.3));
          ctx.fillStyle = '#ff6a9a'; ctx.fillRect(rx + 11, ry + 3, sw, 1);
        }
      });
      ctx.globalAlpha = 1;
    }
    if (this.clearT >= 0 && this.clearT < 3.2) this.drawClear(ctx);
  }

  // QUEST CLEAR!: slams in big and tilted, wobbles, then floats away
  drawClear(ctx) {
    const S = this.story, W = S.W, H = S.H, t = this.clearT;
    const text = 'QUEST CLEAR!';
    const sc = W > 300 ? 3 : 2;
    const inK = ease.outBack(clamp(t / 0.35));
    const outK = clamp((t - 2.5) / 0.6);
    const s = (1 + (1 - inK) * 2.2) * (1 + Math.sin(t * 9) * 0.02 * (1 - outK));
    const w = textWidth(text) * sc + 16, h = 7 * sc + 12;
    ctx.save();
    ctx.globalAlpha = clamp(t / 0.12) * (1 - outK);
    ctx.translate(Math.round(W / 2), Math.round(H * 0.4 - outK * 20));
    ctx.rotate(-0.12 + Math.sin(t * 4) * 0.02);
    ctx.scale(s, s);
    // rays behind
    ctx.fillStyle = 'rgba(255,230,140,0.16)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.8;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.07) * w * 0.62, Math.sin(a - 0.07) * w * 0.62);
      ctx.lineTo(Math.cos(a + 0.07) * w * 0.62, Math.sin(a + 0.07) * w * 0.62);
      ctx.fill();
    }
    ctx.fillStyle = '#5a0a2a'; ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    ctx.fillStyle = '#ff4a7a'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 1); ctx.fillRect(-w / 2 + 2, h / 2 - 3, w - 4, 1);
    drawText(ctx, text, 0, -Math.round((7 * sc) / 2), { align: 'center', scale: sc, color: '#ffffff', shadow: '#a0104a' });
    ctx.restore();
    if (t > 0.35 && t < 0.5 && !this.burst) {
      this.burst = true;
      burstStars(S.fx, W / 2, H * 0.4, 26, { speed: 140, size: 6, life: 1.2 });
      for (let i = 0; i < 30; i++) S.fx.add({ kind: 'spark', x: W / 2 + (R() - 0.5) * w, y: H * 0.4, vx: (R() - 0.5) * 160, vy: -60 - R() * 90, ay: 120, drag: 0.6, age: 0, life: 1.4 + R() * 0.6, size: 2, col: ['#ff6a9a', '#ffe38a', '#8ad0ff', '#b8f070'][i % 4] });
    }
    if (t > 0.5) drawText(ctx, `+${this.bonus} ✦`, W / 2, Math.round(H * 0.4 + h * 1.4 - outK * 20), { align: 'center', scale: 2, color: '#ffe38a', outline: '#3a2200', alpha: clamp((t - 0.5) * 4) * (1 - outK) });
  }

  // A chunky bobbing arrow pointing down at something, with a "tap!".
  drawArrow(ctx, [x, y]) {
    const b = Math.round(Math.abs(Math.sin(this.t * 5)) * -4);
    const X = Math.round(x), Y = Math.round(y - 1 + b);
    const rows = ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
    for (const [ox, oy, col] of [[1, 1, '#2a1400'], [0, 0, '#ffe38a']]) {
      ctx.fillStyle = col;
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(X - 3 + i + ox, Y - 7 + j + oy, 1, 1); });
    }
    drawText(ctx, 'tap!', X, Y - 17, { align: 'center', color: '#ffe38a', outline: '#2a1400' });
  }
}
