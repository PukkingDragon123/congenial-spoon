// Dialogue: a small box along the top of the screen with who's talking, a
// little portrait and the line typing itself out. A line either waits for a
// tap, waits for something to happen (the camera coming up, a photo being
// taken), or moves on by itself when the song is driving the scene.
import { clamp, makeCanvas, hex } from '../util.js';
import { CONFIG, fill } from '../config.js';
import { drawText, textWidth, wrap, chars, LINE_H } from '../font.js';
import { diverSprite, DIVER_FRAMES } from '../art/divers.js';

const WHO = {
  bean: { name: () => 'Mameshiba', col: '#c4f27a', bg: ['#1c3a10', '#0a1806'] },
  me: { name: () => CONFIG.from, col: '#8ad0ff', bg: ['#0e2a5a', '#06122a'] },
  her: { name: () => CONFIG.to, col: '#ffa8d0', bg: ['#4a1438', '#1c0616'] },
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
    this.point = null;   // () => [x, y] | null: a bouncing arrow pointing at something
    this.busts = {};
  }

  get W() { return this.story.W; }

  // Show a line. o.tap: wait for a tap. o.until: wait for that to be true.
  // o.life: seconds to stay once typed, then fade. Resolves when it's done.
  say(who, text, o = {}) {
    if (this.cur && this.cur.res) this.cur.res('replaced');
    const tap = !o.until && o.life == null;
    return new Promise((res) => {
      this.cur = { who, text: fill(text), t: 0, n: 0, a: this.cur ? 1 : 0, tap, until: o.until || null, life: o.life ?? null, res, lines: null, key: '' };
    });
  }

  hide() {
    if (!this.cur) return;
    const c = this.cur;
    if (c.res) { c.res('hidden'); c.res = null; }
    c.out = true;
  }

  // A tap: finish the typing, or move on. True if the tap was used up.
  tap() {
    const c = this.cur;
    if (!c || c.out || !c.tap) return false;
    const total = chars(c.text).length;
    if (c.n < total) { c.n = total; return true; }
    const res = c.res;
    c.res = null;
    c.out = true;
    if (res) res('tap');
    return true;
  }

  waiting() { return !!(this.cur && !this.cur.out && this.cur.tap); }
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
      c.n = Math.min(total, c.n + dt * CPS);
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
    const pt = this.point && this.point();
    if (pt) this.drawArrow(ctx, pt);
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
    // tap to go on
    if (c.tap && c.n >= chars(c.text).length) {
      const ax = x + w - 9, ay = y + h - 8 + (Math.floor(this.t * 3) % 2);
      ctx.fillStyle = S.col;
      ctx.fillRect(ax, ay, 5, 1); ctx.fillRect(ax + 1, ay + 1, 3, 1); ctx.fillRect(ax + 2, ay + 2, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // A chunky arrow bobbing above a point, aimed down at it.
  drawArrow(ctx, [x, y]) {
    const b = Math.round(Math.abs(Math.sin(this.t * 5)) * -4);
    const X = Math.round(x), Y = Math.round(y - 1 + b);
    const rows = ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
    for (const [ox, oy, col] of [[1, 1, '#2a1400'], [0, 0, '#ffe38a']]) {
      ctx.fillStyle = col;
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(X - 3 + i + ox, Y - 7 + j + oy, 1, 1); });
    }
  }
}
