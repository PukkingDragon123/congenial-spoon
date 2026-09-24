// The notebook, as an actual book: a leather cover, two cream pages with a
// spine down the middle (one tall page on a narrow screen), coloured ribbon
// bookmarks for each tank, and pages that flip.
//   contents: your progress, a bean with a fun fact, and the tanks
//   tank:     a little live aquarium of everyone you've found there, and
//             their cards
//   animal:   the animal swimming in a porthole, its jigsaw (drag the loose
//             pieces in and they snap into place), field notes and facts
import { TAU, clamp, lerp, ease, R } from '../util.js';
import { drawText, textWidth, wrap } from '../font.js';
import {
  FACTS, NOTES, PIECES, SETS, PIECE_ORDER, jigsaw, pieceImage, pieceCentre, keychainIcon,
  animalFrame, noseOf, MOVES, done as puzzleDone, PICTURE_SIZE,
} from './encyclopedia.js';

const SECTIONS = SETS.filter((s) => s.id !== 'always');
const TANK = { jelly: ['#1a0c44', '#5a34a8'], reef: ['#0a2c64', '#2c90d8'], deep: ['#081c52', '#1e64c0'], legend: ['#2c0e40', '#c05a90'], us: ['#2c0c24', '#d8608c'] };
const PAPER = '#f8eed6', INK = '#3a2a4a', FADED = '#a08c6c';
const [PW, PH] = PICTURE_SIZE;

export class Book {
  constructor(pm) {
    this.pm = pm;
    this.page = { kind: 'contents' };
    this.flip = null;
    this.loose = null;      // { key, list: [{ i, dx, dy, rot, fly }] } on an animal page
    this.drag = null;
    this.pulse = null;
    this.hits = [];
  }

  get book() { return this.pm.book; }
  entry(key) { return this.book[key]; }
  name(key) { return this.pm.speciesName(key); }
  rarity(key) { return this.pm.rarity(key); }

  go(page, dir = 1) {
    this.page = page;
    this.flip = { t: 0, dir };
    this.loose = null;
    this.pm.story.sound.sfx('type');
  }

  // ------------------------------------------------------------- layout --
  layout() {
    const [px, py, pw, ph] = this.pm.panel();
    const top = py + 17;
    const wide = pw > 360 && ph > 200;
    const rib = wide ? 16 : 0;
    const bx = px + 4, by = top, bw = pw - 8 - rib, bh = ph - 21;
    let pages, ribbons = [];
    if (wide) {
      pages = [[bx + 7, by + 6, Math.floor(bw / 2) - 10, bh - 12], [bx + Math.floor(bw / 2) + 3, by + 6, Math.floor(bw / 2) - 10, bh - 12]];
      ribbons = [{ id: null, r: [bx + bw - 2, by + 8, rib + 2, 14] }].concat(SECTIONS.map((S, i) => ({ id: S.id, r: [bx + bw - 2, by + 26 + i * 18, rib + 2, 15] })));
    } else {
      const tabY = by + 5;
      ribbons = [{ id: null, r: [bx + 6, tabY, 18, 13] }].concat(SECTIONS.map((S, i) => ({ id: S.id, r: [bx + 28 + i * 22, tabY, 20, 13] })));
      pages = [[bx + 6, by + 22, bw - 12, bh - 28]];
    }
    return { wide, bx, by, bw, bh, pages, ribbons };
  }
  // two areas for a page's two halves: the two pages, or one page split
  halves(L, split = 0.5) {
    if (L.wide) return L.pages;
    const [x, y, w, h] = L.pages[0], h1 = Math.round(h * split);
    return [[x, y, w, h1 - 3], [x, y + h1 + 3, w, h - h1 - 3]];
  }

  // -------------------------------------------------------------- input --
  hit(r, x, y) { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }
  down(x, y) {
    const L = this.layout();
    for (const rb of L.ribbons) if (this.hit(rb.r, x, y)) { this.go(rb.id ? { kind: 'section', id: rb.id } : { kind: 'contents' }, rb.id ? 1 : -1); return; }
    // a loose jigsaw piece: pick it up
    if (this.page.kind === 'animal' && this.loose && this.jig) {
      const J = this.jig;
      for (let n = this.loose.list.length - 1; n >= 0; n--) {
        const p = this.loose.list[n], [cx, cy] = pieceCentre(p.i);
        const sx = J.x + cx * J.s + p.dx, sy = J.y + cy * J.s + p.dy;
        if (Math.abs(x - sx) < PW * 0.3 * J.s && Math.abs(y - sy) < PH * 0.32 * J.s) {
          this.loose.list.splice(n, 1); this.loose.list.push(p);
          this.drag = { p, ox: p.dx - x, oy: p.dy - y, x0: x, y0: y, moved: false };
          this.pm.story.sound.sfx('pop');
          return;
        }
      }
    }
    for (const h of this.hits) if (this.hit(h.r, x, y)) { h.act(); return; }
  }
  move(x, y) {
    const D = this.drag;
    if (!D) return;
    D.p.dx = x + D.ox; D.p.dy = y + D.oy;
    if (Math.hypot(x - D.x0, y - D.y0) > 3) D.moved = true;
  }
  up() {
    const D = this.drag;
    if (!D) return;
    this.drag = null;
    const p = D.p, J = this.jig;
    // a tap sends it home by itself; a drop close enough snaps in
    if (!D.moved) { p.fly = { t: 0, dx: p.dx, dy: p.dy }; return; }
    if (J && Math.hypot(p.dx, p.dy) < 8 * J.s) this.snap(p);
  }

  snap(p) {
    const key = this.page.key, e = this.entry(key), J = this.jig;
    e.placed = (e.placed | 0) | (1 << p.i);
    this.loose.list.splice(this.loose.list.indexOf(p), 1);
    this.pulse = { i: p.i, t: 0 };
    const snd = this.pm.story.sound;
    snd.sfx('pop'); snd.sfx('sparkle');
    if (J) {
      const [cx, cy] = pieceCentre(p.i);
      burst(this.pm, J.x + cx * J.s, J.y + cy * J.s, 10);
    }
    if (placedCount(e) >= PIECES) { snd.sfx('yes'); this.shine = 0; }
    this.pm.save();
  }

  // Loose pieces for an animal page: earned but not yet placed, waiting in
  // the tray beside the board.
  ensureLoose(key, J) {
    if (this.loose && this.loose.key === key) return;
    const e = this.entry(key) || {};
    const earned = PIECE_ORDER.slice(0, e.pieces | 0);
    const list = earned.filter((i) => !((e.placed | 0) & (1 << i))).map((i, n) => {
      const [cx, cy] = pieceCentre(i);
      const tx = J.trayX + (n % 2) * J.trayStep + J.trayStep / 2, ty = J.trayY + Math.floor(n / 2) * J.trayStepY + J.trayStepY / 2;
      return { i, dx: tx - (J.x + cx * J.s), dy: ty - (J.y + cy * J.s), rot: (R() - 0.5) * 0.5 };
    });
    this.loose = { key, list };
  }

  // --------------------------------------------------------------- draw --
  update(dt) {
    if (this.flip) { this.flip.t += dt / 0.38; if (this.flip.t >= 1) this.flip = null; }
    if (this.pulse) { this.pulse.t += dt; if (this.pulse.t > 0.6) this.pulse = null; }
    if (this.shine != null) { this.shine += dt; if (this.shine > 1) this.shine = null; }
    if (this.loose) for (const p of this.loose.list.slice()) {
      if (!p.fly) continue;
      p.fly.t += dt / 0.35;
      const k = ease.inOutCubic(clamp(p.fly.t));
      p.dx = lerp(p.fly.dx, 0, k); p.dy = lerp(p.fly.dy, 0, k);
      if (p.fly.t >= 1) { p.fly = null; this.snap(p); }
    }
  }

  draw(ctx) {
    const L = this.layout(), t = this.pm.t;
    this.update(this.pm.story.dt || 0.016);
    this.hits = [];
    // the cover, with gold corners and the page edges showing
    const { bx, by, bw, bh } = L;
    ctx.fillStyle = '#0c2630'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#1e4a5a'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#2a6072'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
    ctx.fillStyle = '#e8c060';
    for (const [cx, cy] of [[bx, by], [bx + bw - 5, by], [bx, by + bh - 5], [bx + bw - 5, by + bh - 5]]) { ctx.fillRect(cx, cy, 5, 2); ctx.fillRect(cx + (cx === bx ? 0 : 3), cy, 2, 5); }
    // bookmarks
    for (const rb of L.ribbons) {
      const S = SECTIONS.find((q) => q.id === rb.id), on = rb.id ? (this.page.id === rb.id || (this.page.kind === 'animal' && sectionOf(this.page.key) === rb.id)) : this.page.kind === 'contents';
      const [x, y, w, h] = rb.r, col = S ? S.cols[0] : '#e8c060';
      ctx.fillStyle = '#10141e'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = S ? S.cols[1] : '#fff0b0'; ctx.fillRect(x, y, w, 1);
      if (on) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + (L.wide ? w - 3 : 0), y + (L.wide ? 0 : h - 2), L.wide ? 2 : w, L.wide ? h : 2); }
      if (S) {
        const key = S.keys.find((k) => this.entry(k) && k !== 'me' && k !== 'us') || S.keys[0];
        const img = this.entry(key) ? animalFrame(key, t + SECTIONS.indexOf(S), 'icon') : null;
        if (img) drawFit(ctx, img, x + w / 2, y + h / 2, w - 4, h - 4);
        else drawText(ctx, '?', x + w / 2, y + 3, { align: 'center', color: '#ffffff' });
      } else drawText(ctx, '≡', x + w / 2, y + 3, { align: 'center', color: '#5a3a10' });
    }
    // the pages
    for (const pg of L.pages) this.paper(ctx, pg, L);
    if (this.page.kind === 'contents') this.drawContents(ctx, L, t);
    else if (this.page.kind === 'section') this.drawSection(ctx, L, t);
    else this.drawAnimal(ctx, L, t);
    // a page turning over
    if (this.flip) this.drawFlip(ctx, L);
  }

  paper(ctx, [x, y, w, h], L) {
    ctx.fillStyle = '#d8c8a0'; ctx.fillRect(x - 1, y + 1, w + 2, h);
    ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#efe2c2';
    for (let j = y + 14; j < y + h - 4; j += 11) ctx.fillRect(x + 4, j, w - 8, 1);
    if (L.wide) {
      // shade towards the spine
      const left = x < L.bx + L.bw / 2;
      const g = ctx.createLinearGradient(left ? x + w - 10 : x, 0, left ? x + w : x + 10, 0);
      g.addColorStop(left ? 0 : 1, 'rgba(90,60,30,0)'); g.addColorStop(left ? 1 : 0, 'rgba(90,60,30,0.28)');
      ctx.fillStyle = g; ctx.fillRect(left ? x + w - 10 : x, y, 10, h);
    }
  }

  drawFlip(ctx, L) {
    const k = this.flip.t, dir = this.flip.dir;
    ctx.save();
    if (L.wide) {
      const sx = L.pages[1][0] - 3, [, y, w, h] = L.pages[0];
      // over the right page first, then down onto the left
      const half = k < 0.5, c = Math.cos(k * Math.PI), ww = Math.abs(c) * (w + 3);
      const onRight = dir > 0 ? half : !half;
      const x = onRight ? sx : sx - ww;
      ctx.fillStyle = PAPER; ctx.fillRect(Math.round(x), y, Math.round(ww), h);
      ctx.fillStyle = `rgba(90,60,30,${0.25 * (1 - Math.abs(c))})`; ctx.fillRect(Math.round(x), y, Math.round(ww), h);
    } else {
      const [x, y, w, h] = L.pages[0], ww = Math.round(w * (1 - ease.inOutSine(k)));
      ctx.fillStyle = PAPER; ctx.fillRect(dir > 0 ? x + w - ww : x, y, ww, h);
      ctx.fillStyle = 'rgba(90,60,30,0.2)'; ctx.fillRect(dir > 0 ? x + w - ww : x + ww - 2, y, 2, h);
    }
    ctx.restore();
  }

  link(ctx, label, x, y, act, col = '#c2466e') {
    const w = textWidth(label) + 4;
    drawText(ctx, label, x, y, { color: col });
    this.hits.push({ r: [x - 2, y - 2, w, 11], act });
    return w;
  }

  // ---------------------------------------------------------- contents --
  drawContents(ctx, L, t) {
    const [A, B] = this.halves(L, 0.46);
    const found = this.pm.found(), total = this.pm.speciesCount();
    const puzzles = SETS.find((s) => s.id === 'always').keys.filter((k) => puzzleDone(this.book, k)).length;
    const title = 'Aquarium Notebook', big = textWidth(title) * 2 < A[2] - 8;
    drawText(ctx, title, A[0] + 6, A[1] + 6, { scale: big ? 2 : 1, color: INK });
    drawText(ctx, 'kept by YOU', A[0] + 6, A[1] + (big ? 22 : 16), { color: FADED });
    let yy = A[1] + (big ? 38 : 30);
    const stat = (icon, label, v) => { icon(ctx, A[0] + 10, yy + 3, t); drawText(ctx, label, A[0] + 20, yy, { color: INK }); drawText(ctx, v, A[0] + A[2] - 8, yy, { align: 'right', color: '#c2466e' }); yy += 12; };
    stat(iconFish, 'animals found', `${found}/${total}`);
    stat(iconPiece, 'jigsaws done', `${puzzles}/${total}`);
    stat(iconRibbon, 'banners won', `${this.pm.cam.banners.length}/${SETS.length}`);
    // your collection: everyone you've found, wiggling in little boxes
    const got = this.pm.foundKeys().filter((k) => k !== 'me' && k !== 'us');
    if (got.length) {
      drawText(ctx, 'your collection', A[0] + 6, yy + 4, { color: '#c2466e' });
      const cs = 22, per = Math.max(1, Math.floor((A[2] - 12) / (cs + 3)));
      const rows = Math.max(0, Math.floor((A[1] + A[3] - 80 - (yy + 16)) / (cs + 3)));
      got.slice(0, per * rows).forEach((k, i) => {
        const x = A[0] + 6 + (i % per) * (cs + 3), y = yy + 16 + Math.floor(i / per) * (cs + 3);
        ctx.fillStyle = '#efe0c0'; ctx.fillRect(x, y, cs, cs);
        const img = animalFrame(k, t + i * 0.31, 'icon');
        if (img) drawFit(ctx, img, x + cs / 2, y + cs / 2 + Math.sin(t * 2 + i) * 0.8, cs - 3, cs - 3);
        if (puzzleDone(this.book, k)) { ctx.fillStyle = '#ffc830'; ctx.fillRect(x + cs - 4, y + 1, 3, 3); }
        this.hits.push({ r: [x, y, cs, cs], act: () => this.go({ kind: 'animal', key: k }, 1) });
      });
    }
    // the bean, swimming along with a fact
    const facts = [];
    for (const k of Object.keys(FACTS)) { const e = this.entry(k); if (e) for (let i = 0; i < (e.pieces | 0); i++) facts.push(FACTS[k][i]); }
    const fact = facts.length ? facts[Math.floor(t / 7) % facts.length] : 'Take photos of the animals to fill me in!';
    const lines = wrap('Did you know? ' + fact, A[2] - 22).slice(0, 4);
    const bubH = lines.length * 10 + 8, bubY = A[1] + A[3] - bubH - 26;
    if (bubY > yy + 2) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(A[0] + 8, bubY, A[2] - 16, bubH);
      ctx.fillStyle = '#e8d8b8'; ctx.fillRect(A[0] + 8, bubY + bubH, A[2] - 16, 1);
      lines.forEach((ln, i) => drawText(ctx, ln, A[0] + 12, bubY + 4 + i * 10, { color: '#4a3a5a' }));
      const bean = animalFrame('bean', t, 'big'), bxp = A[0] + 18 + ((t * 12) % (A[2] - 30));
      ctx.drawImage(bean, Math.round(bxp - bean.width / 2), Math.round(A[1] + A[3] - 22 - bean.height / 2 + Math.sin(t * 3) * 1.5));
    }
    // the tanks
    drawText(ctx, 'the tanks', B[0] + 6, B[1] + 6, { color: '#c2466e' });
    const rowH = Math.min(26, Math.floor((B[3] - 22) / SECTIONS.length));
    SECTIONS.forEach((S, i) => {
      const y = B[1] + 18 + i * rowH, x = B[0] + 6, w = B[2] - 12;
      const got = S.keys.filter((k) => this.entry(k)).length, dn = S.keys.filter((k) => puzzleDone(this.book, k)).length;
      const hv = this.hit([x, y, w, rowH - 2], ...this.pm.story.mouse);
      if (hv) { ctx.fillStyle = 'rgba(255,138,180,0.18)'; ctx.fillRect(x - 2, y - 1, w + 4, rowH - 1); }
      this.miniTank(ctx, S, x, y, 34, rowH - 4, t);
      drawText(ctx, S.name, x + 40, y + 1, { color: INK });
      drawText(ctx, `${got}/${S.keys.length} found`, x + 40, y + 11, { color: FADED });
      // banner swatch
      const won = this.pm.cam.banners.includes(S.id);
      for (let q = 0; q < 8; q++) { ctx.fillStyle = won ? S.cols[q % 2] : q % 2 ? '#d8c8a8' : '#c8b898'; ctx.fillRect(x + w - 18 + q * 2, y + 2, 2, 8); }
      // jigsaw progress
      const pw2 = Math.min(50, w - 110);
      if (pw2 > 10) { ctx.fillStyle = '#e4d4b4'; ctx.fillRect(x + w - 24 - pw2, y + 5, pw2, 4); ctx.fillStyle = S.cols[0]; ctx.fillRect(x + w - 24 - pw2, y + 5, Math.round((pw2 * dn) / S.keys.length), 4); }
      this.hits.push({ r: [x, y, w, rowH - 2], act: () => this.go({ kind: 'section', id: S.id }, 1) });
    });
  }

  // a tiny tank with a couple of its animals swimming
  miniTank(ctx, S, x, y, w, h, t) {
    const [c0, c1] = TANK[S.id];
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c0);
    ctx.fillStyle = '#1a1020'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#d8c090'; ctx.fillRect(x, y + h - 2, w, 2);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    S.keys.filter((k) => this.entry(k) && k !== 'me' && k !== 'us').slice(0, 2).forEach((k, i) => {
      const img = animalFrame(k, t + i, 'icon');
      if (!img) return;
      const nose = noseOf(k) || -1, u = ((t * 6 + i * 17) % (w + 20)) - 10;
      drawFit(ctx, img, nose < 0 ? x + w - u : x + u, y + h * (0.35 + i * 0.3) + Math.sin(t * 2 + i) * 1.5, 14, h * 0.5);
    });
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 2, y + 1, 1, h - 4);
  }

  // ------------------------------------------------------------ section --
  drawSection(ctx, L, t) {
    const S = SECTIONS.find((q) => q.id === this.page.id);
    const [A, B] = this.halves(L, 0.5);
    const got = S.keys.filter((k) => this.entry(k)).length, dn = S.keys.filter((k) => puzzleDone(this.book, k)).length;
    this.link(ctx, '< contents', A[0] + 4, A[1] + 4, () => this.go({ kind: 'contents' }, -1));
    // the tank window, alive
    const tx = A[0] + 6, ty = A[1] + 17, tw = A[2] - 12, th = Math.max(40, Math.min(Math.round(tw * 0.62), A[3] - 60));
    this.tankScene(ctx, S, tx, ty, tw, th, t);
    const big = textWidth(S.name) * 2 < tw;
    drawText(ctx, S.name, tx, ty + th + 5, { scale: big ? 2 : 1, color: INK });
    let yy = ty + th + (big ? 21 : 15);
    drawText(ctx, `${got}/${S.keys.length} found · ${dn}/${S.keys.length} jigsaws`, tx, yy, { color: FADED });
    yy += 11;
    const won = this.pm.cam.banners.includes(S.id);
    for (let q = 0; q < 10; q++) { ctx.fillStyle = won ? S.cols[q % 2] : q % 2 ? '#d8c8a8' : '#c8b898'; ctx.fillRect(tx + q * 2, yy, 2, 8); }
    if (yy + 8 < A[1] + A[3]) drawText(ctx, won ? 'banner won! wear it on your camera' : 'finish every jigsaw here for this banner', tx + 24, yy, { color: won ? '#c27a10' : FADED });
    // the animals, as cards
    drawText(ctx, 'who lives here', B[0] + 6, B[1] + 5, { color: '#c2466e' });
    // as big as the page allows: fewer, larger cards for a small tank
    const maxCols = Math.max(2, Math.floor((B[2] - 8) / 46));
    let cols = Math.min(maxCols, S.keys.length);
    while (cols > 2 && Math.ceil(S.keys.length / cols) * 60 < B[3] - 30 && Math.floor((B[2] - 8) / (cols - 1)) < 90) cols--;
    const cw = Math.min(88, Math.floor((B[2] - 8) / cols) - 4);
    const ch = Math.min(Math.round(cw * 0.9), Math.max(34, Math.floor((B[3] - 20) / Math.ceil(S.keys.length / cols)) - 4));
    S.keys.forEach((k, i) => {
      const x = B[0] + 6 + (i % cols) * (cw + 4), y = B[1] + 17 + Math.floor(i / cols) * (ch + 4);
      const e = this.entry(k), full = puzzleDone(this.book, k);
      const hv = this.hit([x, y, cw, ch], ...this.pm.story.mouse);
      ctx.fillStyle = 'rgba(80,50,20,0.22)'; ctx.fillRect(x + 1, y + 2, cw, ch);
      ctx.fillStyle = full ? '#fff0f6' : e ? '#fffdf6' : '#e4d6b8'; ctx.fillRect(x, y - (hv && e ? 1 : 0), cw, ch);
      const iy = y + (ch - 12) / 2 - 2;
      if (e) {
        const img = animalFrame(k, t + i * 0.37, cw > 60 ? 'big' : 'icon') || (e.img || null);
        if (img) drawFit(ctx, img, x + cw / 2, iy, cw - 6, ch - 18, !animalFrame(k, 0, 'icon'));
        else iconHeart(ctx, x + cw / 2, iy, t);
      } else {
        // a shy silhouette
        drawText(ctx, '?', x + cw / 2, iy - 4, { align: 'center', color: FADED, scale: 2 });
      }
      drawText(ctx, e ? fit(this.name(k), cw - 2) : '???', x + cw / 2, y + ch - 17, { align: 'center', color: e ? INK : FADED });
      const pl = e ? placedCount(e) : 0, pc = e ? e.pieces | 0 : 0;
      for (let q = 0; q < PIECES; q++) { ctx.fillStyle = q < pl ? '#ff6a9a' : q < pc ? '#ffc0d4' : '#d4c4a4'; ctx.fillRect(x + cw / 2 - 10 + q * 5, y + ch - 6, 4, 3); }
      if (full) { const ic = keychainIcon(k); ctx.drawImage(ic, x + cw - ic.width + 2, y - 4); }
      if (e) this.hits.push({ r: [x, y, cw, ch], act: () => this.go({ kind: 'animal', key: k }, 1) });
    });
  }

  // a whole little tank: gradient water, light rays, sand, swaying weed,
  // bubbles, and every animal you've found here swimming about
  tankScene(ctx, S, x, y, w, h, t) {
    const [c0, c1] = TANK[S.id];
    ctx.fillStyle = '#10141e'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#4a5a6a'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 4; i++) { const rx = x + ((i * 0.28 + 0.08) * w) + Math.sin(t * 0.4 + i) * 6; ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + 8, y); ctx.lineTo(rx - 6, y + h); ctx.lineTo(rx - 14, y + h); ctx.fill(); }
    const sandY = y + h - 7;
    ctx.fillStyle = '#c8a870'; ctx.fillRect(x, sandY, w, 7);
    ctx.fillStyle = '#e0c490'; for (let i = 0; i < w; i += 5) ctx.fillRect(x + i, sandY + ((i * 7) % 3), 2, 1);
    // weed
    for (let i = 0; i < 5; i++) {
      const wx = x + 6 + ((i * 53) % (w - 12)), hh = 10 + ((i * 7) % 12);
      ctx.fillStyle = i % 2 ? '#2e8a4a' : '#4aaa5a';
      for (let j = 0; j < hh; j++) ctx.fillRect(Math.round(wx + Math.sin(t * 1.5 + i + j * 0.25) * (j / hh) * 3), sandY - j, 2, 1);
    }
    // bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 6; i++) { const by = y + h - ((t * 14 + i * 29) % h), bx = x + ((i * 71) % w) + Math.sin(t * 2 + i) * 2; ctx.fillRect(Math.round(bx), Math.round(by), 1 + (i % 2), 1 + (i % 2)); }
    // the residents
    const who = S.keys.filter((k) => this.entry(k) && k !== 'me' && k !== 'us');
    const maxW = Math.max(18, w * 0.34);
    who.forEach((k, i) => {
      const img = animalFrame(k, t + i * 0.5, w > 140 ? 'big' : 'icon');
      if (!img) return;
      const move = MOVES[k], nose = noseOf(k), sc = Math.min(1, maxW / img.width, (h * 0.45) / img.height);
      const dw = img.width * sc, dh = img.height * sc;
      let px, py, flip = 1;
      if (move === 'sand') { px = x + w * (0.2 + 0.6 * ((i * 0.37) % 1)) + Math.sin(t * 0.6 + i) * w * 0.12; py = sandY - dh / 2 + 1; }
      else if (move === 'drift') { px = x + w * (0.15 + 0.7 * ((i * 0.43 + 0.1) % 1)) + Math.sin(t * 0.3 + i) * 5; py = y + h * 0.45 + Math.sin(t * 0.7 + i * 2) * h * 0.2; }
      else {
        const span = w + dw, u = ((t * (10 + (i * 5) % 9) + i * 67) % span);
        px = nose < 0 ? x + w + dw / 2 - u : x - dw / 2 + u;
        py = y + h * (0.22 + ((i * 0.29) % 0.5)) + Math.sin(t * 1.2 + i) * 3;
      }
      ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.scale(flip, 1);
      ctx.imageSmoothingEnabled = sc < 0.6;
      ctx.drawImage(img, Math.round(-dw / 2), Math.round(-dh / 2), Math.round(dw), Math.round(dh));
      ctx.imageSmoothingEnabled = false;
      ctx.restore();
    });
    // the ones still to find: little question bubbles
    S.keys.filter((k) => !this.entry(k)).forEach((k, i) => {
      const qx = x + 10 + ((i * 47 + 20) % (w - 20)), qy = y + h * 0.3 + ((t * 5 + i * 13) % (h * 0.4));
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(Math.round(qx) - 4, Math.round(qy) - 4, 9, 9);
      drawText(ctx, '?', Math.round(qx) + 1, Math.round(qy) - 3, { align: 'center', color: 'rgba(255,255,255,0.75)' });
    });
    ctx.restore();
    // glass glint
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 3, y + 2, 1, Math.round(h * 0.5)); ctx.fillRect(x + 5, y + 2, 1, Math.round(h * 0.25));
  }

  // ------------------------------------------------------------- animal --
  drawAnimal(ctx, L, t) {
    const key = this.page.key, e = this.entry(key) || { pieces: 0 }, S = SECTIONS.find((q) => q.id === sectionOf(key));
    // one tall page: size the top half to the porthole and jigsaw so the
    // notes start right under them instead of halfway down
    let fixR = 0, fixJ = 0, split = 0.48;
    if (!L.wide) {
      const [, , w, h] = L.pages[0];
      fixR = Math.round(Math.min(w * 0.22, h * 0.1, 30));
      fixJ = Math.max(1, Math.min(3, Math.floor((w - Math.round(w * 0.36) - 16) / PW), Math.floor((h * 0.3) / PH)));
      split = Math.min(0.62, (18 + fixR * 2 + 8 + PH * fixJ + 20) / h);
    }
    const [A, B] = this.halves(L, split);
    this.link(ctx, `< ${S.name}`, A[0] + 4, A[1] + 4, () => this.go({ kind: 'section', id: S.id }, -1));
    // the porthole
    const r = fixR || Math.round(Math.min(A[2] * 0.22, A[3] * 0.2, 30)), cx = A[0] + 8 + r, cy = A[1] + 18 + r;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    const [c0, c1] = TANK[S.id], g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, c1); g.addColorStop(1, c0);
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(cx - r * 0.3, cy - r); ctx.lineTo(cx, cy - r); ctx.lineTo(cx - r * 0.6, cy + r); ctx.lineTo(cx - r * 0.9, cy + r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 4; i++) { const by = cy + r - ((t * 12 + i * 17) % (r * 2)); ctx.fillRect(Math.round(cx - r * 0.6 + i * r * 0.4), Math.round(by), 1, 1); }
    const img = animalFrame(key, t, 'big') || e.img;
    if (img) {
      const sc = Math.min(1.6 * r / img.width, 1.5 * r / img.height, img === e.img ? 9 : 1.4);
      ctx.imageSmoothingEnabled = img === e.img || sc < 0.7;
      ctx.drawImage(img, Math.round(cx - (img.width * sc) / 2), Math.round(cy - (img.height * sc) / 2 + Math.sin(t * 2) * 1.5), Math.round(img.width * sc), Math.round(img.height * sc));
      ctx.imageSmoothingEnabled = false;
    } else iconHeart(ctx, cx, cy, t);
    ctx.restore();
    // brass rim with bolts
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#e8c870'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r + 2, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.fillStyle = '#5a4010'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * (r + 1.5)), Math.round(cy + Math.sin(a) * (r + 1.5)), 1, 1); }
    // name, rarity, photos
    const nx = cx + r + 8, nw = A[0] + A[2] - nx - 4, nm = this.name(key), big = textWidth(nm) * 2 < nw;
    drawText(ctx, nm, nx, cy - r + 2, { scale: big ? 2 : 1, color: INK });
    const rr = this.rarity(key);
    drawText(ctx, '★'.repeat(rr), nx, cy - r + (big ? 20 : 13), { color: ['#888', '#7ab8e8', '#5ac890', '#e8962a', '#e84ab8'][rr], outline: '#3a2a4a' });
    drawText(ctx, `photos ×${e.n || 0}`, nx, cy - r + (big ? 31 : 24), { color: FADED });
    if (e.img) this.link(ctx, 'postcard ✉', nx, cy - r + (big ? 43 : 35), () => { this.pm.album.card = key; this.pm.story.sound.sfx('chime'); });
    // the jigsaw: board on the left, loose pieces waiting on the right
    const jyTop = cy + r + 8, availH = A[1] + A[3] - jyTop - 12;
    const trayW = Math.round(A[2] * 0.36);
    const js = fixJ || Math.max(1, Math.min(3, Math.floor(Math.min((A[2] - trayW - 16) / PW, availH / PH))));
    const J = { x: A[0] + 8, y: jyTop, s: js };
    J.trayX = J.x + PW * js + 8; J.trayY = jyTop; J.trayStep = Math.max(20, (A[0] + A[2] - 6 - J.trayX) / 2); J.trayStepY = PH * js * 0.5;
    this.jig = J;
    this.ensureLoose(key, J);
    ctx.fillStyle = '#5a3418'; ctx.fillRect(J.x - 2, J.y - 2, PW * js + 4, PH * js + 4);
    ctx.imageSmoothingEnabled = false;
    const photo = key === 'me' || key === 'us' ? e.img : null;
    ctx.drawImage(jigsaw(key, 0, photo), J.x, J.y, PW * js, PH * js);
    for (const i of PIECE_ORDER) {
      if (!((e.placed | 0) & (1 << i))) continue;
      const pul = this.pulse && this.pulse.i === i ? 1 + Math.sin(this.pulse.t / 0.6 * Math.PI) * 0.06 : 1;
      const [pcx, pcy] = pieceCentre(i);
      ctx.save(); ctx.translate(J.x + pcx * js, J.y + pcy * js); ctx.scale(pul, pul);
      ctx.drawImage(pieceImage(key, i, photo), -pcx * js, -pcy * js, PW * js, PH * js);
      ctx.restore();
    }
    // a gleam across the finished picture
    if (this.shine != null) {
      const gx = J.x + lerp(-20, PW * js + 20, this.shine);
      ctx.save(); ctx.beginPath(); ctx.rect(J.x, J.y, PW * js, PH * js); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(gx, J.y); ctx.lineTo(gx + 8, J.y); ctx.lineTo(gx - 4, J.y + PH * js); ctx.lineTo(gx - 12, J.y + PH * js); ctx.fill();
      ctx.restore();
    }
    // tray
    ctx.fillStyle = 'rgba(120,90,50,0.12)'; ctx.fillRect(J.trayX - 2, J.trayY - 2, A[0] + A[2] - J.trayX - 4, PH * js + 4);
    for (const p of this.loose.list) {
      const [pcx, pcy] = pieceCentre(p.i), lifted = this.drag && this.drag.p === p;
      ctx.save();
      ctx.translate(J.x + pcx * js + p.dx, J.y + pcy * js + p.dy);
      ctx.rotate(p.fly || lifted ? 0 : p.rot);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#3a2410';
      ctx.drawImage(pieceImage(key, p.i, photo), -pcx * js + 2, -pcy * js + 3, PW * js, PH * js);
      ctx.globalAlpha = 1;
      ctx.drawImage(pieceImage(key, p.i, photo), -pcx * js, -pcy * js - (lifted ? 2 : 0), PW * js, PH * js);
      ctx.restore();
    }
    const pl = placedCount(e), loose = this.loose.list.length;
    const hint = loose ? 'drag the pieces in (or tap them)' : pl >= PIECES ? 'complete!' : `${PIECES - (e.pieces | 0)} more photo${PIECES - (e.pieces | 0) > 1 ? 's' : ''} for more pieces`;
    drawText(ctx, hint, J.x, J.y + PH * js + 4, { color: loose ? '#c2466e' : pl >= PIECES ? '#c27a10' : FADED });
    // field notes
    let y = B[1] + 5;
    drawText(ctx, 'field notes', B[0] + 6, y, { color: '#c2466e' });
    y += 12;
    const N = NOTES[key] || ['?', '?', '?'];
    [[iconRuler, 'size'], [iconFork, 'eats'], [iconHome, 'lives']].forEach(([icon, label], i) => {
      icon(ctx, B[0] + 11, y + 3, t + i);
      drawText(ctx, label, B[0] + 20, y, { color: FADED });
      const ls = wrap(N[i], B[2] - 60);
      ls.slice(0, 2).forEach((ln, j) => drawText(ctx, ln, B[0] + 52, y + j * 10, { color: INK }));
      y += 10 * Math.min(2, ls.length) + 2;
    });
    y += 3;
    drawText(ctx, 'fun facts', B[0] + 6, y, { color: '#c2466e' });
    y += 12;
    const lim = B[1] + B[3] - 30;
    FACTS[key].forEach((f, i) => {
      if (y > lim) return;
      const have = i < (e.pieces | 0);
      if (have) iconFish(ctx, B[0] + 10, y + 3, t + i * 0.7); else iconLock(ctx, B[0] + 10, y + 3);
      const ls = have ? wrap(f, B[2] - 26) : ['??? snap it again to find out'];
      ls.forEach((ln, j) => { if (y + j * 10 <= lim) drawText(ctx, ln, B[0] + 18, y + j * 10, { color: have ? INK : FADED }); });
      y += ls.length * 10 + 3;
    });
    // your best shot, if there's room for it
    if (e.img && lim - y > 40) {
      const room = lim - y - 4, pw = Math.min(B[2] * 0.5, e.img.width, room * 1.2), ph = (pw * e.img.height) / e.img.width;
      const qx = B[0] + B[2] / 2, qy = y + 4 + (ph + 12) / 2;
      ctx.save(); ctx.translate(Math.round(qx), Math.round(qy)); ctx.rotate(-0.04);
      ctx.fillStyle = 'rgba(60,40,20,0.3)'; ctx.fillRect(-pw / 2 - 1, -ph / 2 - 2, pw + 6, ph + 13);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-pw / 2 - 3, -ph / 2 - 4, pw + 6, ph + 13);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(e.img, -pw / 2, -ph / 2 - 1, pw, ph); ctx.imageSmoothingEnabled = false;
      drawText(ctx, 'best shot', 0, ph / 2 + 1, { align: 'center', color: '#8a6a5a' });
      ctx.restore();
    }
    // the prize
    const py = B[1] + B[3] - 16, full = puzzleDone(this.book, key), ic = keychainIcon(key);
    ctx.globalAlpha = full ? 1 : 0.35; ctx.drawImage(ic, B[0] + 6, py - 5); ctx.globalAlpha = 1;
    drawText(ctx, fit(`${this.name(key)} keychain`, B[2] - 90), B[0] + 24, py, { color: full ? INK : FADED });
    const on = this.pm.cam.charm === 'k:' + key;
    const tag = full ? (on ? 'wearing it' : 'wear it') : `${PIECES - (e.pieces | 0)} to go`;
    const tw = textWidth(tag) + 8, bxp = B[0] + B[2] - tw - 22;
    ctx.fillStyle = full ? (on ? '#8ad0a0' : '#ff6a9a') : '#d8c8a8'; ctx.fillRect(bxp, py - 2, tw, 11);
    drawText(ctx, tag, bxp + tw / 2, py, { align: 'center', color: '#ffffff' });
    if (full) this.hits.push({ r: [bxp, py - 2, tw, 11], act: () => { this.pm.cam.charm = on ? null : 'k:' + key; this.pm.charmV += 6; this.pm.story.sound.sfx('ding'); this.pm.camChanged(); } });
    // turn to the next or previous animal in this tank
    const list = S.keys.filter((k) => this.entry(k)), at = list.indexOf(key);
    if (list.length > 1) {
      const prev = list[(at - 1 + list.length) % list.length], next = list[(at + 1) % list.length];
      this.link(ctx, '<', B[0] + B[2] - 16, py, () => this.go({ kind: 'animal', key: prev }, -1));
      this.link(ctx, '>', B[0] + B[2] - 7, py, () => this.go({ kind: 'animal', key: next }, 1));
    }
  }
}

// ---------------------------------------------------------------- helpers --
const sectionOf = (key) => (SECTIONS.find((s) => s.keys.includes(key)) || SECTIONS[2]).id;
const placedCount = (e) => { let n = 0; for (let i = 0; i < PIECES; i++) if ((e.placed | 0) & (1 << i)) n++; return n; };

// draw img centred at (cx, cy), fitted inside w x h (never bigger than 1:1
// unless it's a photo)
function drawFit(ctx, img, cx, cy, w, h, photo = false) {
  const sc = Math.min(w / img.width, h / img.height, photo ? 9 : 1);
  const dw = Math.max(1, Math.round(img.width * sc)), dh = Math.max(1, Math.round(img.height * sc));
  ctx.imageSmoothingEnabled = photo || sc < 0.6;
  ctx.drawImage(img, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
  ctx.imageSmoothingEnabled = false;
}

function burst(pm, x, y, n) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, sp = 25 + R() * 35; pm.story.fx.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, age: 0, life: 0.5 + R() * 0.3, size: 1 + (R() * 2 | 0), col: i % 3 ? '#ffe38a' : '#ffffff' }); }
}

function fit(str, w) {
  if (textWidth(str) <= w) return str;
  let s = str;
  while (s.length > 1 && textWidth(s + '.') > w) s = s.slice(0, -1);
  return s + '.';
}

// little animated icons, drawn in pixels around (x, y)
const px = (ctx, col, pts, x, y) => { ctx.fillStyle = col; for (const [a, b] of pts) ctx.fillRect(Math.round(x + a), Math.round(y + b), 1, 1); };
function iconFish(ctx, x, y, t) {
  const w = Math.round(Math.sin(t * 6));
  px(ctx, '#ff8a3a', [[-2, 0], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, 0], [2 + w, -1], [2 + w, 1]], x, y);
  px(ctx, '#1a1020', [[-1, -1]], x, y);
}
function iconLock(ctx, x, y) {
  px(ctx, '#a08c6c', [[-1, -3], [0, -3], [1, -3], [-2, -2], [2, -2], [-2, -1], [2, -1]], x, y);
  ctx.fillStyle = '#c8a860'; ctx.fillRect(Math.round(x - 2), Math.round(y), 5, 3);
}
function iconPiece(ctx, x, y, t) {
  const b = Math.round(Math.sin(t * 3));
  ctx.fillStyle = '#ff6a9a'; ctx.fillRect(Math.round(x - 3), Math.round(y - 2 + b), 5, 5);
  ctx.fillRect(Math.round(x + 2), Math.round(y - 1 + b), 2, 2); ctx.fillRect(Math.round(x - 2), Math.round(y - 4 + b), 2, 2);
}
function iconRibbon(ctx, x, y, t) {
  const w = Math.round(Math.sin(t * 4) * 0.8);
  ctx.fillStyle = '#ffc830'; ctx.fillRect(Math.round(x - 2), Math.round(y - 3), 5, 4);
  ctx.fillStyle = '#ff5ac8'; ctx.fillRect(Math.round(x - 2 + w), Math.round(y + 1), 2, 3); ctx.fillRect(Math.round(x + 1 - w), Math.round(y + 1), 2, 3);
}
function iconRuler(ctx, x, y, t) {
  const len = 6 + Math.round((Math.sin(t * 2) + 1) * 2);
  ctx.fillStyle = '#e8c060'; ctx.fillRect(Math.round(x - 4), Math.round(y - 1), len, 3);
  ctx.fillStyle = '#6a4a1a'; for (let i = 0; i < len; i += 2) ctx.fillRect(Math.round(x - 4 + i), Math.round(y - 1), 1, 1 + (i % 4 === 0));
}
function iconFork(ctx, x, y, t) {
  const b = Math.round(Math.abs(Math.sin(t * 4)) * -2);
  px(ctx, '#8a9aaa', [[-1, -3], [0, -3], [1, -3], [-1, -2], [0, -2], [1, -2], [0, -1], [0, 0], [0, 1], [0, 2]], x, y + b);
}
function iconHome(ctx, x, y, t) {
  const s = Math.round(Math.sin(t * 2));
  px(ctx, '#ff7a8a', [[0 + s, -3], [-1 + s, -2], [1 + s, -2], [-2, -1], [2, -1]], x, y);
  ctx.fillStyle = '#4aaa6a'; ctx.fillRect(Math.round(x - 2), Math.round(y), 5, 3);
}
function iconHeart(ctx, x, y, t) {
  const k = 1 + Math.round((Math.sin(t * 4) + 1) * 0.5);
  ctx.fillStyle = '#ff5a8a';
  ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'].forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(Math.round(x - 3.5 * k + i * k), Math.round(y - 3 * k + j * k), k, k); });
}
