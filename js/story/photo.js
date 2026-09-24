// Photo mode: a little vintage camera. Aim at the tank and tap to snap; the
// shot prints out of the camera, develops, and is scored by what's in it.
// Every species you catch goes into a postcard album, rare ones are worth
// more, and points buy camera upgrades (a wider lens, colour film, a bigger
// roll). Progress is kept in this browser.
import { TAU, clamp, lerp, ease, R } from '../util.js';
import { makeCanvas } from '../util.js';
import { drawText, textWidth } from '../font.js';

// key -> [name, rarity 1..4]
export const SPECIES = {
  jelly: ['Moon Jelly', 1], clown: ['Clownfish', 1], tang: ['Blue Tang', 1], butterfly: ['Butterfly', 1],
  snapper: ['Snapper', 1], minnow: ['Minnow', 1], trevally: ['Trevally', 1], crab: ['Crab', 1], me: ['Just Me', 1],
  nettle: ['Sea Nettle', 2], batfish: ['Batfish', 2], giant: ['Giant GT', 2], grouper: ['Grouper', 2],
  bigjelly: ['Giant Jelly', 3], shark: ['Sand Tiger', 3], reefshark: ['Reef Shark', 3], ray: ['Stingray', 3], turtle: ['Sea Turtle', 3],
  whaleshark: ['Whale Shark', 4], bean: ['Bean Pup', 4], treefriend: ['Tree Friend', 4], us: ['Us ♥', 4],
};
const ORDER = Object.keys(SPECIES).sort((a, b) => SPECIES[a][1] - SPECIES[b][1]);
const RARITY_PTS = [0, 10, 25, 60, 150];
const RARITY_COL = ['#888', '#a8d8ff', '#8affc0', '#ffb04a', '#ff6ad0'];
const RARITY_NAME = ['', 'common', 'uncommon', 'rare', 'legendary'];

export const UPGRADES = {
  lens: { name: 'Lens', costs: [60, 160, 320], info: ['a wider frame'] },
  film: { name: 'Film', costs: [80, 200, 400], info: ['richer colour, more points'] },
  roll: { name: 'Roll', costs: [50, 130, 260], info: ['more shots, faster reload'] },
};
const FRAME_W = [0.26, 0.33, 0.41, 0.5]; // share of the screen width
const LENSES = ['small', 'medium', 'wide', 'ultra'];
const FILMS = ['sepia', 'faded', 'warm', 'vivid'];
const FILM_MULT = [1, 1.25, 1.5, 2];
const ROLL_CAP = [6, 9, 12, 16];
const RELOAD = [4, 3, 2.2, 1.5];
const SAVE_KEY = 'vcag-photo-1';

const keyOf = (c) => {
  if (c.kind === 'jelly') return c.hue === 'nettle' ? 'nettle' : c.len >= 40 ? 'bigjelly' : 'jelly';
  return SPECIES[c.kind] ? c.kind : null;
};

export class PhotoMode {
  constructor(story) {
    this.story = story;
    this.on = false;
    this.album = null;       // { tab, page, card } when open
    this.aim = null;
    this.points = 0;
    this.shown = 0;          // points as displayed, counting up
    this.levels = { lens: 0, film: 0, roll: 0 };
    this.book = {};          // key -> { n, score, img (canvas) }
    this.shots = 0;
    this.load();
    this.film = ROLL_CAP[this.levels.roll];
    this.reload = 0;
    this.prints = [];        // queued prints; the first one animates
    this.flash = 0;
    this.shake = 0;
    this.albumBounce = 0;
    this.t = 0;
  }

  // ------------------------------------------------------------ storage --
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.points = d.points | 0; this.shown = this.points; this.shots = d.shots | 0;
      Object.assign(this.levels, d.levels || {});
      for (const [k, v] of Object.entries(d.book || {})) {
        if (!SPECIES[k]) continue;
        const e = { n: v.n | 0, score: v.score | 0, img: null };
        if (v.img) { const im = new Image(); im.onload = () => { e.img = toCanvas(im); }; im.src = v.img; }
        this.book[k] = e;
      }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  save() {
    try {
      const book = {};
      for (const [k, v] of Object.entries(this.book)) book[k] = { n: v.n, score: v.score, img: v.img ? v.img.toDataURL() : v.url || null };
      localStorage.setItem(SAVE_KEY, JSON.stringify({ points: this.points, shots: this.shots, levels: this.levels, book }));
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------- layout --
  get W() { return this.story.W; }
  get H() { return this.story.H; }
  camRect() { return [this.W - 26, this.H - 17, 22, 14]; }
  bookRect() { return [this.W - 44, this.H - 17, 15, 14]; }
  frameSize() {
    const w = Math.round(Math.min(Math.max(56, this.W * FRAME_W[this.levels.lens]), this.W - 8));
    return [w, Math.round(Math.min(w * 0.72, this.H * 0.5))];
  }
  frameRect() {
    const [w, h] = this.frameSize();
    const [ax, ay] = this.aim || [this.W / 2, this.H * 0.45];
    const x = Math.round(clamp(ax - w / 2, 2, this.W - w - 2));
    const y = Math.round(clamp(ay - h / 2, 2, this.H - h - 20));
    return [x, y, w, h];
  }
  hit(r, x, y) { return x >= r[0] - 1 && x <= r[0] + r[2] + 1 && y >= r[1] - 1 && y <= r[1] + r[3] + 1; }

  available() {
    const s = this.story;
    return s.hud && !s.title && !s.letter && !s.question && !s.buttons.length && !s.replay && s.songT > 9;
  }

  wantsPointer([x, y]) {
    if (!this.available()) return false;
    return !!this.album || this.on || this.hit(this.camRect(), x, y) || this.hit(this.bookRect(), x, y);
  }

  // -------------------------------------------------------------- input --
  pointer(type, x, y) {
    if (!this.available()) return false;
    if (type === 'move') { if (this.on) this.aim = [x, y]; return !!this.album; }
    if (type !== 'down') return false;
    if (this.album) { this.albumTap(x, y); return true; }
    if (this.hit(this.camRect(), x, y)) {
      this.on = !this.on;
      this.aim = [this.W / 2, this.H * 0.45];
      this.story.sound.sfx(this.on ? 'ding' : 'pop');
      return true;
    }
    if (this.hit(this.bookRect(), x, y)) {
      this.album = { tab: 'album', page: 0, card: null };
      this.on = false;
      this.story.sound.sfx('pop');
      return true;
    }
    if (this.on) { this.aim = [x, y]; this.snap(); return true; }
    return false;
  }

  // --------------------------------------------------------------- snap --
  snap() {
    const s = this.story;
    if (this.film <= 0) { this.shake = 0.4; s.sound.sfx('escape'); return; }
    this.film--;
    this.shots++;
    const [fx, fy, fw, fh] = this.frameRect();
    s.sound.sfx('shutter');
    this.flash = 1;
    // what's in the frame?
    const st = s.stage;
    const found = new Map();
    const cx = fx + fw / 2, cy = fy + fh / 2;
    const see = (key, sx, sy) => {
      if (sx < fx || sx > fx + fw || sy < fy || sy > fy + fh) return;
      const d = Math.hypot((sx - cx) / fw, (sy - cy) / fh);
      const f = found.get(key);
      if (f) { f.n++; f.d = Math.min(f.d, d); } else found.set(key, { key, n: 1, d });
    };
    for (const c of st.creatures) {
      const key = keyOf(c);
      if (!key) continue;
      const [sx, sy] = st.toScreen(c.x, c.y - (c.hitDY ?? 0), c.z);
      see(key, sx, sy);
      if (sx >= fx && sx <= fx + fw && sy >= fy && sy <= fy + fh && c.react) c.react(c.x + (R() - 0.5) * 6, c.y + 8, 0.4);
    }
    const cp = s.aq.couple, gh = cp.gap / 2;
    const [ux, uy] = st.toScreen(st.coupleX - (cp.apart ? gh : 0), st.coupleY - 40, 0);
    const together = !cp.apart && cp.girlOn !== false && s.songT > 33;
    see(together ? 'us' : 'me', ux, uy);
    // score it
    const list = [...found.values()].sort((a, b) => SPECIES[b.key][1] - SPECIES[a.key][1] || a.d - b.d);
    const mult = FILM_MULT[this.levels.film];
    let pts = 0, fresh = [];
    for (const f of list) {
      const r = SPECIES[f.key][1];
      let p = RARITY_PTS[r] + Math.min(f.n - 1, 6) * 2;
      if (!this.book[f.key]) { p *= 3; fresh.push(f.key); }
      pts += p;
    }
    const main = list[0] || null;
    if (main && main.d < 0.22) pts *= 1.5; // nicely centred
    pts = Math.max(1, Math.round(pts * mult));
    // develop the picture
    const img = this.develop(fx, fy, fw, fh);
    for (const f of list) {
      const e = this.book[f.key] || (this.book[f.key] = { n: 0, score: 0, img: null });
      e.n += f.n > 0 ? 1 : 0;
      if (f === main && pts >= e.score) { e.score = pts; e.img = img; }
      else if (!e.img) e.img = img;
    }
    this.prints.push({ img, pts, main: main ? main.key : null, fresh, t: 0 });
    if (this.prints.length === 1) s.sound.sfx('print');
    this.save();
  }

  // Copy the frame out of the world and age it with the current film.
  develop(fx, fy, fw, fh) {
    const src = this.story.worldCanvas;
    const c = makeCanvas(fw, fh);
    const x = c.ctx;
    if (src) x.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
    const id = x.getImageData(0, 0, fw, fh), d = id.data;
    const film = FILMS[this.levels.film];
    const leak = R() < 0.5 ? [R() < 0.5 ? 0 : fw, R() < 0.5 ? 0 : fh] : null;
    for (let y = 0; y < fh; y++) for (let xx = 0; xx < fw; xx++) {
      const i = (y * fw + xx) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      // sepia tone of this pixel
      const sr = 40 + l * 215, sg = 24 + l * 208, sb = 12 + l * 184;
      if (film === 'sepia') { r = sr; g = sg; b = sb; }
      else if (film === 'faded') { r = lerp(r, sr, 0.45) * 0.85 + 26; g = lerp(g, sg, 0.45) * 0.85 + 22; b = lerp(b, sb, 0.45) * 0.85 + 16; }
      else if (film === 'warm') { r = lerp(r, sr, 0.2) * 1.06 + 6; g = lerp(g, sg, 0.2); b = lerp(b, sb, 0.2) * 0.9; }
      else { const m = (r + g + b) / 3; r = (m + (r - m) * 1.25 - 128) * 1.1 + 134; g = (m + (g - m) * 1.25 - 128) * 1.1 + 128; b = (m + (b - m) * 1.25 - 128) * 1.1 + 122; }
      // vignette, a light leak, and grain
      const vx = xx / fw - 0.5, vy = y / fh - 0.5;
      const v = 1 - (vx * vx + vy * vy) * 1.5;
      r *= v; g *= v; b *= v;
      if (leak) { const k = Math.max(0, 1 - Math.hypot(xx - leak[0], y - leak[1]) / (fw * 0.55)); r += 120 * k * k; g += 50 * k * k; }
      const n = (R() - 0.5) * 22;
      d[i] = clamp(r + n, 0, 255); d[i + 1] = clamp(g + n, 0, 255); d[i + 2] = clamp(b + n, 0, 255);
    }
    x.putImageData(id, 0, 0);
    // the orange date stamp in the corner
    const now = new Date();
    const stamp = `'${String(now.getFullYear()).slice(2)} ${now.getMonth() + 1} ${now.getDate()}`;
    if (fw > textWidth(stamp) + 6) drawText(x, stamp, fw - 3, fh - 10, { align: 'right', color: '#ff9a3a', outline: '#5a1a00' });
    return c;
  }

  // ------------------------------------------------------------- update --
  update(dt) {
    this.t += dt;
    if (!this.available()) { this.on = false; this.album = null; }
    const cap = ROLL_CAP[this.levels.roll];
    if (this.film < cap) { this.reload += dt; if (this.reload >= RELOAD[this.levels.roll]) { this.reload = 0; this.film++; } } else this.reload = 0;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.shake = Math.max(0, this.shake - dt);
    this.albumBounce = Math.max(0, this.albumBounce - dt * 2.5);
    this.shown += (this.points - this.shown) * Math.min(1, dt * 6);
    if (Math.abs(this.points - this.shown) < 0.5) this.shown = this.points;
    const p = this.prints[0];
    if (p) {
      p.t += dt;
      if (p.t >= 4.2) {
        this.prints.shift();
        this.points += p.pts;
        this.albumBounce = 1;
        this.story.sound.sfx('coin');
        this.save();
        if (this.prints.length) this.story.sound.sfx('print');
      }
    }
  }

  // --------------------------------------------------------------- draw --
  draw(ctx) {
    if (!this.available() && !this.prints.length) return;
    const W = this.W, H = this.H;
    if (this.on && !this.album) this.drawViewfinder(ctx);
    if (this.flash > 0) {
      const [fx, fy, fw, fh] = this.frameRect();
      ctx.globalAlpha = this.flash * 0.9;
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(fx, fy, fw, fh);
      ctx.globalAlpha = this.flash * 0.25;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.available()) this.drawHud(ctx);
    if (this.prints.length) this.drawPrint(ctx, this.prints[0]);
    if (this.album) this.drawAlbum(ctx);
  }

  drawHud(ctx) {
    const [cx, cy] = this.camRect(), [bx, by] = this.bookRect();
    const pulse = this.on ? 1 : 0;
    drawCamera(ctx, cx, cy, pulse, this.t);
    drawBook(ctx, bx, by - Math.round(Math.sin(this.albumBounce * Math.PI) * 3));
    const pts = '✦' + Math.round(this.shown);
    drawText(ctx, pts, bx - 3, by + 4, { align: 'right', color: '#ffe38a', outline: '#3a2200' });
    if (this.on) {
      // film left, as a row of little cartridges
      const cap = ROLL_CAP[this.levels.roll];
      const txt = `${this.film}/${cap}`;
      const sx = Math.round((R() - 0.5) * 3 * this.shake * 3);
      drawText(ctx, txt, cx + 11 + sx, cy - 10, { align: 'center', color: this.film ? '#ffffff' : '#ff6a6a', outline: '#1a1020' });
    }
  }

  drawViewfinder(ctx) {
    const W = this.W, H = this.H;
    const [fx, fy, fw, fh] = this.frameRect();
    // warm dim outside the frame, like looking through an old finder
    ctx.fillStyle = 'rgba(20,10,2,0.66)';
    ctx.fillRect(0, 0, W, fy); ctx.fillRect(0, fy + fh, W, H - fy - fh);
    ctx.fillRect(0, fy, fx, fh); ctx.fillRect(fx + fw, fy, W - fx - fw, fh);
    // corner brackets
    ctx.fillStyle = '#fff4dc';
    const L = 7;
    for (const [x, y, sx, sy] of [[fx, fy, 1, 1], [fx + fw - 1, fy, -1, 1], [fx, fy + fh - 1, 1, -1], [fx + fw - 1, fy + fh - 1, -1, -1]]) {
      ctx.fillRect(sx > 0 ? x : x - L + 1, y, L, 1);
      ctx.fillRect(x, sy > 0 ? y : y - L + 1, 1, L);
    }
    // rangefinder circle and crosshair
    const cx = Math.round(fx + fw / 2), cy = Math.round(fy + fh / 2);
    for (let i = 0; i < 24; i += 2) { const a = (i / 24) * TAU + this.t * 0.4; ctx.fillRect(Math.round(cx + Math.cos(a) * 9), Math.round(cy + Math.sin(a) * 9), 1, 1); }
    ctx.fillRect(cx - 3, cy, 2, 1); ctx.fillRect(cx + 2, cy, 2, 1); ctx.fillRect(cx, cy - 3, 1, 2); ctx.fillRect(cx, cy + 2, 1, 2);
    // a blinking red dot and the film type
    if (Math.sin(this.t * 5) > 0) { ctx.fillStyle = '#ff4a4a'; ctx.fillRect(fx + fw - 6, fy + 3, 3, 3); }
    drawText(ctx, FILMS[this.levels.film], fx + 3, fy + 3, { color: '#fff4dc', outline: '#2a1a08' });
    if (!this.film) drawText(ctx, 'reloading...', cx, fy + fh - 11, { align: 'center', color: '#ffb0a0', outline: '#2a0a08' });
  }

  // a print: slides out of the camera, comes forward to develop, shows what
  // you got, then flies into the album
  drawPrint(ctx, p) {
    const W = this.W, H = this.H;
    const img = p.img, pw = img.width + 6, ph = img.height + 16;
    const s = Math.max(1, Math.min(2, Math.floor(Math.min((W - 20) / pw, (H * 0.62) / ph))));
    const [cx, cy] = this.camRect(), [bx, by] = this.bookRect();
    const t = p.t;
    let x, y, sc = 1, a = 1;
    const outX = cx + 11 - pw / 2, outY0 = cy + 6, outY1 = cy - ph + 2;
    const midX = W / 2 - (pw * s) / 2, midY = H * 0.42 - (ph * s) / 2;
    if (t < 1) { x = outX; y = lerp(outY0, outY1, ease.outCubic(t)); }
    else if (t < 1.6) { const k = ease.inOutCubic((t - 1) / 0.6); x = lerp(outX, midX, k); y = lerp(outY1, midY, k); sc = lerp(1, s, k); }
    else if (t < 3.6) { x = midX; y = midY + Math.sin((t - 1.6) * 2) * 1.5; sc = s; }
    else { const k = ease.inCubic((t - 3.6) / 0.6); x = lerp(midX, bx + 7, k); y = lerp(midY, by + 7, k); sc = lerp(s, 0.15, k); a = 1 - k * 0.3; }
    const dev = clamp(1 - t / 2.8); // still developing
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(sc, sc);
    // the card
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(-1, 0, pw + 2, ph); ctx.fillRect(0, -1, pw, ph + 2);
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(img, 3, 3);
    if (dev > 0) { ctx.globalAlpha = a * dev; ctx.fillStyle = '#3a2a1e'; ctx.fillRect(3, 3, img.width, img.height); ctx.globalAlpha = a; }
    const name = p.main ? SPECIES[p.main][0] : 'just water';
    if (t > 1.2) drawText(ctx, fit(name, pw - 6), pw / 2, img.height + 6, { align: 'center', color: '#3a2a4a' });
    ctx.restore();
    ctx.globalAlpha = 1;
    // results while it's up front
    if (t > 1.8 && t < 3.8) {
      const k = clamp((t - 1.8) / 0.25);
      const top = midY - 12;
      if (p.main) {
        const r = SPECIES[p.main][1];
        drawText(ctx, '★'.repeat(r) + ' ' + RARITY_NAME[r], W / 2, top, { align: 'center', color: RARITY_COL[r], outline: '#10142a', alpha: k });
      }
      drawText(ctx, `+${p.pts} ✦`, W / 2, midY + ph * s + 4 - Math.round(k * 3), { align: 'center', scale: W > 200 ? 2 : 1, color: '#ffe38a', outline: '#3a2200', shadow: '#ff9a3a', alpha: k });
      if (p.fresh.length) {
        const bob = Math.round(Math.sin(t * 10) * 1);
        const nx = Math.round(midX + pw * s - 10), ny = Math.round(midY - 4 + bob);
        ctx.fillStyle = '#ff3a6a'; ctx.fillRect(nx - 2, ny - 2, 26, 11);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(nx - 1, ny - 1, 24, 9);
        ctx.fillStyle = '#ff3a6a'; ctx.fillRect(nx, ny, 22, 7);
        drawText(ctx, 'NEW!', nx + 11, ny, { align: 'center', color: '#ffffff' });
      }
    }
  }

  // -------------------------------------------------------------- album --
  panel() { return [4, 4, this.W - 8, this.H - 8]; }
  grid() {
    const [px, py, pw, ph] = this.panel();
    const want = pw > 400 ? 8 : pw > 250 ? 5 : 3;
    const cw = clamp(Math.floor((pw - 8) / want) - 4, 38, 90), ch = Math.round(cw * 0.7) + 16;
    const cols = Math.max(1, Math.floor((pw - 8) / (cw + 4)));
    const rows = Math.max(1, Math.floor((ph - 44) / (ch + 4)));
    const gx = px + Math.round((pw - cols * (cw + 4) + 4) / 2), gy = py + 26;
    return { cw, ch, cols, rows, gx, gy, per: cols * rows, pages: Math.ceil(ORDER.length / (cols * rows)) };
  }
  tabRects() { const [px, py] = this.panel(); return { album: [px + 4, py + 4, 36, 11], camera: [px + 44, py + 4, 42, 11] }; }
  closeRect() { const [px, py, pw] = this.panel(); return [px + pw - 13, py + 3, 10, 10]; }
  navRects() { const [px, py, pw, ph] = this.panel(); return { prev: [px + 6, py + ph - 14, 12, 11], next: [px + pw - 18, py + ph - 14, 12, 11] }; }
  shopRows() {
    const [px, py, pw] = this.panel();
    return Object.keys(UPGRADES).map((k, i) => ({ k, r: [px + 6, py + 24 + i * 30, pw - 12, 26], buy: [px + pw - 52, py + 31 + i * 30, 42, 12] }));
  }

  albumTap(x, y) {
    const A = this.album, snd = this.story.sound;
    if (A.card) { A.card = null; snd.sfx('pop'); return; }
    if (this.hit(this.closeRect(), x, y)) { this.album = null; snd.sfx('pop'); return; }
    const tabs = this.tabRects();
    for (const k of ['album', 'camera']) if (this.hit(tabs[k], x, y)) { A.tab = k; snd.sfx('type'); return; }
    if (A.tab === 'album') {
      const G = this.grid(), nav = this.navRects();
      if (this.hit(nav.prev, x, y)) { A.page = (A.page + G.pages - 1) % G.pages; snd.sfx('type'); return; }
      if (this.hit(nav.next, x, y)) { A.page = (A.page + 1) % G.pages; snd.sfx('type'); return; }
      for (let i = 0; i < G.per; i++) {
        const key = ORDER[A.page * G.per + i];
        if (!key) break;
        const cx = G.gx + (i % G.cols) * (G.cw + 4), cy = G.gy + Math.floor(i / G.cols) * (G.ch + 4);
        if (this.hit([cx, cy, G.cw, G.ch], x, y) && this.book[key]) { A.card = key; snd.sfx('chime'); return; }
      }
    } else {
      for (const row of this.shopRows()) {
        if (!this.hit(row.buy, x, y)) continue;
        const lv = this.levels[row.k], cost = UPGRADES[row.k].costs[lv];
        if (cost == null) return;
        if (this.points < cost) { snd.sfx('escape'); this.shake = 0.3; return; }
        this.points -= cost; this.shown = this.points;
        this.levels[row.k]++;
        if (row.k === 'roll') this.film = ROLL_CAP[this.levels.roll];
        snd.sfx('yes');
        this.save();
        return;
      }
    }
  }

  drawAlbum(ctx) {
    const W = this.W, H = this.H, A = this.album;
    ctx.fillStyle = 'rgba(6,4,14,0.7)';
    ctx.fillRect(0, 0, W, H);
    const [px, py, pw, ph] = this.panel();
    paper(ctx, px, py, pw, ph);
    // tabs, points and close
    const tabs = this.tabRects();
    for (const k of ['album', 'camera']) {
      const [x, y, w, h] = tabs[k], on = A.tab === k;
      ctx.fillStyle = on ? '#ff8ab4' : '#e4d2ac'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = on ? '#c2466e' : '#b89a6a'; ctx.fillRect(x, y + h - 1, w, 1);
      drawText(ctx, k, x + w / 2, y + 2, { align: 'center', color: on ? '#ffffff' : '#6a4a2a' });
    }
    const [cx, cy] = this.closeRect();
    drawText(ctx, '×', cx + 1, cy + 1, { color: '#6a4a2a' });
    const found = ORDER.filter((k) => this.book[k]).length;
    if (pw > 150) drawText(ctx, `✦${this.points}`, cx - 6, py + 6, { align: 'right', color: '#c27a10' });
    if (A.tab === 'album') this.drawGrid(ctx, found);
    else this.drawShop(ctx);
    if (A.card) this.drawPostcard(ctx, A.card);
  }

  drawGrid(ctx, found) {
    const G = this.grid(), A = this.album;
    const [px, py, pw, ph] = this.panel();
    for (let i = 0; i < G.per; i++) {
      const key = ORDER[A.page * G.per + i];
      if (!key) break;
      const x = G.gx + (i % G.cols) * (G.cw + 4), y = G.gy + Math.floor(i / G.cols) * (G.ch + 4);
      const e = this.book[key], [name, r] = SPECIES[key];
      const tilt = ((i * 7) % 3) - 1;
      ctx.fillStyle = 'rgba(80,50,20,0.25)'; ctx.fillRect(x + 1, y + 2 + tilt, G.cw, G.ch);
      ctx.fillStyle = e ? '#fffdf6' : '#d8c8a8'; ctx.fillRect(x, y + tilt, G.cw, G.ch);
      const tw = G.cw - 6, th = G.ch - 19;
      if (e && e.img) {
        const im = e.img, s = Math.max(im.width / tw, im.height / th);
        const dw = Math.round(im.width / s), dh = Math.round(im.height / s);
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(x + 3, y + 3 + tilt, tw, th);
        ctx.drawImage(im, x + 3 + Math.round((tw - dw) / 2), y + 3 + tilt + Math.round((th - dh) / 2), dw, dh);
      } else {
        ctx.fillStyle = e ? '#6a8ab0' : '#b8a888'; ctx.fillRect(x + 3, y + 3 + tilt, tw, th);
        if (!e) drawText(ctx, '?', x + G.cw / 2, y + 3 + tilt + th / 2 - 3, { align: 'center', color: '#8a7658' });
      }
      drawText(ctx, e ? fit(name, G.cw - 2) : '???', x + G.cw / 2, y + th + 5 + tilt, { align: 'center', color: e ? '#3a2a4a' : '#8a7658' });
      // rarity stars
      for (let k = 0; k < r; k++) { ctx.fillStyle = e ? RARITY_COL[r] : '#a89878'; ctx.fillRect(x + G.cw / 2 - r * 2 + k * 4, y + G.ch - 5 + tilt, 3, 3); }
      // a tiny stamp on legendary cards
      if (e && r === 4) { ctx.fillStyle = '#ff6ad0'; ctx.fillRect(x + G.cw - 7, y + 1 + tilt, 5, 5); ctx.fillStyle = '#fff'; ctx.fillRect(x + G.cw - 6, y + 2 + tilt, 3, 3); }
    }
    const nav = this.navRects();
    const label = `${found}/${ORDER.length} found`;
    drawText(ctx, label, px + pw / 2, py + ph - 12, { align: 'center', color: '#6a4a2a' });
    if (G.pages > 1) {
      drawText(ctx, '<', nav.prev[0] + 4, nav.prev[1] + 1, { color: '#c2466e' });
      drawText(ctx, '>', nav.next[0] + 4, nav.next[1] + 1, { color: '#c2466e' });
      if (pw > 140) drawText(ctx, `${A.page + 1}/${G.pages}`, nav.prev[0] + 16, nav.prev[1] + 2, { color: '#a08060' });
    }
  }

  drawShop(ctx) {
    const [px, py, pw, ph] = this.panel();
    for (const row of this.shopRows()) {
      const [x, y, w, h] = row.r, U = UPGRADES[row.k], lv = this.levels[row.k];
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e4d2ac'; ctx.fillRect(x, y + h - 1, w, 1);
      drawText(ctx, U.name, x + 4, y + 3, { color: '#3a2a4a' });
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k < lv ? '#ff8ab4' : '#d8c8a8'; ctx.fillRect(x + 4 + textWidth(U.name) + 4 + k * 5, y + 5, 4, 4); }
      const say = (l) => (row.k === 'lens' ? LENSES[l] : row.k === 'film' ? `${FILMS[l]} x${FILM_MULT[l]}` : `${ROLL_CAP[l]} shots`);
      const now = lv < 3 ? `${say(lv)} > ${say(lv + 1)}` : say(lv);
      drawText(ctx, fit(now, w - 58), x + 4, y + 14, { color: '#8a6a4a' });
      const cost = U.costs[lv];
      const [bx, by, bw, bh] = row.buy;
      const can = cost != null && this.points >= cost;
      ctx.fillStyle = cost == null ? '#c8b898' : can ? '#ff6a9a' : '#c8a8b0'; ctx.fillRect(bx, by, bw, bh);
      drawText(ctx, cost == null ? 'max' : `✦${cost}`, bx + bw / 2, by + 3, { align: 'center', color: '#ffffff' });
    }
    drawText(ctx, 'snap rare fish for more ✦', px + pw / 2, py + ph - 12, { align: 'center', color: '#8a6a4a' });
  }

  // a big postcard: the photo, a stamp and a postmark
  drawPostcard(ctx, key) {
    const W = this.W, H = this.H, e = this.book[key], [name, r] = SPECIES[key];
    const cw = Math.min(W - 12, 230), chh = Math.min(H - 16, Math.round(cw * 0.66));
    const x = Math.round((W - cw) / 2), y = Math.round((H - chh) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 1, y - 1, cw + 2, chh + 2);
    ctx.fillStyle = '#f7ecd4'; ctx.fillRect(x, y, cw, chh);
    // airmail stripes along the edge
    for (let i = 0; i < cw; i += 6) { ctx.fillStyle = (i / 6) % 2 ? '#e84a5a' : '#3a6ad0'; ctx.fillRect(x + i, y, 3, 2); ctx.fillRect(x + i + 3, y + chh - 2, 3, 2); }
    const wide = cw > 150;
    const iw = wide ? Math.round(cw * 0.55) : cw - 12, ih = wide ? chh - 16 : Math.round(chh * 0.55);
    if (e.img) {
      const im = e.img, s = Math.min(iw / im.width, ih / im.height), sc = s >= 1 ? Math.floor(s) : s;
      const dw = Math.round(im.width * sc), dh = Math.round(im.height * sc);
      const ix = x + 6 + Math.round((iw - dw) / 2), iy = y + 8 + Math.round((ih - dh) / 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ix - 2, iy - 2, dw + 4, dh + 4);
      ctx.drawImage(im, ix, iy, dw, dh);
    }
    const tx = wide ? x + iw + 12 : x + 6, ty = wide ? y + 20 : y + ih + 12;
    // stamp with a perforated edge and a postmark over it
    const sx = x + cw - 22, sy = y + 6;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 16, 18);
    for (let i = 0; i < 16; i += 2) { ctx.fillStyle = '#f7ecd4'; ctx.fillRect(sx + i, sy, 1, 1); ctx.fillRect(sx + i, sy + 17, 1, 1); }
    ctx.fillStyle = RARITY_COL[r]; ctx.fillRect(sx + 2, sy + 2, 12, 14);
    drawText(ctx, '♥', sx + 4, sy + 5, { color: '#ffffff' });
    ctx.fillStyle = 'rgba(60,40,80,0.55)';
    for (let a = 0; a < TAU; a += 0.35) ctx.fillRect(Math.round(sx - 4 + Math.cos(a) * 8), Math.round(sy + 12 + Math.sin(a) * 8), 1, 1);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 14; k++) ctx.fillRect(sx - 20 + k, sy + 8 + i * 4 + Math.round(Math.sin(k * 0.8) * 1), 1, 1);
    if (wide) drawText(ctx, 'greetings from', tx, ty - 10, { color: '#8a6a4a' });
    drawText(ctx, name, tx, ty, { color: '#3a2a4a', scale: wide && textWidth(name) * 2 < cw - iw - 20 ? 2 : 1 });
    const ly = ty + (wide ? 18 : 10);
    drawText(ctx, '★'.repeat(r) + ' ' + RARITY_NAME[r], tx, ly, { color: RARITY_COL[r], outline: '#3a2a4a' });
    drawText(ctx, `snapped ×${e.n}`, tx, ly + 10, { color: '#8a6a4a' });
    drawText(ctx, `best ✦${e.score}`, tx, ly + 20, { color: '#c27a10' });
  }
}

// ---------------------------------------------------------------- helpers --
function toCanvas(im) { const c = makeCanvas(im.width, im.height); c.ctx.drawImage(im, 0, 0); return c; }
function fit(str, w) {
  if (textWidth(str) <= w) return str;
  let s = str;
  while (s.length > 1 && textWidth(s + '.') > w) s = s.slice(0, -1);
  return s + '.';
}
function paper(ctx, x, y, w, h) {
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#f3e6c8'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(160,120,70,0.12)';
  for (let i = 0; i < w * h / 40; i++) ctx.fillRect(x + ((i * 97) % w), y + ((i * 57 + (i >> 3)) % h), 1, 1);
  ctx.fillStyle = '#d6bf94';
  for (let i = 4; i < w - 4; i += 4) { ctx.fillRect(x + i, y + 2, 2, 1); ctx.fillRect(x + i, y + h - 3, 2, 1); }
  for (let i = 4; i < h - 4; i += 4) { ctx.fillRect(x + 2, y + i, 1, 2); ctx.fillRect(x + w - 3, y + i, 1, 2); }
}

// A chunky vintage instant camera: leather body, silver top, big lens.
function drawCamera(ctx, x, y, on, t) {
  const lift = on ? -1 : 0;
  y += lift;
  if (on) { ctx.fillStyle = '#ffe38a'; ctx.fillRect(x - 1, y - 1, 24, 16); }
  ctx.fillStyle = '#1a1020'; ctx.fillRect(x, y + 2, 22, 12); ctx.fillRect(x + 1, y + 1, 20, 14);
  ctx.fillStyle = '#d8d4cc'; ctx.fillRect(x + 1, y + 2, 20, 4);   // silver top
  ctx.fillStyle = '#f4f0ea'; ctx.fillRect(x + 2, y + 2, 18, 1);
  ctx.fillStyle = '#8a5a34'; ctx.fillRect(x + 1, y + 6, 20, 8);   // leather
  ctx.fillStyle = '#6e4424'; for (let i = 0; i < 20; i += 2) ctx.fillRect(x + 1 + i, y + 7 + (i % 4 ? 2 : 4), 1, 1);
  ctx.fillStyle = '#1a1020'; ctx.fillRect(x + 7, y + 3, 8, 9); ctx.fillRect(x + 6, y + 4, 10, 7); // lens barrel
  ctx.fillStyle = '#4a5a7a'; ctx.fillRect(x + 8, y + 5, 6, 5);
  ctx.fillStyle = '#9ac8ff'; ctx.fillRect(x + 9, y + 5, 2, 2);
  ctx.fillStyle = '#e8403a'; ctx.fillRect(x + 17, y + 1, 3, 1);   // shutter button
  ctx.fillStyle = on && Math.sin(t * 6) > 0 ? '#fff6a0' : '#b8b0a0'; ctx.fillRect(x + 2, y + 3, 3, 2); // flash window
}
function drawBook(ctx, x, y) {
  ctx.fillStyle = '#1a1020'; ctx.fillRect(x, y, 15, 14);
  ctx.fillStyle = '#ff7aa8'; ctx.fillRect(x + 1, y + 1, 13, 12);
  ctx.fillStyle = '#c2466e'; ctx.fillRect(x + 1, y + 1, 2, 12);
  ctx.fillStyle = '#fff4e0'; ctx.fillRect(x + 13, y + 2, 1, 10);
  drawText(ctx, '♥', x + 4, y + 3, { color: '#ffffff' });
}
