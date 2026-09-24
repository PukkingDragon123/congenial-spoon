// Dialogue: a small box along the top of the screen with who's talking, a
// little portrait and the line typing itself out. A line either waits for a
// tap, waits for something to happen (the camera coming up, a photo being
// taken), or moves on by itself. ask() adds reply buttons under the box:
// you pick what she says.
import { clamp, makeCanvas, hex } from '../util.js';
import { CONFIG, fill } from '../config.js';
import { drawText, textWidth, wrap, chars, LINE_H } from '../font.js';
import { diverSprite, DIVER_FRAMES } from '../art/divers.js';

const WHO = {
  bean: { name: () => 'Mameshiba', col: '#c4f27a', bg: ['#1c3a10', '#0a1806'] },
  me: { name: () => 'ME', col: '#8ad0ff', bg: ['#0e2a5a', '#06122a'] },
  her: { name: () => 'YOU', col: '#ffa8d0', bg: ['#4a1438', '#1c0616'] },
};
const PORT = 30;       // portrait size
const CPS = 42;        // letters typed per second

// A head-and-shoulders silhouette, backlit from the tank behind it.
function bust(who) {
  const c = makeCanvas(PORT, PORT), x = c.ctx;
  const m = new Uint8Array(PORT * PORT);
  const set = (px, py) => { if (px >= 0 && py >= 0 && px < PORT && py < PORT) m[py * PORT + px] = 1; };
  const disc = (cx, cy, rx, ry) => { for (let py = 0; py < PORT; py++) for (let px = 0; px < PORT; px++) if (((px + 0.5 - cx) / rx) ** 2 + ((py + 0.5 - cy) / ry) ** 2 < 1) set(px, py); };
  const cx = 15;
  if (who === 'me') {
    disc(cx, 14, 6.2, 7);                                               // head
    for (let py = 5; py < 11; py++) for (let px = cx - 7; px <= cx + 7; px++) set(px, py); // flat two-block top
    for (let px = cx - 6; px <= cx + 6; px++) set(px, 4);
    for (let py = 19; py < 24; py++) for (let px = cx - 3; px <= cx + 2; px++) set(px, py);  // neck
    for (let py = 23; py < PORT; py++) { const w = 9 + Math.min(4, py - 23); for (let px = cx - w; px <= cx + w; px++) set(px, py); }
  } else {
    disc(cx, 14, 5.8, 6.6);
    disc(cx, 12, 7.4, 7.6);                                             // hair
    for (let py = 12; py < 26; py++) { const w = 7 - Math.max(0, py - 22); for (let px = cx - w; px <= cx + w; px++) set(px, py); }
    for (let py = 24; py < PORT; py++) { const w = 7 + Math.min(4, py - 24); for (let px = cx - w; px <= cx + w; px++) set(px, py); }
  }
  const rim = hex(WHO[who].col);
  for (let py = 0; py < PORT; py++) for (let px = 0; px < PORT; px++) {
    if (!m[py * PORT + px]) continue;
    const edgeR = px + 1 >= PORT || !m[py * PORT + px + 1];
    const edgeU = py === 0 || !m[(py - 1) * PORT + px];
    const edgeL = px === 0 || !m[py * PORT + px - 1];
    let col = [12, 10, 22];
    if (edgeR || edgeU) col = rim;
    else if (edgeL) col = [40, 36, 64];
    x.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    x.fillRect(px, py, 1, 1);
  }
  return c;
}

export class Dialog {
  constructor(story) {
    this.story = story;
    this.cur = null;
    this.t = 0;
    this.busts = {};
  }

  get W() { return this.story.W; }

  // Show a line. o.tap: wait for a tap. o.until: wait for that to be true.
  // o.life: seconds to stay once typed, then fade. Resolves when it's done.
  say(who, text, o = {}) {
    if (this.cur && this.cur.res) this.cur.res('replaced');
    const tap = !o.until && o.life == null && !o.choices;
    return new Promise((res) => {
      this.cur = { who, text: fill(text), t: 0, n: 0, a: this.cur && !this.cur.out ? 1 : 0, tap, until: o.until || null, life: o.life ?? null, res, lines: null, key: '', choices: o.choices || null, cps: o.cps || CPS };
    });
  }

  // A line with reply buttons; resolves with the index of the one picked.
  ask(who, text, choices) { return this.say(who, text, { choices }); }

  hide() {
    if (!this.cur) return;
    const c = this.cur;
    if (c.res) { c.res('hidden'); c.res = null; }
    c.out = true;
  }

  // A tap: finish the typing, pick a reply, or move on. True if the tap was
  // used up.
  tap(x, y) {
    const c = this.cur;
    if (!c || c.out || !(c.tap || c.choices)) return false;
    const total = chars(c.text).length;
    if (c.n < total) { c.n = total; return true; }
    if (c.choices) {
      const i = x == null ? 0 : this.choiceAt(x, y);   // a key press takes the first reply
      if (i < 0) return true;      // waiting on an answer: taps elsewhere do nothing
      this.story.sound.sfx('pop');
      const res = c.res;
      c.res = null; c.out = true; c.picked = i;
      if (res) res(i);
      return true;
    }
    const res = c.res;
    c.res = null;
    c.out = true;
    if (res) res('tap');
    return true;
  }

  waiting() { return !!(this.cur && !this.cur.out && (this.cur.tap || this.cur.choices)); }
  // how far down the screen the box (and its buttons) reaches, 0 if hidden
  bottom() {
    if (!this.cur || this.cur.a <= 0) return 0;
    const L = this.layout(), B = this.choiceRects(L);
    return B.length ? Math.max(...B.map((r) => r[1] + r[3])) + 2 : L.y + L.h + 2;
  }
  choiceRects(L = this.layout()) {
    const c = this.cur;
    if (!c || !c.choices || c.n < chars(c.text).length) return [];
    const ws = c.choices.map((t) => textWidth(fill(t)) + 14), gap = 5;
    const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    const y = L.y + L.h + 4, out = [];
    if (total <= L.w) {
      let x = L.x + L.w - total;
      ws.forEach((w) => { out.push([x, y, w, 13]); x += w + gap; });
    } else ws.forEach((w, i) => out.push([L.x + L.w - Math.min(w, L.w), y + i * 16, Math.min(w, L.w), 13]));
    return out;
  }
  choiceAt(x, y) {
    return this.choiceRects().findIndex(([bx, by, bw, bh]) => x >= bx - 2 && x <= bx + bw + 2 && y >= by - 2 && y <= by + bh + 2);
  }
  typed() { return !!(this.cur && this.cur.n >= chars(this.cur.text).length); }

  update(dt) {
    this.t += dt;
    const c = this.cur;
    if (!c) return;
    c.t += dt;
    if (c.out) { c.a -= dt * 5; if (c.a <= 0) this.cur = null; return; }
    c.a = Math.min(1, c.a + dt * 6);
    const total = chars(c.text).length;
    if (c.n < total) {
      const before = Math.floor(c.n);
      c.n = Math.min(total, c.n + dt * c.cps);
      if (Math.floor(c.n) !== before && Math.floor(c.n) % 2 === 0 && chars(c.text)[Math.floor(c.n) - 1] !== ' ') this.story.sound.sfx(c.who === 'bean' ? 'talk' : 'type');
      c.typedAt = c.t;
      return;
    }
    if (c.until && c.until()) { const res = c.res; c.res = null; c.until = null; if (res) res('done'); }
    if (c.life != null && c.t - (c.typedAt || 0) > c.life) { const res = c.res; c.res = null; c.out = true; if (res) res('done'); }
  }

  layout() {
    const c = this.cur, W = this.W;
    // centred on wide screens; on narrow ones it leaves the speaker icon clear
    const w = Math.min(300, W - 24);
    const tw = w - PORT - 16;
    const key = W + '|' + c.text;
    if (c.key !== key) { c.key = key; c.lines = wrap(c.text, tw); }
    const h = Math.max(PORT + 8, 17 + c.lines.length * LINE_H);
    return { x: W >= 340 ? Math.round((W - w) / 2) : 4, y: 4, w, h, tw };
  }

  portrait(who) {
    if (who === 'bean') return null;
    return this.busts[who] || (this.busts[who] = bust(who));
  }

  draw(ctx) {
    const c = this.cur;
    if (!c) return;
    const { x, y: y0, w, h } = this.layout();
    const k = clamp(c.a);
    const y = Math.round(y0 - (1 - k) * 6);
    const S = WHO[c.who] || WHO.me;
    ctx.globalAlpha = k;
    // the box: dark glass with a lit rim and softened corners
    ctx.fillStyle = '#04060f';
    ctx.fillRect(x + 1, y - 1, w - 2, h + 2); ctx.fillRect(x - 1, y + 1, w + 2, h - 2); ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = '#10183a';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#3a4a86';
    ctx.fillRect(x + 2, y + 1, w - 4, 1);
    ctx.fillStyle = S.col;
    ctx.globalAlpha = k * 0.5;
    ctx.fillRect(x + 2, y + h - 2, w - 4, 1);
    ctx.globalAlpha = k;
    // portrait window
    const px = x + 4, py = y + 4;
    const g = ctx.createLinearGradient(0, py, 0, py + PORT);
    g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
    ctx.fillStyle = '#02030a'; ctx.fillRect(px - 1, py - 1, PORT + 2, PORT + 2);
    ctx.fillStyle = g; ctx.fillRect(px, py, PORT, PORT);
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, PORT, PORT); ctx.clip();
    const talking = c.n < chars(c.text).length;
    if (c.who === 'bean') {
      const img = diverSprite('bean', Math.floor(this.t * 5) % DIVER_FRAMES);
      const bob = Math.round(Math.sin(this.t * 3) * 1 + (talking ? Math.abs(Math.sin(this.t * 14)) * -1.5 : 0));
      ctx.drawImage(img, px + PORT - img.width + 6, py + Math.round((PORT - img.height) / 2) + 3 + bob);
    } else {
      const img = this.portrait(c.who);
      const bob = talking ? Math.round(Math.abs(Math.sin(this.t * 12)) * -1) : 0;
      ctx.drawImage(img, px, py + 2 + bob);
    }
    ctx.restore();
    // name and line
    const tx = px + PORT + 7;
    drawText(ctx, S.name(), tx, y + 4, { color: S.col, outline: '#04060f' });
    let left = Math.floor(c.n);
    c.lines.forEach((ln, i) => {
      const n = chars(ln).length;
      if (left > 0) drawText(ctx, ln, tx, y + 15 + i * LINE_H, { color: '#f2f4ff', count: Math.min(n, left) });
      left -= n + 1;
    });
    // your replies: pink bubbles under the box
    if (c.choices && !c.out) {
      const hv = this.choiceAt(...this.story.mouse);
      this.choiceRects({ x, y: y0, w, h }).forEach(([bx, by, bw, bh], i) => {
        const on = hv === i, lift = on ? -1 : 0, pop = Math.round(Math.sin(this.t * 4 + i * 1.3) * 0.6);
        ctx.fillStyle = '#04060f'; ctx.fillRect(bx - 1, by + lift + pop, bw + 2, bh); ctx.fillRect(bx, by - 1 + lift + pop, bw, bh + 2);
        ctx.fillStyle = on ? '#ff8ac0' : '#e8508a'; ctx.fillRect(bx, by + lift + pop, bw, bh);
        ctx.fillStyle = '#ffc4dc'; ctx.fillRect(bx + 1, by + lift + pop, bw - 2, 1);
        ctx.fillStyle = '#ffffff'; const ty = by + 4 + lift + pop;
        ctx.fillRect(bx + 4, ty, 1, 5); ctx.fillRect(bx + 5, ty + 1, 1, 3); ctx.fillRect(bx + 6, ty + 2, 1, 1);
        drawText(ctx, fill(c.choices[i]), bx + 10, by + 3 + lift + pop, { color: '#ffffff' });
      });
    }
    // tap to go on
    if (c.tap && c.n >= chars(c.text).length) {
      const ax = x + w - 9, ay = y + h - 8 + (Math.floor(this.t * 3) % 2);
      ctx.fillStyle = S.col;
      ctx.fillRect(ax, ay, 5, 1); ctx.fillRect(ax + 1, ay + 1, 3, 1); ctx.fillRect(ax + 2, ay + 2, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
