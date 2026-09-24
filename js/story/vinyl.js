// The record player in the top-left corner. Three records, each one locked
// until you find a message bottle floating in one of the tanks and tap it
// open. Tap the player to open the crate and pick a record; it spins, the
// arm drops, bubbles and notes drift up while it plays. Only once the story
// is over, so the song that tells it isn't cut off.
import { TAU, clamp, lerp, R, makeCanvas } from '../util.js';
import { drawText, textWidth } from '../font.js';

export const TRACKS = [
  { id: 'always', title: 'Always', artist: 'Daniel Caesar', src: 'audio/always.mp3', cover: 'img/cover-always.jpg', label: '#3a4aff' },
  { id: 'bluehair', title: 'Blue Hair', artist: 'TV Girl', src: 'audio/blue-hair.mp3', cover: 'img/cover-blue-hair.jpg', label: '#ff5ac8' },
  { id: 'octopus', title: "Octopus's Garden", artist: 'The Beatles', src: 'audio/octopuss-garden.mp3', cover: 'img/cover-octopuss-garden.jpg', label: '#5ac8ff' },
];
// one bottle hides in each tank; each unlocks the next record
const BOTTLE_AT = { JellyRoom: 0.62, ReefRoom: 0.28, Aquarium: 0.74 };
const SAVE_KEY = 'vcag-vinyl-1';
const DISC = 37; // the record, in pixels across

export class Vinyl {
  constructor(story) {
    this.story = story;
    this.unlocked = ['always'];
    this.found = [];
    this.playing = null;
    this.audio = null;
    this.open = false;
    this.spin = 0; this.speed = 0; this.arm = 0;
    this.parts = [];
    this.pop = [];      // bottle-opening bubble bursts
    this.flash = 0;     // the player glows when a record is unlocked
    this.t = 0;
    this.covers = {};
    this.pix = {};
    this.disc = makeCanvas(DISC, DISC);
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      this.unlocked = (d.unlocked || []).filter((id) => TRACKS.some((q) => q.id === id));
      if (!this.unlocked.includes('always')) this.unlocked.unshift('always'); // Always comes with the player
      this.found = d.found || [];
    } catch (e) { /* no storage */ }
    for (const tr of TRACKS) {
      const img = new Image();
      img.onload = () => {
        // a tiny copy, so the record label and the crate stay crisp and cheap
        const c = makeCanvas(24, 24);
        c.ctx.imageSmoothingEnabled = true;
        c.ctx.drawImage(img, 0, 0, 24, 24);
        this.covers[tr.id] = c;
        // and a chunky 12x12 version for the record's label
        const q = makeCanvas(12, 12);
        q.ctx.imageSmoothingEnabled = true;
        q.ctx.drawImage(img, 0, 0, 12, 12);
        this.pix[tr.id] = q.ctx.getImageData(0, 0, 12, 12).data;
        this.covers[tr.id] = q; // pixel-art thumbnails in the crate too
      };
      img.src = tr.cover;
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (!this.audio || !this.playing) return;
      if (document.hidden) this.audio.pause(); else this.audio.play().catch(() => {});
    });
  }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: this.unlocked, found: this.found })); } catch (e) { /* full */ } }

  get W() { return this.story.W; }
  get H() { return this.story.H; }
  // shows once the photo quest is done
  visible() { const s = this.story; return !s.title && s.hud && !s.quest && !(s.photo && s.photo.album); }
  rect() { return [6, this.story.replay ? 22 : 6, DISC, DISC]; }
  crateRect() { const [x, y, , h] = this.rect(); return [x, y + h + 6, Math.min(150, this.W - 12), 14 + TRACKS.length * 20 + 12]; }
  rowRect(i) { const [x, y, w] = this.crateRect(); return [x + 3, y + 13 + i * 20, w - 6, 18]; }

  // ---------------------------------------------------------------- bottles --
  bottle() {
    const s = this.story, room = s.stage && s.stage.constructor.name;
    if (!this.visible() || !(room in BOTTLE_AT) || this.found.includes(room) || this.unlocked.length >= TRACKS.length) return null;
    const x = Math.round(this.W * BOTTLE_AT[room]), y = Math.round(this.H * 0.38 + Math.sin(this.t * 1.3) * 4);
    return { room, x, y };
  }
  openBottle(b) {
    const snd = this.story.sound;
    this.found.push(b.room);
    const next = TRACKS.find((q) => !this.unlocked.includes(q.id));
    if (next) this.unlocked.push(next.id);
    this.save();
    for (let i = 0; i < 26; i++) { const a = R() * TAU, sp = 20 + R() * 50; this.pop.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, r: 1 + (R() * 3 | 0), age: 0, life: 0.8 + R() * 0.8 }); }
    snd.sfx('pop'); snd.sfx('sparkle');
    this.flash = 1;
    if (next) this.story.photo.say(`new record: ${next.title}!`);
  }

  // -------------------------------------------------------------- playing --
  play(id) {
    const s = this.story, tr = TRACKS.find((q) => q.id === id);
    if (!tr) return;
    if (!s.roam) { s.photo.say('after the story ♪'); s.sound.sfx('escape'); return; }
    this.stop(true);
    const snd = s.sound;
    for (const el of [snd.el, snd.el2, snd.intro]) if (el) try { el.pause(); } catch (e) { /* fine */ }
    const a = new Audio(tr.src);
    a.loop = true; a.muted = !snd.enabled; a.volume = 0.9;
    a.play().catch(() => {});
    this.audio = a; this.playing = id;
    snd.sfx('type');
  }
  stop(quiet) {
    if (!quiet) this.stopped = true; // you turned it off: don't start it again by itself
    if (this.audio) { try { this.audio.pause(); } catch (e) { /* fine */ } this.audio = null; }
    if (this.playing && !quiet) this.story.sound.sfx('type');
    this.playing = null;
  }
  setMuted(m) { if (this.audio) this.audio.muted = m; }

  // ---------------------------------------------------------------- input --
  hit(r, x, y) { return x >= r[0] - 1 && x <= r[0] + r[2] + 1 && y >= r[1] - 1 && y <= r[1] + r[3] + 1; }
  pointer(type, x, y) {
    if (type !== 'down') return false;
    const b = this.bottle();
    if (b && Math.hypot(x - b.x, y - b.y) < 14) { this.openBottle(b); return true; }
    if (!this.visible()) { this.open = false; return false; }
    if (this.hit(this.rect(), x, y)) { this.open = !this.open; this.story.sound.sfx('pop'); return true; }
    if (!this.open) return false;
    if (this.hit(this.crateRect(), x, y)) {
      TRACKS.forEach((tr, i) => {
        if (!this.hit(this.rowRect(i), x, y)) return;
        if (!this.unlocked.includes(tr.id)) { this.story.photo.say('find a bottle in the tanks'); this.story.sound.sfx('escape'); return; }
        if (this.playing === tr.id) this.stop(); else this.play(tr.id);
      });
      return true;
    }
    this.open = false;
    return false;
  }

  // --------------------------------------------------------------- update --
  // during the story the song on is Always itself, so the disc shows it
  storyPlaying() { const s = this.story; return !this.playing && !s.roam && s.sound && s.sound.playing; }
  update(dt) {
    this.t += dt;
    const s = this.story;
    // once the story's song has finished, Always carries on on the record
    if (s.roam && !this.playing && !this.stopped) { const el = s.sound.el; if (!el || el.ended || el.paused) this.play('always'); }
    const on = !!this.playing || this.storyPlaying();
    this.speed += ((on ? 1 : 0) - this.speed) * Math.min(1, dt * (on ? 3 : 1.5));
    this.spin += this.speed * dt * 3.5;
    this.arm += ((on ? 1 : 0) - this.arm) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    if (on && this.visible()) {
      const [x, y] = this.rect();
      if (R() < dt * 6) this.parts.push({ x: x + DISC / 2 + (R() - 0.5) * 26, y: y + DISC / 2, vx: (R() - 0.5) * 6, vy: -10 - R() * 10, age: 0, life: 2 + R(), kind: R() < 0.3 ? 'note' : 'bubble', r: 1 + (R() * 2 | 0), ph: R() * TAU });
    }
    for (const p of this.parts) { p.age += dt; p.x += (p.vx + Math.sin(p.age * 4 + p.ph) * 4) * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const p of this.pop) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2; p.vy = p.vy * (1 - dt * 2) - 30 * dt; }
    this.pop = this.pop.filter((p) => p.age < p.life);
    // a trail of bubbles off the bottle
    const b = this.bottle();
    if (b && R() < dt * 5) this.pop.push({ x: b.x + (R() - 0.5) * 4, y: b.y - 6, vx: (R() - 0.5) * 4, vy: -12 - R() * 8, r: 1, age: 0, life: 1.4 });
  }

  // ----------------------------------------------------------------- draw --
  draw(ctx) {
    this.drawBottle(ctx);
    for (const p of this.pop) drawBubble(ctx, p.x, p.y, p.r, 1 - p.age / p.life);
    if (!this.visible()) return;
    const [x, y, w, h] = this.rect(), t = this.t;
    // bubbles and notes rising off the record
    for (const p of this.parts) {
      const a = Math.min(1, (p.life - p.age) / 0.6) * Math.min(1, p.age * 3);
      if (p.kind === 'note') drawText(ctx, '♪', Math.round(p.x), Math.round(p.y), { color: '#fff4b0', outline: '#1a1030', alpha: a });
      else drawBubble(ctx, p.x, p.y, p.r, a);
    }
    // just the record, floating and spinning, drawn pixel by pixel so it
    // stays crisp: grooves, a fixed sheen, and the album cover as its label
    const tr = TRACKS.find((q) => q.id === (this.playing || (this.storyPlaying() ? 'always' : null))) || TRACKS.find((q) => this.unlocked.includes(q.id));
    const bob = Math.round(Math.sin(t * 1.6) * 2);
    this.renderDisc(tr);
    // soft shadow and a glow when it plays
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#02081a';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 4, w * 0.36 - bob, 2, 0, 0, TAU); ctx.fill();
    if (this.playing || this.storyPlaying() || this.flash > 0) {
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 4) + this.flash * 0.4; ctx.fillStyle = '#9ae8ff';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2 + bob, w / 2 + 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.disc, x, y + bob);
    // what's playing, next to it
    const tx = x + w + 5, ty = y + h / 2 + bob - 8;
    if (!this.open) {
      if (this.playing || this.storyPlaying()) {
        drawText(ctx, '♪ now playing', tx, ty, { color: '#9ae8ff', outline: '#0a1030' });
        const line = `${tr.title} · ${tr.artist}`, room = Math.min(120, this.W - tx - 8), lw = textWidth(line);
        if (lw <= room) drawText(ctx, line, tx, ty + 9, { color: '#ffffff', outline: '#0a1030' });
        else {
          // a little marquee when the name's too long
          const off = Math.floor((t * 14) % (lw + 20));
          ctx.save(); ctx.beginPath(); ctx.rect(tx - 1, ty + 7, room + 2, 12); ctx.clip();
          drawText(ctx, line, tx - off, ty + 9, { color: '#ffffff', outline: '#0a1030' });
          drawText(ctx, line, tx - off + lw + 20, ty + 9, { color: '#ffffff', outline: '#0a1030' });
          ctx.restore();
        }
        // a tiny bouncing equaliser
        for (let i = 0; i < 5; i++) { const hh = 1 + Math.round((Math.sin(t * (7 + i * 1.7) + i) + 1) * 2.5); ctx.fillStyle = ['#ff7a5a', '#ffd24a', '#5ad08a', '#5ac8ff', '#c08aff'][i]; ctx.fillRect(tx + i * 3, ty + 24 - hh, 2, hh); }
      } else drawText(ctx, this.unlocked.length ? 'tap to play' : `records ${this.unlocked.length}/${TRACKS.length}`, tx, ty + 4, { color: '#fff4dc', outline: '#0a1030', alpha: 0.85 });
    }
    if (this.open) this.drawCrate(ctx);
  }

  renderDisc(tr) {
    const c = this.disc, R0 = DISC / 2, id = c.ctx.createImageData(DISC, DISC), d = id.data;
    const pix = tr && this.pix[tr.id], lab = 8.5, sp = this.spin, cs = Math.cos(-sp), sn = Math.sin(-sp);
    for (let py = 0; py < DISC; py++) for (let px = 0; px < DISC; px++) {
      const x = px + 0.5 - R0, y = py + 0.5 - R0, r = Math.hypot(x, y);
      if (r > R0) continue;
      let col;
      if (r < 1.2) col = [10, 10, 14];                       // the hole
      else if (r < lab) {
        // the label turns with the record: sample the cover, rotated
        const u = x * cs - y * sn, v = x * sn + y * cs;
        const ix = clamp(Math.floor((u / lab + 1) * 6), 0, 11), iy = clamp(Math.floor((v / lab + 1) * 6), 0, 11);
        if (pix) { const o = (iy * 12 + ix) * 4; col = [pix[o], pix[o + 1], pix[o + 2]]; }
        else col = (ix + iy) % 2 ? [90, 96, 110] : [70, 76, 90];
        if (r > lab - 1) col = col.map((v) => v * 0.6);
      } else {
        // grooves, with a light sheen that stays put while the record turns
        const a = Math.atan2(y, x), groove = Math.floor(r) % 2;
        let l = groove ? 26 : 18;
        const sheen = Math.max(0, Math.cos((a - 0.8) * 2)) ** 6;
        l += sheen * (r > lab + 1 && r < R0 - 1.5 ? 70 : 20);
        const ang = a - sp, streak = Math.abs(Math.sin(ang * 3 + r * 0.4)) > 0.985 ? 14 : 0;
        l += streak;
        col = [l, l, l + 6];
        if (r > R0 - 1.3) col = [48, 48, 58];                  // the rim
      }
      const o = (py * DISC + px) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.ctx.putImageData(id, 0, 0);
  }

  drawCrate(ctx) {
    const [x, y, w, h] = this.crateRect();
    ctx.fillStyle = '#0e5a78'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#e8f8fb'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#9ee0ee'; ctx.fillRect(x, y, w, 11);
    drawText(ctx, 'records', x + 4, y + 2, { color: '#0e5a78' });
    drawText(ctx, `bottles ${this.found.length}/${TRACKS.length}`, x + w - 4, y + 2, { align: 'right', color: '#1e6a84' });
    TRACKS.forEach((tr, i) => {
      const [rx, ry, rw, rh] = this.rowRect(i), have = this.unlocked.includes(tr.id), on = this.playing === tr.id;
      ctx.fillStyle = on ? '#ffd8c8' : '#ffffff'; ctx.fillRect(rx, ry, rw, rh);
      const cv = this.covers[tr.id];
      if (have && cv) { ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, rx + 1, ry + 1, 16, 16); }
      else { ctx.fillStyle = '#bcd8e0'; ctx.fillRect(rx + 1, ry + 1, 16, 16); drawBottleIcon(ctx, rx + 9, ry + 9, 0); }
      if (have) {
        drawText(ctx, fitW(tr.title, rw - 34), rx + 21, ry + 1, { color: '#1a2a4a' });
        drawText(ctx, fitW(tr.artist, rw - 34), rx + 21, ry + 9, { color: '#5a7a8a' });
        drawText(ctx, on ? '■' : '▶', rx + rw - 5, ry + 5, { align: 'right', color: on ? '#e0503a' : '#2aa8c8' });
      } else drawText(ctx, 'find a bottle...', rx + 21, ry + 5, { color: '#4a7080' });
    });
  }

  drawBottle(ctx) {
    const b = this.bottle();
    if (!b) return;
    // a soft glow so you notice it
    ctx.globalAlpha = 0.25 + Math.sin(this.t * 3) * 0.1;
    ctx.fillStyle = '#bff4ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    drawBottleIcon(ctx, b.x, b.y, Math.sin(this.t * 1.7) * 0.35);
    if (Math.sin(this.t * 2.3) > 0.6) { ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x + 4, b.y - 7, 1, 3); ctx.fillRect(b.x + 3, b.y - 6, 3, 1); }
  }
}

function fitW(s, w) { if (textWidth(s) <= w) return s; while (s.length > 1 && textWidth(s + '..') > w) s = s.slice(0, -1); return s + '..'; }

// a glass bottle with a cork and a rolled-up note inside
function drawBottleIcon(ctx, x, y, rot) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot);
  ctx.fillStyle = '#0e3a44'; ctx.fillRect(-3, -4, 7, 10); ctx.fillRect(-1, -7, 3, 4);
  ctx.fillStyle = '#6ad0c0'; ctx.fillRect(-2, -3, 5, 8); ctx.fillRect(0, -6, 1, 3);
  ctx.fillStyle = '#b8f4e8'; ctx.fillRect(-2, -3, 1, 6);
  ctx.fillStyle = '#fff4d8'; ctx.fillRect(0, -2, 2, 5);
  ctx.fillStyle = '#e8c890'; ctx.fillRect(0, 0, 2, 1);
  ctx.fillStyle = '#a86a3e'; ctx.fillRect(-1, -8, 3, 2);
  ctx.restore();
}

function drawBubble(ctx, x, y, r, a) {
  ctx.globalAlpha = clamp(a, 0, 1) * 0.85;
  ctx.strokeStyle = '#d8f8ff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r + 0.5, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - Math.max(0, r - 1), Math.round(y) - Math.max(0, r - 1), 1, 1);
  ctx.globalAlpha = 1;
}
