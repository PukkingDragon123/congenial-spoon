// The gallery: every photo you take lands in a little cardboard photo box.
// Drag them out onto the board and pin them up (cute pins cost a few
// points), stick stickers around them, doodle on it, pick a background, and
// save the whole board as a postcard. Kept in this browser.
import { R, clamp, lerp, makeCanvas } from '../util.js';
import { drawText, textWidth } from '../font.js';
import { STICKERS, PENS, MARKER_PRICE, drawStickerIcon } from './camera.js';

const BW = 240, BH = 150;          // the board, in its own units
const ART_W = 120, ART_H = 75;     // doodle grid (two board units a cell)
const MAX_PHOTOS = 36;
const SAVE_KEY = 'vcag-gallery-1';

export const PINS = { red: 0, blue: 0, heart: 12, star: 12, flower: 15, bow: 20, clam: 30 };
const PIN_SPR = {
  red: ['.rr.', 'rWrr', 'rrrr', '.rr.', '.k..', '.k..'],
  blue: ['.bb.', 'bBbb', 'bbbb', '.bb.', '.k..', '.k..'],
  heart: ['.p.p.', 'pPppp', 'ppppp', '.ppp.', '..p..'],
  star: ['..y..', '.yYy.', 'yyyyy', '.yyy.', '.y.y.'],
  flower: ['.w.w.', 'wwoww', '.www.', 'w.w.w'],
  bow: ['pp.pp', 'pPpPp', 'ppkpp', '.p.p.'],
  clam: ['.ccc.', 'cCcCc', 'ccccc', '.ccc.'],
};
const PIN_COL = { r: '#e8404a', W: '#ffc0c0', b: '#3a7aff', B: '#b8d4ff', k: '#6a6a74', p: '#ff5a8a', P: '#ffd0e0', y: '#ffcf3a', Y: '#fff4b0', w: '#ffffff', o: '#ffb040', c: '#e8a0c4', C: '#fff0f6' };
const BACKS = { cork: 'cork', grid: 'paper', dots: 'pink dots', night: 'night' };
const TOOLS = ['move', 'pins', 'stickers', 'draw', 'board'];

export class Gallery {
  constructor(pm) {
    this.pm = pm;
    this.photos = [];       // { id, key, date, img, on, x, y, rot, pin }
    this.board = { bg: 'cork', stickers: [], art: '' };
    this.pinsOwned = ['red', 'blue'];
    this.nextId = 1;
    this.tool = 'move';
    this.pin = 'red';
    this.sticker = null;
    this.pen = 3;
    this.boxPage = 0;
    this.drag = null;
    this.artCanvas = null;
    this.load();
  }

  // ------------------------------------------------------------ storage --
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.board = Object.assign(this.board, d.board || {});
      if (Array.isArray(d.pinsOwned)) this.pinsOwned = d.pinsOwned;
      this.nextId = d.nextId || 1;
      for (const q of d.photos || []) {
        const ph = { ...q, img: null };
        if (q.img) { const im = new Image(); im.onload = () => { const c = makeCanvas(im.width, im.height); c.ctx.drawImage(im, 0, 0); ph.img = c; }; im.src = q.img; }
        this.photos.push(ph);
      }
    } catch (e) { /* start fresh */ }
  }
  save() {
    const pack = () => JSON.stringify({
      board: this.board, pinsOwned: this.pinsOwned, nextId: this.nextId,
      photos: this.photos.map((q) => ({ ...q, img: q.img ? q.img.toDataURL('image/jpeg', 0.85) : q.url || null })),
    });
    for (let tries = 0; tries < 6; tries++) {
      try { localStorage.setItem(SAVE_KEY, pack()); return; } catch (e) {
        // out of room: let go of the oldest photo still in the box
        const i = this.photos.findIndex((q) => !q.on);
        if (i < 0) return;
        this.photos.splice(i, 1);
      }
    }
  }

  // A new photo goes into the box (a small copy is plenty).
  add(img, key) {
    const w = Math.min(72, img.width), h = Math.round((img.height * w) / img.width);
    const c = makeCanvas(w, h);
    c.ctx.imageSmoothingEnabled = true;
    c.ctx.drawImage(img, 0, 0, w, h);
    const now = new Date();
    this.photos.push({ id: this.nextId++, key, date: `${now.getMonth() + 1}/${now.getDate()}`, img: c, on: false, x: BW / 2, y: BH / 2, rot: 0, pin: 'red' });
    while (this.photos.length > MAX_PHOTOS) {
      const i = this.photos.findIndex((q) => !q.on);
      if (i < 0) break;
      this.photos.splice(i, 1);
    }
    this.save();
  }

  // ------------------------------------------------------------- layout --
  layout() {
    const [px, py, pw, ph] = this.pm.panel();
    const top = py + 18;
    const chips = [];
    let x = px + 6;
    for (const k of TOOLS) { const w = textWidth(k) + 8; chips.push({ k, r: [x, top, w, 11] }); x += w + 3; }
    const saveW = textWidth('save postcard') + 10;
    const optY = top + 14;
    const fitsRow = x + saveW + 3 <= px + pw - 6;
    let saveR = [px + pw - saveW - 6, top, saveW, 11];
    let box = [px + 4, py + ph - 38, pw - 8, 34];
    let area = [px + 6, optY + 18, pw - 12, box[1] - optY - 22];
    let s = Math.min(area[2] / BW, area[3] / BH);
    let bw = BW * s, bh = BH * s;
    let board = [Math.round(area[0] + (area[2] - bw) / 2), Math.round(area[1] + (area[3] - bh) / 2), Math.round(bw), Math.round(bh)];
    // tall screens: the board sits up top, the save button under it and the
    // box grows to fill the rest, so there's no big empty gap
    if (!fitsRow || area[3] - bh > 40) {
      board[1] = area[1] + 2;
      saveR = [px + pw - saveW - 6, board[1] + board[3] + 7, saveW, 11];
      const by = saveR[1] + 16, maxH = py + ph - 4 - by;
      const h = Math.max(34, maxH);
      box = [px + 4, by, pw - 8, h];
    }
    return { chips, saveR, optY, box, board, s, px, pw };
  }
  toBoard(L, x, y) { return [(x - L.board[0]) / L.s, (y - L.board[1]) / L.s]; }
  inRect(r, x, y) { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }

  // the options row for the current tool
  options(L) {
    const out = [], y = L.optY;
    let x = L.px + 6;
    const add = (it, w = 14) => { it.r = [x, y, w, 14]; out.push(it); x += w + 3; };
    if (this.tool === 'pins') for (const id of Object.keys(PINS)) add({ kind: 'pin', id });
    else if (this.tool === 'stickers') {
      for (const id of Object.keys(STICKERS)) if (id !== 'photo') add({ kind: 'sticker', id });
      const w = textWidth('clear') + 8; add({ kind: 'btn', label: 'clear', act: () => { this.board.stickers = []; this.save(); } }, w);
    } else if (this.tool === 'draw') {
      if (!this.pm.cam.markers) { const w = textWidth(`buy markers ✦${MARKER_PRICE}`) + 8; add({ kind: 'btn', label: `buy markers ✦${MARKER_PRICE}`, act: () => { if (this.pm.spend(MARKER_PRICE)) { this.pm.cam.markers = true; this.pm.save(); } } }, w); }
      else {
        PENS.forEach((c, i) => add({ kind: 'pen', id: i + 1 }, 11));
        add({ kind: 'pen', id: 0 }, 11);
        const w = textWidth('clear') + 8; add({ kind: 'btn', label: 'clear', act: () => { this.board.art = ''; this.artCanvas = null; this.save(); } }, w);
      }
    } else if (this.tool === 'board') for (const id of Object.keys(BACKS)) { const w = textWidth(BACKS[id]) + 8; add({ kind: 'bg', id }, w); }
    return out;
  }

  // -------------------------------------------------------------- input --
  hitPhoto(bx, by) {
    for (let i = this.photos.length - 1; i >= 0; i--) {
      const q = this.photos[i];
      if (!q.on) continue;
      const [w, h] = cardSize(q);
      if (Math.abs(bx - q.x) < w / 2 + 2 && Math.abs(by - q.y) < h / 2 + 3) return q;
    }
    return null;
  }
  boxThumbs(L) {
    const inBox = this.photos.filter((q) => !q.on).reverse();
    // a short box is one strip beside the little box; a tall one (phones) is
    // a grid of bigger prints under it
    const [ox, oy, ow, oh] = L.box, tall = oh > 90;
    const tw = tall ? 34 : 24, th = tall ? 28 : 20, sx = tw + 2, sy = th + 4;
    const x0 = tall ? ox + 8 : ox + 44, y0 = tall ? oy + 34 : oy + 7;
    const cols = Math.max(1, Math.floor((tall ? ow - 14 : ow - 58) / sx));
    const rows = Math.max(1, Math.floor((oy + oh - 6 - y0 + 4) / sy)), per = cols * rows;
    const pages = Math.max(1, Math.ceil(inBox.length / per));
    this.boxPage = clamp(this.boxPage, 0, pages - 1);
    const list = inBox.slice(this.boxPage * per, this.boxPage * per + per).map((q, i) => ({ q, r: [x0 + (i % cols) * sx, y0 + Math.floor(i / cols) * sy, tw, th] }));
    const prev = tall ? [ox + ow - 26, oy + 12, 8, 10] : [ox + 34, oy + 12, 8, 10];
    const next = tall ? [ox + ow - 14, oy + 12, 8, 10] : [ox + ow - 10, oy + 12, 8, 10];
    return { list, pages, total: inBox.length, prev, next, tall, emptyY: y0 + Math.ceil(Math.max(1, list.length) / cols) * sy + 4 };
  }

  down(x, y) {
    const L = this.layout(), pm = this.pm, snd = pm.story.sound;
    for (const c of L.chips) if (this.inRect(c.r, x, y)) { this.tool = c.k; snd.sfx('type'); return; }
    if (this.inRect(L.saveR, x, y)) { this.exportPostcard(); snd.sfx('shutter'); return; }
    for (const it of this.options(L)) {
      if (!this.inRect(it.r, x, y)) continue;
      if (it.kind === 'btn') { it.act(); snd.sfx('type'); return; }
      if (it.kind === 'pin') {
        if (!this.pinsOwned.includes(it.id)) { if (!pm.spend(PINS[it.id])) return; this.pinsOwned.push(it.id); this.save(); }
        this.pin = it.id; snd.sfx('pop'); return;
      }
      if (it.kind === 'sticker') {
        const C = pm.cam;
        if (!C.stickerSet.includes(it.id)) { if (!pm.spend(STICKERS[it.id])) return; C.stickerSet.push(it.id); pm.save(); }
        this.sticker = it.id; snd.sfx('pop'); return;
      }
      if (it.kind === 'pen') { this.pen = it.id; snd.sfx('type'); return; }
      if (it.kind === 'bg') { this.board.bg = it.id; this.save(); snd.sfx('pop'); return; }
    }
    // the photo box
    const B = this.boxThumbs(L);
    if (this.inRect(B.prev, x, y)) { this.boxPage--; snd.sfx('type'); return; }
    if (this.inRect(B.next, x, y)) { this.boxPage++; snd.sfx('type'); return; }
    for (const { q, r } of B.list) if (this.inRect(r, x, y)) { this.drag = { q, from: 'box', x, y, x0: x, y0: y, moved: false }; snd.sfx('pop'); return; }
    // the board itself
    if (!this.inRect(L.board, x, y)) return;
    const [bx, by] = this.toBoard(L, x, y);
    const q = this.hitPhoto(bx, by);
    if (this.tool === 'move' && q) {
      this.photos.splice(this.photos.indexOf(q), 1); this.photos.push(q); // to the top
      this.drag = { q, from: 'board', dx: q.x - bx, dy: q.y - by, x, y, x0: x, y0: y, moved: false };
      snd.sfx('pop');
    } else if (this.tool === 'pins' && q) { q.pin = this.pin; this.save(); snd.sfx('pop'); }
    else if (this.tool === 'stickers' && this.sticker) {
      if (this.board.stickers.length >= 40) this.board.stickers.shift();
      this.board.stickers.push({ k: this.sticker, x: Math.round(bx), y: Math.round(by) });
      this.save(); snd.sfx('pop');
    } else if (this.tool === 'draw' && pm.cam.markers) { this.drawing = { last: null }; this.doodle(L, x, y); }
  }

  move(x, y) {
    const L = this.layout();
    if (this.drawing) { this.doodle(L, x, y); return; }
    const D = this.drag;
    if (!D) return;
    D.x = x; D.y = y;
    if (Math.hypot(x - D.x0, y - D.y0) > 3) D.moved = true;
    if (D.from === 'board') {
      const [bx, by] = this.toBoard(L, x, y);
      D.q.x = clamp(bx + D.dx, 0, BW); D.q.y = clamp(by + D.dy, 0, BH);
    }
  }

  up(x, y) {
    const L = this.layout(), snd = this.pm.story.sound;
    if (this.drawing) { this.drawing = null; this.save(); return; }
    const D = this.drag;
    if (!D) return;
    this.drag = null;
    const q = D.q;
    if (D.from === 'box') {
      // dropped on the board, or just tapped: pin it up
      let [bx, by] = this.toBoard(L, x, y);
      if (!D.moved || !this.inRect(L.board, x, y)) { bx = BW / 2 + (R() - 0.5) * 80; by = BH / 2 + (R() - 0.5) * 40; }
      if (!D.moved || this.inRect(L.board, x, y)) {
        Object.assign(q, { on: true, x: clamp(bx, 20, BW - 20), y: clamp(by, 20, BH - 20), rot: (R() - 0.5) * 0.3, pin: this.pin });
        this.photos.splice(this.photos.indexOf(q), 1); this.photos.push(q);
        snd.sfx('ding');
        this.pm.story.fx && burst(this.pm, x, y);
      }
    } else if (this.inRect(L.box, x, y)) { q.on = false; snd.sfx('escape'); }
    else snd.sfx('type');
    this.save();
  }

  doodle(L, x, y) {
    const gx = Math.floor(((x - L.board[0]) / L.board[2]) * ART_W), gy = Math.floor(((y - L.board[1]) / L.board[3]) * ART_H);
    if (!this.artArr) this.artArr = (this.board.art || '').padEnd(ART_W * ART_H, '0').split('');
    const from = this.drawing.last || [gx, gy], n = Math.max(Math.abs(gx - from[0]), Math.abs(gy - from[1]), 1);
    for (let k = 0; k <= n; k++) {
      const px = Math.round(lerp(from[0], gx, k / n)), py = Math.round(lerp(from[1], gy, k / n));
      if (px >= 0 && py >= 0 && px < ART_W && py < ART_H) this.artArr[py * ART_W + px] = this.pen.toString(16);
    }
    this.drawing.last = [gx, gy];
    this.board.art = this.artArr.join('');
    this.artCanvas = null;
  }

  // --------------------------------------------------------------- draw --
  draw(ctx) {
    const L = this.layout(), pm = this.pm, t = pm.t;
    // tools
    for (const c of L.chips) {
      const [x, y, w, h] = c.r, on = this.tool === c.k;
      ctx.fillStyle = on ? '#ff8ab4' : '#e4d2ac'; ctx.fillRect(x, y, w, h);
      drawText(ctx, c.k, x + w / 2, y + 2, { align: 'center', color: on ? '#ffffff' : '#6a4a2a' });
    }
    { const [x, y, w, h] = L.saveR; ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y, w, h); drawText(ctx, 'save postcard', x + w / 2, y + 2, { align: 'center', color: '#ffffff' }); }
    for (const it of this.options(L)) {
      const [x, y, w, h] = it.r;
      if (it.kind === 'btn') { ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y + 1, w, 11); drawText(ctx, it.label, x + w / 2, y + 3, { align: 'center', color: '#ffffff' }); continue; }
      if (it.kind === 'pen') {
        const on = this.pen === it.id;
        ctx.fillStyle = on ? '#ff3a7a' : '#5a3a1e'; ctx.fillRect(x - 1, y, w + 2, 13);
        ctx.fillStyle = it.id ? PENS[it.id - 1] : '#fffaf0'; ctx.fillRect(x, y + 1, w, 11);
        if (!it.id) { ctx.fillStyle = '#ff6a8a'; ctx.fillRect(x + 2, y + 5, w - 4, 3); }
        continue;
      }
      if (it.kind === 'bg') { const on = this.board.bg === it.id; ctx.fillStyle = on ? '#ff8ab4' : '#fffaf0'; ctx.fillRect(x, y + 1, w, 11); drawText(ctx, BACKS[it.id], x + w / 2, y + 3, { align: 'center', color: on ? '#ffffff' : '#6a4a2a' }); continue; }
      const sel = it.kind === 'pin' ? this.pin === it.id : this.sticker === it.id;
      ctx.fillStyle = sel ? '#ff8ab4' : '#fffaf0'; ctx.fillRect(x, y, w, h);
      if (it.kind === 'pin') {
        drawPin(ctx, it.id, x + w / 2, y + 5, 1);
        if (!this.pinsOwned.includes(it.id)) { ctx.fillStyle = 'rgba(243,230,200,0.55)'; ctx.fillRect(x, y, w, h); drawText(ctx, `${PINS[it.id]}`, x + w / 2, y + h - 7, { align: 'center', color: '#c2466e' }); }
      } else {
        drawStickerIcon(ctx, it.id, x + w / 2, y + h / 2);
        if (!pm.cam.stickerSet.includes(it.id)) { ctx.fillStyle = 'rgba(243,230,200,0.55)'; ctx.fillRect(x, y, w, h); drawText(ctx, `${STICKERS[it.id]}`, x + w / 2, y + h - 7, { align: 'center', color: '#c2466e' }); }
      }
    }
    // the board, in a wooden frame
    const [bx, by, bw, bh] = L.board;
    ctx.fillStyle = '#5a3418'; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(bx - 3, by - 3, bw + 6, 1); ctx.fillRect(bx - 3, by - 3, 1, bh + 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    this.drawBoard(ctx, bx, by, L.s, t);
    ctx.restore();
    const hint = { move: 'drag photos in and out of the box', pins: 'pick a pin, tap a photo', stickers: this.sticker ? 'tap the board to stick it' : 'pick a sticker', draw: pm.cam.markers ? 'draw on the board' : '', board: 'pick a background' }[this.tool];
    if (hint && bh > 60) drawText(ctx, fit(hint, bw - 8), bx + bw / 2, by + bh - 10, { align: 'center', color: '#fff4dc', outline: '#3a2010', alpha: 0.75 });
    // the photo box
    const B = this.boxThumbs(L), [ox, oy, ow, oh] = L.box;
    ctx.fillStyle = '#6a4424'; ctx.fillRect(ox, oy, ow, oh);
    ctx.fillStyle = '#c89a62'; ctx.fillRect(ox + 1, oy + 1, ow - 2, oh - 2);
    ctx.fillStyle = '#b08450'; for (let i = ox + 3; i < ox + ow - 3; i += 6) ctx.fillRect(i, oy + oh - 5, 3, 2);
    // a little box with its flaps open
    ctx.fillStyle = '#8a5a2e'; ctx.fillRect(ox + 4, oy + 10, 26, 18);
    ctx.fillStyle = '#d8a870'; ctx.fillRect(ox + 5, oy + 11, 24, 16); ctx.fillRect(ox + 1, oy + 6, 12, 5); ctx.fillRect(ox + 21, oy + 6, 12, 5);
    drawText(ctx, `${B.total}`, ox + 17, oy + 16, { align: 'center', color: '#5a3418' });
    if (B.tall) drawText(ctx, 'photo box', ox + 36, oy + 14, { color: '#5a3418' });
    if (!B.total) drawText(ctx, fit('take some photos and they land here', B.tall ? ow - 16 : ow - 50), B.tall ? ox + 8 : ox + 44, B.tall ? oy + 36 : oy + 13, { color: '#6a4424' });
    else if (B.tall && B.emptyY < oy + oh - 14) drawText(ctx, fit('tap a photo to pin it up', ow - 16), ox + ow / 2, B.emptyY + 2, { align: 'center', color: '#8a6038', alpha: 0.8 });
    for (const { q, r } of B.list) {
      if (this.drag && this.drag.q === q && this.drag.moved) continue;
      const [x, y, w, h] = r;
      ctx.fillStyle = '#3a2410'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#fffdf6'; ctx.fillRect(x, y, w, h);
      if (q.img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(q.img, x + 2, y + 2, w - 4, h - 6); ctx.imageSmoothingEnabled = false; }
    }
    if (B.pages > 1) { drawText(ctx, '<', B.prev[0], B.prev[1], { color: '#8a2a4a' }); drawText(ctx, '>', B.next[0], B.next[1], { color: '#8a2a4a' }); }
    // a photo on its way out of the box
    const D = this.drag;
    if (D && D.from === 'box' && D.moved) drawCard(ctx, D.q, D.x, D.y, L.s, 0.08, this.pin, t, true);
  }

  // Everything on the board at scale s with its corner at (ox, oy).
  drawBoard(ctx, ox, oy, s, t) {
    drawBack(ctx, this.board.bg, ox, oy, BW * s, BH * s, s);
    for (const q of this.photos) if (q.on) drawCard(ctx, q, ox + q.x * s, oy + q.y * s, s, q.rot, q.pin, t, this.drag && this.drag.q === q);
    for (const st of this.board.stickers) {
      if (s <= 1.5) drawStickerIcon(ctx, st.k, Math.round(ox + st.x * s), Math.round(oy + st.y * s));
      else { const c = stickerCanvas(st.k); const k = Math.max(1, Math.round(s / 1.5)); ctx.drawImage(c, Math.round(ox + st.x * s - (c.width * k) / 2), Math.round(oy + st.y * s - (c.height * k) / 2), c.width * k, c.height * k); }
    }
    if (this.board.art) {
      if (!this.artCanvas) {
        const c = makeCanvas(ART_W, ART_H), a = this.board.art;
        for (let i = 0; i < a.length && i < ART_W * ART_H; i++) { const v = parseInt(a[i], 16); if (v) { c.ctx.fillStyle = PENS[v - 1]; c.ctx.fillRect(i % ART_W, Math.floor(i / ART_W), 1, 1); } }
        this.artCanvas = c;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.artCanvas, ox, oy, BW * s, BH * s);
    }
  }

  // The board as a postcard: big and crisp, with a title, a date and a stamp.
  exportPostcard() {
    const k = 4, m = 40, W = BW * k + m * 2, H = BH * k + m * 2 + 80;
    const c = makeCanvas(W, H), x = c.ctx;
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#f7ecd4'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 24) { x.fillStyle = (i / 24) % 2 ? '#e84a5a' : '#3a6ad0'; x.fillRect(i, 0, 12, 8); x.fillRect(i + 12, H - 8, 12, 8); }
    drawText(x, 'our aquarium board', m, 22, { scale: 4, color: '#3a2a4a' });
    x.fillStyle = '#5a3418'; x.fillRect(m - 8, 70 - 8, BW * k + 16, BH * k + 16);
    x.save(); x.beginPath(); x.rect(m, 70, BW * k, BH * k); x.clip();
    this.drawBoard(x, m, 70, k, 0);
    x.restore();
    const now = new Date();
    drawText(x, `Very Cool Aquarium Game · ${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`, m, H - 38, { scale: 2, color: '#8a6a4a' });
    c.toBlob((blob) => { if (blob) this.pm.saveBlob(blob, 'aquarium-board.png', 'board saved'); }, 'image/png');
  }
}

// ---------------------------------------------------------------- drawing --
function cardSize(q) {
  const iw = 40, ih = q.img ? Math.round((q.img.height * iw) / q.img.width) : 30;
  return [iw + 4, ih + 11];
}

// A photo as a polaroid, pinned at the top.
function drawCard(ctx, q, cx, cy, s, rot, pin, t, lifted) {
  const [w, h] = cardSize(q);
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(rot + (lifted ? Math.sin(t * 6) * 0.03 : 0));
  ctx.scale(s * (lifted ? 1.08 : 1), s * (lifted ? 1.08 : 1));
  ctx.fillStyle = 'rgba(30,15,5,0.35)'; ctx.fillRect(-w / 2 + 1.5, -h / 2 + 2, w, h);
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(-w / 2, -h / 2, w, h);
  if (q.img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(q.img, -w / 2 + 2, -h / 2 + 2, w - 4, h - 11); ctx.imageSmoothingEnabled = false; }
  if (s >= 0.9) drawText(ctx, q.date || '', 0, h / 2 - 8, { align: 'center', color: '#8a6a5a' });
  ctx.restore();
  if (pin) drawPin(ctx, pin, cx + Math.sin(rot) * (h / 2 - 2) * s, cy - Math.cos(rot) * (h / 2 - 2) * s, Math.max(1, Math.round(s)));
}

function drawPin(ctx, id, cx, cy, k) {
  const rows = PIN_SPR[id] || PIN_SPR.red;
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const ox = Math.round(cx - (w * k) / 2), oy = Math.round(cy - (h * k) / 2);
  ctx.fillStyle = 'rgba(30,15,5,0.35)';
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') ctx.fillRect(ox + (i + 1) * k, oy + (j + 1) * k, k, k); });
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { ctx.fillStyle = PIN_COL[row[i]] || '#fff'; ctx.fillRect(ox + i * k, oy + j * k, k, k); } });
}

const stickerCache = new Map();
function stickerCanvas(k) {
  if (!stickerCache.has(k)) { const c = makeCanvas(12, 12); drawStickerIcon(c.ctx, k, 6, 6); stickerCache.set(k, c); }
  return stickerCache.get(k);
}

// board backgrounds, drawn in board units so they scale with it
function drawBack(ctx, id, x, y, w, h, s) {
  const u = Math.max(1, Math.round(s));
  if (id === 'grid') {
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c8dcf0';
    for (let i = 0; i < w; i += 10 * s) ctx.fillRect(Math.round(x + i), y, u, h);
    for (let j = 0; j < h; j += 10 * s) ctx.fillRect(x, Math.round(y + j), w, u);
  } else if (id === 'dots') {
    ctx.fillStyle = '#ffc8dc'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    for (let j = 0, r = 0; j < h; j += 12 * s, r++) for (let i = (r % 2) * 6 * s; i < w; i += 12 * s) ctx.fillRect(Math.round(x + i), Math.round(y + j), 2 * u, 2 * u);
  } else if (id === 'night') {
    ctx.fillStyle = '#0e1840'; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 90; i++) { const px = (i * 97) % BW, py = (i * 57 + (i >> 2) * 13) % BH; ctx.fillStyle = i % 7 ? '#6a7ab8' : '#fff4c0'; ctx.fillRect(Math.round(x + px * s), Math.round(y + py * s), u, u); }
  } else {
    // cork: warm brown with darker and lighter crumbs
    ctx.fillStyle = '#c28a52'; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 700; i++) { const px = (i * 131) % BW, py = (i * 71 + (i >> 3) * 17) % BH; ctx.fillStyle = i % 3 ? '#a8723e' : '#dcaa72'; ctx.fillRect(Math.round(x + px * s), Math.round(y + py * s), u, u); }
  }
}

function burst(pm, x, y) {
  for (let i = 0; i < 8; i++) { const a = R() * Math.PI * 2, sp = 20 + R() * 30; pm.story.fx.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, age: 0, life: 0.5, size: 2, col: i % 2 ? '#ffe38a' : '#ffffff' }); }
}

function fit(str, w) {
  if (textWidth(str) <= w) return str;
  let s = str;
  while (s.length > 1 && textWidth(s + '.') > w) s = s.slice(0, -1);
  return s + '.';
}
