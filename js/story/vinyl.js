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

export class Vinyl {
  constructor(story) {
    this.story = story;
    this.unlocked = [];
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
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      this.unlocked = (d.unlocked || []).filter((id) => TRACKS.some((q) => q.id === id));
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
  visible() { const s = this.story; return s.photoReady && !s.quest && !(s.photo && s.photo.album); }
  rect() { return [6, this.story.replay ? 22 : 6, 50, 34]; }
  crateRect() { const [x, y, , h] = this.rect(); return [x, y + h + 3, Math.min(150, this.W - 12), 14 + TRACKS.length * 20 + 12]; }
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
  update(dt) {
    this.t += dt;
    const on = !!this.playing;
    this.speed += ((on ? 1 : 0) - this.speed) * Math.min(1, dt * (on ? 3 : 1.5));
    this.spin += this.speed * dt * 3.5;
    this.arm += ((on ? 1 : 0) - this.arm) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    if (on && this.visible()) {
      const [x, y] = this.rect();
      if (R() < dt * 6) this.parts.push({ x: x + 16 + (R() - 0.5) * 16, y: y + 18, vx: (R() - 0.5) * 6, vy: -10 - R() * 10, age: 0, life: 2 + R(), kind: R() < 0.3 ? 'note' : 'bubble', r: 1 + (R() * 2 | 0), ph: R() * TAU });
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
    // the box: a little wooden deck with a teal trim
    if (this.flash > 0) { ctx.globalAlpha = this.flash * 0.6; ctx.fillStyle = '#fff4b0'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#1a0e08'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#8a5230'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#a86a3e'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#6a3a1e'; for (let i = 3; i < w; i += 7) ctx.fillRect(x + i, y + 4, 4, 1);
    ctx.fillStyle = '#2aa8c8'; ctx.fillRect(x, y + h - 3, w, 3);
    // platter and record
    const cx = x + 17, cy = y + 17, r = 14;
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0e0e12'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#26262e'; ctx.lineWidth = 1;
    for (const rr of [11, 9, 7.5]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
    // a shine that turns with the record
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, 10, this.spin, this.spin + 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 10, this.spin + Math.PI, this.spin + Math.PI + 0.7); ctx.stroke();
    // label: the cover art, spinning
    const tr = TRACKS.find((q) => q.id === this.playing) || TRACKS.find((q) => this.unlocked.includes(q.id));
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, TAU); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(this.spin);
    const cv = tr && this.covers[tr.id];
    if (cv) { ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, -6, -6, 12, 12); ctx.imageSmoothingEnabled = false; }
    else { ctx.fillStyle = tr ? tr.label : '#444'; ctx.fillRect(-6, -6, 12, 12); }
    ctx.restore();
    ctx.fillStyle = '#e8e8f0'; ctx.fillRect(cx, cy, 1, 1);
    // tone arm: rests off to the side, swings onto the record when playing
    const px = x + w - 9, py = y + 6, ang = lerp(1.95, 2.45, this.arm), len = 17;
    const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
    ctx.fillStyle = '#c8c8d0'; ctx.fillRect(px - 2, py - 2, 5, 5);
    ctx.strokeStyle = '#e0e0e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#f0f0f8'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
    // light and knob
    ctx.fillStyle = this.playing ? (Math.sin(t * 6) > 0 ? '#6aff8a' : '#3ac85a') : '#3a4a3a'; ctx.fillRect(x + w - 7, y + h - 9, 3, 3);
    ctx.fillStyle = '#d8b070'; ctx.fillRect(x + w - 13, y + h - 10, 4, 4);
    // what's on, or how many records are unlocked
    const cap = this.playing ? `♪ ${tr.title}` : this.unlocked.length ? 'tap to play' : `records ${this.unlocked.length}/${TRACKS.length}`;
    drawText(ctx, cap, x, y + h + 3, { color: '#fff4dc', outline: '#1a1030', alpha: this.open ? 0 : 0.85 });
    if (this.open) this.drawCrate(ctx);
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
      if (have && cv) { ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, rx + 1, ry + 1, 16, 16); ctx.imageSmoothingEnabled = false; }
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
