// Photo mode: a little vintage camera. Aim at the tank and tap to snap; the
// shot prints out of the camera, develops, and is scored by what's in it.
// Every species you catch goes into a postcard album, rare ones are worth
// more, and points buy things in the camera workshop: other camera models,
// paint, stickers (even ones made from your photos), a charm for the strap,
// markers to doodle on it, and lens, film and roll upgrades. Progress is
// kept in this browser.
import { TAU, clamp, lerp, ease, R } from '../util.js';
import { makeCanvas } from '../util.js';
import { drawText, textWidth, wrap, LINE_H } from '../font.js';
import { burstStars } from '../world/fx.js';
import { Gallery } from './gallery.js';
import { Book } from './book.js';
import { FACTS, PIECES, SETS, setOf, jigsaw, keychainIcon, drawBanner, done as puzzleDone, setDone, clampPieces } from './encyclopedia.js';
import {
  CAM_W, CAM_H, MODELS, PAINTS, PAINT_PRICE, STICKERS, CHARMS, PENS, MARKER_PRICE,
  defaultCam, renderCamera, drawCharm, drawStickerIcon, drawCharmIcon, setPrizeArt,
} from './camera.js';

setPrizeArt({ keychain: keychainIcon, banner: drawBanner });

const SUBTABS = ['model', 'paint', 'sticker', 'charm', 'banner', 'draw', 'upgrade'];
const TABS = ['gallery', 'notebook', 'camera'];

// key -> [name, rarity 1..4]
export const SPECIES = {
  jelly: ['Moon Jelly', 1], clown: ['Clownfish', 1], tang: ['Blue Tang', 1], butterfly: ['Butterfly', 1],
  snapper: ['Snapper', 1], minnow: ['Minnow', 1], trevally: ['Trevally', 1], crab: ['Crab', 1], me: ['Just Me', 1],
  puffer: ['Pufferfish', 2], nettle: ['Sea Nettle', 2], batfish: ['Batfish', 2], giant: ['Giant GT', 2], grouper: ['Grouper', 2],
  comb: ['Comb Jelly', 2], crystal: ['Crystal Jelly', 2], manowar: ['Man o\' War', 3], octopus: ['Octopus', 3],
  bigjelly: ['Giant Jelly', 3], shark: ['Sand Tiger', 3], reefshark: ['Reef Shark', 3], ray: ['Stingray', 3], turtle: ['Sea Turtle', 3],
  whaleshark: ['Whale Shark', 4], bean: ['Mameshiba', 4], dolphin: ['Dolphin', 4], seahorse: ['Seahorse', 3], treefriend: ['Tree Friend', 4], us: ['Us Two', 4],
};
const ORDER = Object.keys(SPECIES).sort((a, b) => SPECIES[a][1] - SPECIES[b][1]);
const RARITY_PTS = [0, 3, 8, 20, 50];
const RARITY_COL = ['#888', '#a8d8ff', '#8affc0', '#ffb04a', '#ff6ad0'];
const RARITY_NAME = ['', 'common', 'uncommon', 'rare', 'legendary'];

export const UPGRADES = {
  lens: { name: 'Lens', costs: [40, 110, 240], info: ['a wider frame'] },
  film: { name: 'Film', costs: [50, 130, 280], info: ['richer colour, more points'] },
  roll: { name: 'Roll', costs: [30, 80, 180], info: ['more shots, faster reload'] },
  dev: { name: 'Developer', costs: [45, 120, 260], info: ['prints develop faster'] },
};
// how long a print takes to develop, per Developer level
const DEV_TIME = [8, 6, 4.5, 3];
const FRAME_W = [0.26, 0.33, 0.41, 0.5]; // share of the screen width
const LENSES = ['small', 'medium', 'wide', 'ultra'];
const FILMS = ['sepia', 'faded', 'warm', 'vivid'];
const FILM_MULT = [1, 1.15, 1.3, 1.5];
const ROLL_CAP = [6, 9, 12, 16];
const RELOAD = [4, 3, 2.2, 1.5];
const SAVE_KEY = 'vcag-photo-1';
// album milestones: [species found, bonus]
const MILESTONES = [[3, 15], [6, 30], [10, 60], [15, 100], [ORDER.length, 250]];

const keyOf = (c) => {
  if (c.kind === 'jelly') return c.hue === 'nettle' ? 'nettle' : c.hue === 'manowar' ? 'manowar' : c.hue === 'crystal' ? 'crystal' : c.len >= 40 ? 'bigjelly' : 'jelly';
  return SPECIES[c.kind] ? c.kind : null;
};

// A tiny chibi Mameshiba with its dive goggles pushed up, 12x11 pixels. Two eyes states
// (open, blink) and two feet frames for paddling.
const CHIBI = [
  '..kk....kk..',
  '.kGgkkkkgGk.',
  'kgbbbggbbbgk',
  'kgbwbkkbwbgk',
  'kgkkkggkkkgk',
  'kggeggggeggk',
  'kggeggggeggk',
  'kgpggkkggpgk',
  'kglggggggggk',
  '.kgggggggGk.',
  '..kGk..kGk..',
];
const CHIBI_COL = { k: '#1c3014', g: '#8fd44e', G: '#5e9a2c', l: '#c8f28a', b: '#5ac8f8', w: '#ffffff', e: '#0e1420', p: '#ff8aa8' };
const chibiCache = {};
function chibiBean(blink, feet) {
  const id = blink * 2 + feet;
  if (chibiCache[id]) return chibiCache[id];
  const rows = CHIBI.slice();
  if (blink) { rows[5] = 'kggggggggggk'; rows[6] = 'kgkkggggkkgk'; }
  if (feet) rows[10] = '...kGk.kGk..';
  const c = makeCanvas(12, 11);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (CHIBI_COL[ch]) { c.ctx.fillStyle = CHIBI_COL[ch]; c.ctx.fillRect(x, y, 1, 1); } }));
  return (chibiCache[id] = c);
}

export class PhotoMode {
  constructor(story) {
    this.story = story;
    this.on = false;
    this.album = null;       // { tab, page, card } when open
    this.aim = null;
    this.points = 0;
    this.shown = 0;          // points as displayed, counting up
    this.levels = { lens: 0, film: 0, roll: 0, dev: 0 };
    this.book = {};          // key -> { n, score, img (canvas) }
    this.shots = 0;
    this.claimed = [];       // milestones already paid out
    this.toast = null;
    this.cam = defaultCam();
    this.load();
    this.camDirty = true;
    this.charmA = 0.3; this.charmV = 0;
    this.downloads(); // find out early whether this view can save files
    this.film = ROLL_CAP[this.levels.roll];
    this.reload = 0;
    this.prints = [];        // queued prints; the first one animates
    this.flash = 0;
    this.snapT = 9;          // time since the shutter fired
    this.raiseT = 9;         // time since the camera came up
    this.lock = null;        // the best subject in the frame right now
    this.shake = 0;
    this.albumBounce = 0;
    this.t = 0;
    this.gallery = new Gallery(this);   // every photo, a box and a board
    this.notebook = new Book(this);     // the encyclopedia, as a book
  }

  speciesName(key) { return SPECIES[key] ? SPECIES[key][0] : key; }
  rarity(key) { return SPECIES[key] ? SPECIES[key][1] : 1; }
  speciesCount() { return ORDER.length; }

  // Save or share a picture: the share sheet where there is one, the
  // viewer's downloads, or an ordinary download.
  async saveBlob(blob, filename, label = 'saved') {
    try {
      const file = typeof File !== 'undefined' ? new File([blob], filename, { type: blob.type }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const dl = await this.downloads();
    if (dl) {
      try { await dl.save({ filename, data: blob }); this.say(label); } catch (err) { if (!err || err.code !== 'declined') this.say('saving isn\'t available here'); }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.say(label);
  }

  // ------------------------------------------------------------ storage --
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) return;
      this.points = d.points | 0; this.shown = this.points; this.shots = d.shots | 0;
      Object.assign(this.levels, d.levels || {});
      if (d.cam) this.cam = Object.assign(defaultCam(), d.cam);
      if (Array.isArray(d.claimed)) this.claimed = d.claimed;
      for (const [k, v] of Object.entries(d.book || {})) {
        if (!SPECIES[k]) continue;
        const e = { n: v.n | 0, score: v.score | 0, img: null, pieces: clampPieces(v.pieces), placed: v.placed | 0 };
        if (v.img) { const im = new Image(); im.onload = () => { e.img = toCanvas(im); this.camDirty = true; }; im.src = v.img; }
        this.book[k] = e;
      }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  save() {
    try {
      const book = {};
      for (const [k, v] of Object.entries(this.book)) book[k] = { n: v.n, score: v.score, pieces: v.pieces | 0, placed: v.placed | 0, img: v.img ? v.img.toDataURL() : v.url || null };
      localStorage.setItem(SAVE_KEY, JSON.stringify({ points: this.points, shots: this.shots, levels: this.levels, cam: this.cam, claimed: this.claimed, book }));
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------- layout --
  get W() { return this.story.W; }
  get H() { return this.story.H; }
  // the HUD shows your own camera, full size on big screens
  iconScale() { return this.W >= 560 ? 1 : 0.5; }
  camRect() { const k = this.iconScale(), w = CAM_W * k, h = CAM_H * k; return [this.W - w - 12, this.H - h - 4, w, h]; }
  coinRect() { const [bx, by] = this.bookRect(), w = textWidth('✦' + Math.round(this.shown)); return [bx - 3 - w, by + 3, w, 9]; }
  bookRect() { const [cx] = this.camRect(); return [cx - 19, this.H - 17, 15, 14]; }
  model() { return MODELS[this.cam.model] || MODELS.instant; }
  camImage() {
    if (this.camDirty || !this.camImg) {
      this.camImg = renderCamera(this.cam, this.book);
      const half = makeCanvas(CAM_W / 2, CAM_H / 2);
      half.ctx.imageSmoothingEnabled = true;
      half.ctx.drawImage(this.camImg, 0, 0, CAM_W / 2, CAM_H / 2);
      this.camHalf = half;
      this.camDirty = false;
    }
    return this.camImg;
  }
  frameSize() {
    const w = Math.round(Math.min(Math.max(56, this.W * (FRAME_W[this.levels.lens] + this.model().frame)), this.W - 8));
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
    return s.hud && s.photoReady && !s.title && !s.letter && !s.question && !s.buttons.length;
  }

  wantsPointer([x, y]) {
    if (!this.available()) return false;
    return !!this.album || this.on || this.hit(this.camRect(), x, y) || this.hit(this.bookRect(), x, y);
  }

  // -------------------------------------------------------------- input --
  pointer(type, x, y) {
    // tap the print: help it develop (a shake), or send it off once done
    const pr = this.prints[0];
    if (type === 'down' && pr && !this.album && this.printRect && this.hit(this.printRect, x, y) && pr.t > 1) {
      if (pr.t < pr.rt) { pr.t = Math.min(pr.rt, pr.t + 0.6); pr.jolt = 1; this.story.sound.sfx('pop'); }
      else if (pr.t >= pr.rt + 0.6 && pr.t < pr.hold) pr.t = pr.hold;
      return true;
    }
    if (!this.available()) return false;
    if (type === 'move') {
      if (this.album && this.album.drawing) this.doodle(x, y);
      else if (this.album && !this.album.card && this.album.tab === 'gallery') this.gallery.move(x, y);
      else if (this.album && !this.album.card && this.album.tab === 'notebook') this.notebook.move(x, y);
      else if (this.on) this.aim = [x, y];
      return !!this.album;
    }
    if (type === 'up') {
      if (this.album && this.album.drawing) { this.album.drawing = false; this.album.last = null; this.saveArt(); }
      else if (this.album && this.album.tab === 'gallery') this.gallery.up(x, y);
      else if (this.album && this.album.tab === 'notebook') this.notebook.up(x, y);
      return !!this.album;
    }
    if (type !== 'down') return false;
    if (this.album) { this.albumTap(x, y); return true; }
    if (this.hit(this.camRect(), x, y)) {
      this.on = !this.on;
      if (this.on) this.raiseT = 0;
      this.charmV += 3;
      this.aim = [this.W / 2, this.H * 0.45];
      this.story.sound.sfx(this.on ? 'ding' : 'pop');
      return true;
    }
    if (this.hit(this.bookRect(), x, y)) {
      this.album = { tab: this.lastTab || 'gallery', page: 0, card: null, sub: 'model', sel: null, pen: 3, drawing: false };
      this.on = false;
      this.story.sound.sfx('pop');
      return true;
    }
    if (this.on) { this.aim = [x, y]; this.snap(); return true; }
    return false;
  }

  // --------------------------------------------------------------- snap --
  developing() { return this.prints.some((q) => q.t < q.rt); }
  snap() {
    const s = this.story;
    // one print at a time: the bean is still busy with the last one
    if (this.developing()) { this.shake = 0.4; this.busyT = 1; s.sound.sfx('escape'); return; }
    if (this.film <= 0) { this.shake = 0.4; s.sound.sfx('escape'); return; }
    this.film--;
    this.shots++;
    const [fx, fy, fw, fh] = this.frameRect();
    s.sound.sfx('shutter');
    this.flash = 1;
    this.flashT = 0;
    this.snapT = 0;
    // she strikes a little pose for it
    { const cp = s.aq && s.aq.couple; if (cp) { cp.snapPose = (cp.snapPose || 0) + 1 + ((R() * 2) | 0); cp.snapK = 1.8; } }
    this.charmV += 5;
    // a cute "click!" and a pop of stars at the frame's corner, and a wink of
    // flash from her camera in the scene
    const cx0 = fx + fw, cy0 = fy;
    burstStars(s.fx, cx0 - 4, cy0 + 4, 8, { speed: 60, size: 4, col: '#fff6c0' });
    if (s.headAt) { const [hx, hy] = s.headAt('girl')(); for (let i = 0; i < 10; i++) { const a = R() * TAU, sp = 20 + R() * 30; s.fx.add({ kind: 'spark', x: hx, y: hy + 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, age: 0, life: 0.4 + R() * 0.3, size: 1 + (R() * 2 | 0), col: '#ffffff' }); } }
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
    for (const cb of st.combs || []) { const [sx, sy] = st.toScreen(cb.x, cb.y, cb.z); see('comb', sx, sy); }
    const cp = s.aq.couple, gh = cp.gap / 2;
    // you're her: on her own she's "just me", together they're "us"
    const [ux, uy] = st.toScreen(st.coupleX + (cp.apart ? gh + cp.girlDX : 0), st.coupleY - 40, 0);
    const together = !cp.apart && cp.girlOn !== false && s.songT > 33;
    see(together ? 'us' : 'me', ux, uy);
    // a selfie! she holds the camera out at arm's length, with hearts
    if (found.has('me') || found.has('us')) {
      cp.selfieK = 2.2;
      if (s.anime && s.headAt) s.anime.emote(s.headAt('girl'), '♥', 1.3, '#ff5a8a');
      for (let i = 0; i < 8; i++) { const a = R() * TAU; s.fx.add({ kind: 'spark', x: ux + Math.cos(a) * 14, y: uy - 16 + Math.sin(a) * 10, vx: Math.cos(a) * 20, vy: -20 - R() * 15, drag: 2, age: 0, life: 0.8 + R() * 0.4, size: 1 + (R() * 2 | 0), col: R() < 0.5 ? '#ff8ab4' : '#fff4b0' }); }
    }
    // score it
    const list = [...found.values()].sort((a, b) => SPECIES[b.key][1] - SPECIES[a.key][1] || a.d - b.d);
    const mult = FILM_MULT[this.levels.film] * this.model().mult;
    let pts = 0, fresh = [];
    for (const f of list) {
      const r = SPECIES[f.key][1];
      let p = RARITY_PTS[r] + Math.min(f.n - 1, 4);
      if (!this.book[f.key]) { p *= 2; fresh.push(f.key); }
      pts += p;
    }
    // the main subject is whatever the finder is locked onto
    const lk = this.findSubject();
    const main = (lk && found.get(lk.key)) || list[0] || null;
    if (main && main.d < 0.22) pts *= 1.25; // nicely centred
    pts = Math.max(1, Math.round(pts * mult));
    // develop the picture
    const img = this.develop(fx, fy, fw, fh);
    for (const f of list) {
      const e = this.book[f.key] || (this.book[f.key] = { n: 0, score: 0, img: null, pieces: 0 });
      e.n += f.n > 0 ? 1 : 0;
      if (f === main && pts >= e.score) { e.score = pts; e.img = img; }
      else if (!e.img) e.img = img;
    }
    this.checkMilestones();
    this.gallery.add(img, main ? main.key : null);
    // the encyclopedia: one jigsaw piece and one fun fact for the subject
    let fact = null;
    if (main) {
      const e = this.book[main.key];
      if (e.pieces < PIECES) {
        e.pieces++;
        fact = { key: main.key, text: FACTS[main.key][e.pieces - 1], n: e.pieces, prize: null };
        if (e.pieces === PIECES) fact.prize = this.award(main.key);
      }
    }
    this.camDirty = true; // photo stickers may show the new shot
    // the print develops (slowly, unless the Developer is upgraded) while the
    // bean wipes it and shakes it, then shows what you got
    const devT = DEV_TIME[this.levels.dev | 0] || 8, rt = 1.6 + devT;
    this.prints.push({ img, pts, main: main ? main.key : null, fresh, t: 0, fact, devT, rt, hold: rt + 0.6 + (fact ? 4.2 : 2.2) });
    if (this.onSnap) this.onSnap({ keys: list.map((f) => f.key), main: main ? main.key : null, pts });
    if (this.prints.length === 1) s.sound.sfx('print');
    this.save();
  }

  // A finished jigsaw: the animal's keychain, and the tank's banner if that
  // was the last one of its set.
  award(key) {
    const C = this.cam, out = { keychain: 'k:' + key, banner: null };
    if (!C.charms.includes(out.keychain)) C.charms.push(out.keychain);
    const S = setOf(key);
    if (S && setDone(this.book, S) && !C.banners.includes(S.id)) { C.banners.push(S.id); out.banner = S; }
    // the whole notebook: the golden Always banner and a pearl keychain
    const all = SETS.find((q) => q.id === 'always');
    if (all && setDone(this.book, all) && !C.banners.includes('always')) {
      C.banners.push('always');
      if (!C.charms.includes('pearl')) C.charms.push('pearl');
      out.banner = all; out.pearl = true;
      this.say('notebook complete! ✦ pearl + Always banner');
    }
    return out;
  }

  found() { return ORDER.filter((k) => this.book[k]).length; }
  foundKeys() { return ORDER.filter((k) => this.book[k]); }
  nextMilestone() { return MILESTONES.find(([n]) => !this.claimed.includes(n)) || null; }
  checkMilestones() {
    const n = this.found();
    for (const [need, bonus] of MILESTONES) {
      if (n < need || this.claimed.includes(need)) continue;
      this.claimed.push(need);
      this.points += bonus;
      this.say(`album ${need}/${ORDER.length}! +${bonus} ✦`);
      this.story.sound.sfx('sparkle');
    }
  }
  say(text) { this.toast = { text, t: 0 }; }

  // Copy the frame out of the world and age it with the current film.
  develop(fx, fy, fw, fh) {
    const src = this.story.worldCanvas;
    const c = makeCanvas(fw, fh);
    const x = c.ctx;
    if (src) x.drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
    const id = x.getImageData(0, 0, fw, fh), d = id.data;
    const film = FILMS[this.levels.film], M = this.model();
    const leak = M.leak || R() < 0.5 ? [R() < 0.5 ? 0 : fw, R() < 0.5 ? 0 : fh] : null;
    const vig = M.dream ? 2.6 : 1.5, grain = M.clean ? 8 : 22;
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
      const v = Math.max(0, 1 - (vx * vx + vy * vy) * vig);
      r *= v; g *= v; b *= v;
      if (leak) { const k = Math.max(0, 1 - Math.hypot(xx - leak[0], y - leak[1]) / (fw * 0.55)); r += 120 * k * k; g += 50 * k * k; }
      const n = (R() - 0.5) * grain;
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
    if (this.flashT != null) this.flashT += dt;
    this.snapT += dt; this.raiseT += dt;
    this.lock = this.on && !this.album ? this.findSubject() : null;
    this.shake = Math.max(0, this.shake - dt);
    this.albumBounce = Math.max(0, this.albumBounce - dt * 2.5);
    if (this.toast && (this.toast.t += dt) > 2.8) this.toast = null;
    // the charm swings on its chain and settles
    this.charmV += (-this.charmA * 22 - this.charmV * 2.2 + Math.sin(this.t * 1.7) * 0.8) * dt;
    this.charmA += this.charmV * dt;
    this.shown += (this.points - this.shown) * Math.min(1, dt * 6);
    if (Math.abs(this.points - this.shown) < 0.5) this.shown = this.points;
    this.busyT = Math.max(0, (this.busyT || 0) - dt * 2);
    const p = this.prints[0];
    if (p) {
      p.t += dt;
      if (p.t > 1.6 && p.t < p.rt && Math.floor((p.t - 1.6) / 0.5) !== Math.floor((p.t - 1.6 - dt) / 0.5) && ((p.t - 1.6) % 3.4) > 2.2) this.story.sound.sfx('type'); // shake shake
      if (!p.doneSfx && p.t >= p.rt) { p.doneSfx = true; this.story.sound.sfx('chime'); }
      p.jolt = Math.max(0, (p.jolt || 0) - dt * 3);
      if (p.fact && !p.factSfx && p.t > p.rt + 0.9) { p.factSfx = true; this.story.sound.sfx(p.fact.prize ? 'yes' : 'sparkle'); if (p.fact.prize) this.camDirty = true; }
      if (p.t >= p.hold + 0.6) {
        this.prints.shift();
        this.points += p.pts;
        this.albumBounce = 1;
        this.story.sound.sfx('coin');
        this.save();
        if (this.prints.length) this.story.sound.sfx('print');
      }
    }
  }

  // The rarest creature in the frame, nearest the middle: the finder locks
  // onto it with a little focus box and its name.
  findSubject() {
    const st = this.story.stage;
    const [fx, fy, fw, fh] = this.frameRect();
    let best = null;
    for (const c of st.creatures) {
      const key = keyOf(c);
      if (!key) continue;
      const [sx, sy] = st.toScreen(c.x, c.y - (c.hitDY ?? 0), c.z);
      if (sx < fx + 4 || sx > fx + fw - 4 || sy < fy + 4 || sy > fy + fh - 4) continue;
      const d = Math.hypot((sx - fx - fw / 2) / fw, (sy - fy - fh / 2) / fh);
      const score = SPECIES[key][1] * 2 - d * 3;
      if (!best || score > best.score) best = { key, sx, sy, r: Math.max(6, Math.min(22, (c.len || c.size || 16) * 0.45 * (1 - (c.z || 0) * 0.4))), score, d };
    }
    for (const cb of st.combs || []) {
      const [sx, sy] = st.toScreen(cb.x, cb.y, cb.z);
      if (sx < fx + 4 || sx > fx + fw - 4 || sy < fy + 4 || sy > fy + fh - 4) continue;
      const d = Math.hypot((sx - fx - fw / 2) / fw, (sy - fy - fh / 2) / fh), score = SPECIES.comb[1] * 2 - d * 3;
      if (!best || score > best.score) best = { key: 'comb', sx, sy, r: 6, score, d };
    }
    if (best && this.lock && this.lock.key === best.key) best.t = this.lock.t + this.story.dt; else if (best) best.t = 0;
    return best;
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
    if (this.flashT != null && this.flashT < 0.55) this.drawFlash(ctx);
    if (this.available()) this.drawHud(ctx);
    if (this.prints.length) this.drawPrint(ctx, this.prints[0]);
    if (this.album) this.drawAlbum(ctx);
    if (this.toast) this.drawToast(ctx);
  }

  drawToast(ctx) {
    const T = this.toast, k = Math.min(1, T.t * 5, (2.8 - T.t) * 3);
    const w = textWidth(T.text) + 14, x = Math.round(this.W / 2 - w / 2), y = Math.round(this.H - 34 + (1 - k) * 8);
    ctx.globalAlpha = Math.max(0, k);
    ctx.fillStyle = '#10142a'; ctx.fillRect(x - 1, y - 1, w + 2, 13);
    ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = '#ffb4cc'; ctx.fillRect(x, y, w, 1);
    drawText(ctx, T.text, this.W / 2, y + 2, { align: 'center', color: '#ffffff' });
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const [cx, cy, cw, ch] = this.camRect(), [bx, by] = this.bookRect();
    const img = this.camImage(), k = this.iconScale();
    const lift = (this.on ? -2 : 0) + (this.snapT < 0.25 ? Math.round(Math.sin((this.snapT / 0.25) * Math.PI) * 3) : 0);
    if (this.on) { ctx.fillStyle = '#ffe38a'; ctx.globalAlpha = 0.5 + Math.sin(this.t * 6) * 0.2; ctx.fillRect(cx - 2, cy - 2 + lift, cw + 4, ch + 4); ctx.globalAlpha = 1; }
    ctx.drawImage(k === 1 ? img : this.camHalf, cx, cy + lift);
    drawCharm(ctx, this.cam.charm, cx + img.lug[0] * k, cy + lift + img.lug[1] * k, this.charmA, 1);
    // the flash lamp fires
    if (this.snapT < 0.3) {
      const f = 1 - this.snapT / 0.3, fxl = cx + cw * 0.78, fyl = cy + lift + ch * 0.22;
      ctx.globalAlpha = f; ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(fxl - 1), Math.round(fyl - 6 * f), 2, Math.round(12 * f)); ctx.fillRect(Math.round(fxl - 6 * f), Math.round(fyl - 1), Math.round(12 * f), 2);
      ctx.globalAlpha = 1;
    }
    drawBook(ctx, bx, by - Math.round(Math.sin(this.albumBounce * Math.PI) * 3));
    const pts = '✦' + Math.round(this.shown);
    drawText(ctx, pts, bx - 3, by + 4, { align: 'right', color: '#ffe38a', outline: '#3a2200' });
    if (this.on) {
      // film left, as a row of little cartridges
      const cap = ROLL_CAP[this.levels.roll];
      const txt = `${this.film}/${cap}`;
      const sx = Math.round((R() - 0.5) * 3 * this.shake * 3);
      drawText(ctx, txt, cx + cw / 2 + sx, cy - 10, { align: 'center', color: this.film ? '#ffffff' : '#ff6a6a', outline: '#1a1020' });
    }
  }

  drawViewfinder(ctx) {
    const W = this.W, H = this.H;
    const [fx, fy, fw, fh] = this.frameRect();
    // the finder pops up with a little bounce, and punches in on each shot
    const up = ease.outBack(clamp(this.raiseT / 0.3));
    const punch = this.snapT < 0.25 ? Math.sin((this.snapT / 0.25) * Math.PI) * 3 : 0;
    const grow = Math.round((1 - up) * 14 - punch);
    const x0 = fx - grow, y0 = fy - grow, x1 = fx + fw + grow, y1 = fy + fh + grow;
    // warm dim outside the frame, like looking through an old finder
    ctx.fillStyle = `rgba(20,10,2,${0.66 * clamp(this.raiseT / 0.2)})`;
    ctx.fillRect(0, 0, W, fy); ctx.fillRect(0, fy + fh, W, H - fy - fh);
    ctx.fillRect(0, fy, fx, fh); ctx.fillRect(fx + fw, fy, W - fx - fw, fh);
    // the shutter: two blades snap shut and open again
    if (this.snapT < 0.22) {
      const k = this.snapT < 0.07 ? this.snapT / 0.07 : 1 - (this.snapT - 0.07) / 0.15;
      const bh = Math.round((fh / 2) * clamp(k));
      ctx.fillStyle = '#0a0608';
      ctx.fillRect(fx, fy, fw, bh); ctx.fillRect(fx, fy + fh - bh, fw, bh);
      ctx.fillStyle = '#3a2a2a';
      if (bh > 1) { ctx.fillRect(fx, fy + bh - 1, fw, 1); ctx.fillRect(fx, fy + fh - bh, fw, 1); }
    }
    // rounded corner brackets that breathe
    const br = Math.round(Math.sin(this.t * 3) * 1);
    const L = 8;
    for (const [x, y, sx, sy] of [[x0 - br, y0 - br, 1, 1], [x1 - 1 + br, y0 - br, -1, 1], [x0 - br, y1 - 1 + br, 1, -1], [x1 - 1 + br, y1 - 1 + br, -1, -1]]) {
      for (const [ox, oy, col] of [[1, 1, '#2a1408'], [0, 0, '#fff4dc']]) {
        ctx.fillStyle = col;
        ctx.fillRect((sx > 0 ? x + 2 : x - L + 1) + ox, y + oy, L - 2, 2);
        ctx.fillRect(x + ox, (sy > 0 ? y + 2 : y - L + 1) + oy, 2, L - 2);
        ctx.fillRect(x + sx + ox, y + sy + oy, 2, 2);
      }
    }
    // centre reticle: a turning dotted ring with a tiny heart in it
    const cx = Math.round(fx + fw / 2), cy = Math.round(fy + fh / 2);
    ctx.fillStyle = '#fff4dc';
    for (let i = 0; i < 24; i += 2) { const a = (i / 24) * TAU + this.t * 0.4; ctx.fillRect(Math.round(cx + Math.cos(a) * 9), Math.round(cy + Math.sin(a) * 9), 1, 1); }
    ctx.fillStyle = '#ff8ab0';
    for (const [hx, hy] of [[-1, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) ctx.fillRect(cx + hx, cy + hy - 1, 1, 1);
    // focus lock on the best subject: a pink box that snaps in around it
    const L0 = this.lock;
    if (L0) {
      const k = ease.outBack(clamp(L0.t / 0.25));
      const r = Math.round(L0.r * (1.8 - 0.8 * k)), lx = Math.round(L0.sx), ly = Math.round(L0.sy);
      const good = L0.d < 0.22;
      const col = good ? '#8affc0' : '#ff8ab0';
      ctx.fillStyle = col;
      const c = Math.max(3, Math.round(r * 0.45));
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const X = lx + sx * r, Y = ly + sy * r;
        ctx.fillRect(sx < 0 ? X : X - c + 1, Y, c, 1);
        ctx.fillRect(X, sy < 0 ? Y : Y - c + 1, 1, c);
      }
      const [name, rar] = SPECIES[L0.key];
      const label = (this.book[L0.key] ? '' : 'new! ') + name;
      const ty = Math.max(fy + 12, ly - r - 10);
      if (L0.t > 0.12) {
        drawText(ctx, label, lx, ty, { align: 'center', color: '#ffffff', outline: '#2a1030' });
        drawText(ctx, '★'.repeat(rar), lx, ty + r * 2 + 12 > fy + fh - 4 ? ty - 8 : ly + r + 3, { align: 'center', color: RARITY_COL[rar], outline: '#10142a' });
      }
    }
    // a blinking red dot and the film type
    if (Math.sin(this.t * 5) > 0) { ctx.fillStyle = '#ff4a4a'; ctx.fillRect(fx + fw - 6, fy + 3, 3, 3); }
    drawText(ctx, fit(`${this.model().name} · ${FILMS[this.levels.film]}`, fw - 12), fx + 3, fy + 3, { color: '#fff4dc', outline: '#2a1a08' });
    if (!this.film) drawText(ctx, 'reloading...', cx, fy + fh - 11, { align: 'center', color: '#ffb0a0', outline: '#2a0a08' });
    else if (this.developing()) drawText(ctx, 'developing...', cx, fy + fh - 11, { align: 'center', color: (this.busyT || 0) > 0 && Math.sin(this.t * 30) > 0 ? '#ff8a8a' : '#fff4b0', outline: '#2a1a08' });
    // "click!"
    if (this.snapT < 0.7) {
      const k = this.snapT / 0.7, sc = W > 300 ? 2 : 1;
      drawText(ctx, 'click!', fx + fw - 4, Math.round(fy - 6 - k * 10), { align: 'right', scale: sc, color: '#fff6c0', outline: '#5a2a10', alpha: 1 - k * k });
    }
  }

  // The camera flash: a hard white pop over everything, then a starburst of
  // light rays and a ring from the lens that spread and fade.
  drawFlash(ctx) {
    const W = this.W, H = this.H, t = this.flashT;
    const [fx, fy, fw, fh] = this.frameRect(), ox = fx + fw / 2, oy = fy + fh / 2;
    if (t < 0.07) { ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; return; }
    const k = (t - 0.07) / 0.48, fade = 1 - k;
    // soft glow
    const r0 = Math.max(W, H) * (0.3 + k * 0.5);
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r0);
    g.addColorStop(0, `rgba(255,252,230,${0.55 * fade})`); g.addColorStop(1, 'rgba(255,252,230,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // rays
    ctx.fillStyle = '#fffbe0';
    ctx.globalAlpha = fade * 0.9;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.2, len = (i % 2 ? 0.5 : 1) * Math.min(W, H) * 0.45;
      const d0 = fw * 0.35 + k * len * 0.6, d1 = d0 + len * 0.35 * fade + 4;
      for (let d = d0; d < d1; d += 2) ctx.fillRect(Math.round(ox + Math.cos(a) * d), Math.round(oy + Math.sin(a) * d), i % 2 ? 1 : 2, i % 2 ? 1 : 2);
    }
    // ring
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = fade * 0.7;
    ctx.beginPath(); ctx.arc(ox, oy, fw * 0.3 + k * Math.max(W, H) * 0.5, 0, TAU); ctx.stroke();
    // sparkles
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, d = fw * 0.4 + k * (60 + i * 14), x = Math.round(ox + Math.cos(a) * d), y = Math.round(oy + Math.sin(a) * d * 0.7);
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
    }
    ctx.globalAlpha = 1;
  }

  // a print: slides out of the camera and sits on top of it while the bean
  // cleans and shakes it, then comes forward to show what you got and
  // flies into the album
  drawPrint(ctx, p) {
    const W = this.W, H = this.H;
    const img = p.img, pw = img.width + 6, ph = img.height + 16;
    const s = Math.max(1, Math.min(2, Math.floor(Math.min((W - 20) / pw, (H * 0.62) / ph))));
    const [cx, cy, cw] = this.camRect(), [bx, by] = this.bookRect();
    const t = p.t, show = p.rt + 0.6;
    const cs = Math.min(1, clamp(W * 0.16, 56, 100) / pw); // small, up in the corner
    let x, y, sc = cs, a = 1;
    const outX = Math.min(W - pw * cs - 8, cx + cw / 2 - (pw * cs) / 2), outY0 = cy + 6, outY1 = cy - ph * cs - 2;
    const midX = W / 2 - (pw * s) / 2, midY = H * 0.42 - (ph * s) / 2;
    if (t < 1) { x = outX; y = lerp(outY0, outY1, ease.outCubic(t)); }
    else if (t < p.rt) { x = outX; y = outY1 + Math.round(Math.sin((t - 1) * 2) * 1); }
    else if (t < show) { const k = ease.inOutCubic((t - p.rt) / 0.6); x = lerp(outX, midX, k); y = lerp(outY1, midY, k); sc = lerp(cs, s, k); }
    else if (t < p.hold) { x = midX; y = midY + Math.sin((t - show) * 2) * 1.5; sc = s; }
    else { const k = ease.inCubic((t - p.hold) / 0.6); x = lerp(midX, bx + 7, k); y = lerp(midY, by + 7, k); sc = lerp(s, 0.15, k); a = 1 - k * 0.3; }
    const developing = t >= 1.6 && t < p.rt, cyc = (t - 1.6) % 3.4, shaking = developing && cyc > 2.2;
    const dev = t < 1.6 ? 1 : Math.pow(clamp(1 - (t - 1.6) / p.devT), 1.4); // still developing
    // it swings as it comes out, jiggles while it's shaken, swoops forward and
    // spins into the album
    let rot = 0;
    if (t < 1) rot = Math.sin(t * 9) * 0.05 * (1 - t);
    else if (t < p.rt) rot = -0.04 + (shaking ? Math.sin(t * 38) * 0.08 : 0) + (p.jolt || 0) * Math.sin(t * 50) * 0.1;
    else if (t < show) rot = lerp(-0.04, 0.3, Math.sin(((t - p.rt) / 0.6) * Math.PI));
    else if (t < p.hold) rot = Math.sin((t - show) * 7) * 0.08 * Math.exp(-(t - show) * 2.2) - 0.02;
    else rot = ease.inCubic((t - p.hold) / 0.6) * -1.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(Math.round(x + (pw * sc) / 2), Math.round(y + (ph * sc) / 2));
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-pw / 2, -ph / 2);
    // the card
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(-1, 0, pw + 2, ph); ctx.fillRect(0, -1, pw, ph + 2);
    ctx.fillStyle = '#fbf6ea'; ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(img, 3, 3);
    if (dev > 0) { ctx.globalAlpha = a * dev; ctx.fillStyle = '#3a2a1e'; ctx.fillRect(3, 3, img.width, img.height); ctx.globalAlpha = a; }
    // a glint sweeps across once it's developed
    if (t > show && t < show + 0.6) {
      const gx = lerp(-12, img.width + 12, (t - show) / 0.6);
      ctx.save();
      ctx.beginPath(); ctx.rect(3, 3, img.width, img.height); ctx.clip();
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(3 + gx, 3); ctx.lineTo(3 + gx + 6, 3); ctx.lineTo(3 + gx - 6 + 6, 3 + img.height); ctx.lineTo(3 + gx - 6, 3 + img.height); ctx.fill();
      ctx.restore();
    }
    const name = p.main ? SPECIES[p.main][0] : 'just water';
    if (t > 1.2) drawText(ctx, fit(name, pw - 6), pw / 2, img.height + 6, { align: 'center', color: '#3a2a4a' });
    ctx.restore();
    ctx.globalAlpha = 1;
    this.printRect = t > 1 && t < p.rt ? [outX, outY1, pw * cs, ph * cs] : t >= show && t < p.hold ? [midX, midY, pw * s, ph * s] : null;
    if (t > 1 && t < show) this.drawDeveloping(ctx, p, outX, outY1, pw * cs, ph * cs);
    // results once it has developed
    if (t > show && t < p.hold + 0.2) {
      const k = clamp((t - show) / 0.25);
      const top = midY - 12;
      if (p.main) {
        const r = SPECIES[p.main][1];
        drawText(ctx, '★'.repeat(r) + ' ' + RARITY_NAME[r], W / 2, top, { align: 'center', color: RARITY_COL[r], outline: '#10142a', alpha: k });
      }
      drawText(ctx, `+${p.pts} ✦`, W / 2, midY + ph * s + 4 - Math.round(k * 3), { align: 'center', scale: W > 200 ? 2 : 1, color: '#ffe38a', outline: '#3a2200', shadow: '#ff9a3a', alpha: k });
      if (p.fact && t > show + 0.3) this.drawFact(ctx, p, Math.round(midY + ph * s + 22), clamp((t - show - 0.3) / 0.3) * clamp((p.hold + 0.2 - t) / 0.3));
      if (p.fresh.length) {
        // NEW! slams on like a stamp
        const sk = clamp((t - show) / 0.18), ss = 1 + (1 - ease.outBack(sk)) * 1.6;
        const nx = Math.round(midX + pw * s - 10), ny = Math.round(midY - 4 + Math.sin(t * 10));
        if (sk >= 1 && !p.stamped) { p.stamped = true; burstStars(this.story.fx, nx + 11, ny + 3, 8, { speed: 50, size: 4 }); this.story.sound.sfx('pop'); }
        ctx.save();
        ctx.translate(nx + 11, ny + 3); ctx.rotate(0.18 - (1 - sk) * 0.4); ctx.scale(ss, ss);
        ctx.fillStyle = '#ff3a6a'; ctx.fillRect(-13, -5, 26, 11);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-12, -4, 24, 9);
        ctx.fillStyle = '#ff3a6a'; ctx.fillRect(-11, -3, 22, 7);
        drawText(ctx, 'NEW!', 0, -3, { align: 'center', color: '#ffffff' });
        ctx.restore();
      }
    }
  }

  // While a print develops a tiny chibi bean looks after it, up in the
  // corner on top of the camera: it hops in, polishes the print with a cloth,
  // grabs the corner and shakes it, round and round until it's done, then
  // does a happy hop as the print flies off. A thin bar shows how far along
  // it is; tapping the print helps.
  drawDeveloping(ctx, p, x, y, w, h) {
    const t = p.t, dt = t - 1.6, cyc = ((dt % 3.4) + 3.4) % 3.4, done = t >= p.rt;
    const k = clamp(dt / p.devT), px = this.W >= 560 ? 3 : this.W >= 180 ? 2 : 1, bw = 12 * px, bh = 11 * px;
    const blink = t % 2.6 < 0.12, step = Math.floor(t * 8) % 2;
    let bx, by, face = 1, pose = 'idle', label = null, alpha = 1;
    if (done) {
      // yay! a hop with a heart, then it pops away
      const q = clamp((t - p.rt) / 0.6);
      bx = x - bw - 2; by = y + h - bh - Math.sin(q * Math.PI) * 10 * px;
      pose = 'yay'; label = 'yay!'; alpha = 1 - q * q;
    } else if (t < 1.6) {
      // hops in from the side
      const q = ease.outCubic(clamp((t - 1) / 0.6));
      bx = lerp(this.W + 4, x - bw - 2, q); by = y + h - bh - Math.abs(Math.sin(q * Math.PI * 2)) * 6 * px; face = -1;
    } else if (cyc < 2.2) {
      // wipe wipe: floats across the print, cloth first
      const sx = Math.sin(cyc * 4.5);
      face = Math.cos(cyc * 4.5) > 0 ? 1 : -1;
      bx = x + w / 2 - bw / 2 + sx * (w / 2 - bw / 2 + 2); by = y + h * 0.35 + Math.round(Math.cos(cyc * 9) * 2 * px);
      pose = 'wipe'; label = 'wipe wipe';
    } else {
      // shake shake: hanging on to the corner, jiggling with it
      const j = Math.sin(t * 38) * px;
      bx = x - bw + 3 * px + j; by = y - 3 * px - Math.abs(j);
      pose = 'shake'; label = 'shake shake';
      ctx.fillStyle = '#fff4dc';
      for (const sd of [-1, 1]) { const lx = sd < 0 ? x - 3 : x + w + 2; for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(lx + sd * (i % 2)), Math.round(y + h * 0.35 + i * 4), 1, 2); }
    }
    bx = Math.round(bx); by = Math.round(by + (pose === 'idle' || pose === 'shake' ? 0 : Math.round(Math.sin(t * 6)) * px));
    ctx.globalAlpha = alpha;
    const spr = chibiBean(blink ? 1 : 0, pose === 'wipe' || t < 1.6 ? step : 0);
    ctx.save();
    ctx.translate(bx + bw / 2, by);
    ctx.scale(face * px, px);
    ctx.drawImage(spr, -6, 0);
    // arms and props, in sprite pixels
    const P = (c, ax, ay, aw = 1, ah = 1) => { ctx.fillStyle = c; ctx.fillRect(ax, ay, aw, ah); };
    if (pose === 'wipe') {
      const up = Math.floor(t * 10) % 2;
      P('#1c3014', 6, 6 + up, 2, 1); P('#8fd44e', 6, 7 + up, 1, 1);
      P('#1c3014', 7, 4 + up, 5, 5); P('#eef8ff', 8, 5 + up, 3, 3); P('#9ad4f4', 9, 5 + up, 1, 3); // the cloth
      if (Math.floor(t * 6) % 3 === 0) { P('#ffffff', 12, 2, 1, 3); P('#ffffff', 11, 3, 3, 1); } // squeaky clean
    } else if (pose === 'shake') {
      P('#1c3014', 5, 3, 2, 1); P('#1c3014', 6, 2, 1, 1); P('#8fd44e', 5, 4, 1, 1); // both little arms up, holding on
      P('#1c3014', -7, 3, 2, 1); P('#8fd44e', -6, 4, 1, 1);
    } else if (pose === 'yay') {
      P('#1c3014', 6, 1, 1, 3); P('#1c3014', -7, 1, 1, 3); // arms up
      P('#ff5a8a', -1, -5, 1, 1); P('#ff5a8a', 1, -5, 1, 1); P('#ff5a8a', -2, -4, 5, 1); P('#ff5a8a', -1, -3, 3, 1); P('#ff5a8a', 0, -2, 1, 1); // heart
    }
    ctx.restore();
    if (label && this.W >= 240) drawText(ctx, label, bx + bw / 2, by - 10 - (pose === 'yay' ? 6 : 0), { align: 'center', color: '#fff4dc', outline: '#1a1020', alpha: alpha * 0.9 });
    ctx.globalAlpha = 1;
    if (!done && t >= 1.6) {
      // how far along, in a thin bar over the print
      const bx2 = Math.round(x), by2 = Math.round(y - 5), bw2 = Math.round(w);
      ctx.fillStyle = '#1a1020'; ctx.fillRect(bx2 - 1, by2 - 1, bw2 + 2, 4);
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(bx2, by2, bw2, 2);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(bx2, by2, Math.round(bw2 * k), 2);
      if (dt > 1.5 && Math.sin(t * 5) > -0.3) drawText(ctx, 'tap!', Math.round(x + w / 2), Math.round(y + h * 0.45), { align: 'center', color: '#ffb0d0', outline: '#1a1020', alpha: 0.7 });
    }
  }

  // The fun fact that comes with a new jigsaw piece, on a little card under
  // the print, with the puzzle so far.
  drawFact(ctx, p, y0, k) {
    const W = this.W, H = this.H, F = p.fact;
    const cw = Math.min(W - 12, 260), jw = 32, jh = 23;
    const lines = wrap(F.text, cw - jw - 16);
    const prize = F.prize ? (F.prize.banner ? 2 : 1) : 0;
    const ch = Math.max(jh + 8, 16 + lines.length * LINE_H) + prize * 10 + 2;
    const x = Math.round((W - cw) / 2), y = Math.round(Math.min(y0, H - ch - 22) + (1 - ease.outBack(k)) * 12);
    ctx.globalAlpha = clamp(k * 1.5);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 1, y, cw + 2, ch); ctx.fillRect(x, y - 1, cw, ch + 2);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y, cw, 2);
    // the jigsaw, with the new piece popping in
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(jigsaw(F.key, F.n, F.key === 'me' || F.key === 'us' ? this.book[F.key].img : null), x + 4, y + 5, jw, jh);
    const tx = x + jw + 10;
    drawText(ctx, 'FUN FACT', tx, y + 5, { color: '#e8457a' });
    drawText(ctx, `piece ${F.n}/${PIECES}`, x + cw - 5, y + 5, { align: 'right', color: '#a0784a' });
    lines.forEach((ln, i) => drawText(ctx, ln, tx, y + 16 + i * LINE_H, { color: '#3a2a4a' }));
    let py = y + Math.max(jh + 8, 16 + lines.length * LINE_H);
    if (F.prize) {
      const b = Math.round(Math.sin(this.t * 8));
      drawText(ctx, `puzzle done! ${SPECIES[F.key][0]} keychain ✦`, x + cw / 2, py + b, { align: 'center', color: '#e8457a' });
      if (F.prize.banner) drawText(ctx, `${F.prize.banner.name} banner unlocked!`, x + cw / 2, py + 10 + b, { align: 'center', color: '#c27a10' });
    }
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------- album --
  panel() { return [4, 4, this.W - 8, this.H - 8]; }
  tabRects() {
    const [px, py] = this.panel(), out = {};
    let x = px + 4;
    for (const k of TABS) { const w = textWidth(k) + 10; out[k] = [x, py + 4, w, 11]; x += w + 4; }
    return out;
  }
  closeRect() { const [px, py, pw] = this.panel(); return [px + pw - 13, py + 3, 10, 10]; }
  albumTap(x, y) {
    const A = this.album, snd = this.story.sound;
    if (A.card) {
      if (this.cardBtn && this.hit(this.cardBtn, x, y)) { this.exportSouvenir(A.card); snd.sfx('shutter'); return; }
      A.card = null; snd.sfx('pop'); return;
    }
    if (this.hit(this.closeRect(), x, y)) { this.album = null; snd.sfx('pop'); return; }
    const tabs = this.tabRects();
    for (const k of TABS) if (this.hit(tabs[k], x, y)) { A.tab = k; this.lastTab = k; snd.sfx('type'); return; }
    if (A.tab === 'gallery') this.gallery.down(x, y);
    else if (A.tab === 'notebook') this.notebook.down(x, y);
    else this.workshopTap(x, y);
  }

  drawAlbum(ctx) {
    const W = this.W, H = this.H, A = this.album;
    ctx.fillStyle = 'rgba(4,28,54,0.72)';
    ctx.fillRect(0, 0, W, H);
    const [px, py, pw, ph] = this.panel();
    paper(ctx, px, py, pw, ph, this.t);
    // tabs, points and close
    const tabs = this.tabRects();
    for (const k of TABS) {
      const [x, y, w, h] = tabs[k], on = A.tab === k;
      ctx.fillStyle = on ? '#ff7a5a' : '#fff8e4'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = on ? '#c24a3a' : '#7ac8d8'; ctx.fillRect(x, y + h - 1, w, 1);
      drawText(ctx, k, x + w / 2, y + 2, { align: 'center', color: on ? '#ffffff' : '#1e6a84' });
    }
    const [cx, cy] = this.closeRect();
    drawText(ctx, '×', cx + 1, cy + 1, { color: '#0e5a78' });
    if (pw > 150) {
      // a little sun next to your points
      const sx = cx - 14 - textWidth(`✦${this.points}`), sy = py + 9;
      ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(sx - 4, sy, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb02a'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + this.t; ctx.fillRect(Math.round(sx - 4 + Math.cos(a) * 5), Math.round(sy + Math.sin(a) * 5), 1, 1); }
      drawText(ctx, `✦${this.points}`, cx - 6, py + 6, { align: 'right', color: '#e0701a' });
    }
    if (A.tab === 'gallery') this.gallery.draw(ctx);
    else if (A.tab === 'notebook') this.notebook.draw(ctx);
    else this.drawWorkshop(ctx);
    if (A.card) this.drawPostcard(ctx, A.card);
  }

  // ----------------------------------------------------------- workshop --
  // Layout: the camera on a little desk (left on wide screens, on top on tall
  // ones), then the sub-tabs and whatever the current one offers.
  ws() {
    const [px, py, pw, ph] = this.panel();
    const top = py + 18, land = pw > ph * 1.15;
    let box, opt;
    if (land) { const bw = Math.round(pw * 0.46); box = [px + 6, top, bw, ph - 24]; opt = [px + bw + 12, top, pw - bw - 18, ph - 24]; }
    else { const bh = Math.round(Math.min(ph * 0.34, (pw - 12) * 0.62)); box = [px + 6, top, pw - 12, bh]; opt = [px + 6, top + bh + 5, pw - 12, ph - bh - 29]; }
    const s = clamp(Math.floor(Math.min((box[2] - 8) / (CAM_W + 8), (box[3] - 16) / (CAM_H + 12))), 1, 6);
    const cx = Math.round(box[0] + (box[2] - CAM_W * s) / 2), cy = Math.round(box[1] + (box[3] - 12 - CAM_H * s) / 2);
    const chips = [];
    let x = opt[0], y = opt[1];
    for (const k of SUBTABS) {
      const w = textWidth(k) + 8;
      if (x + w > opt[0] + opt[2]) { x = opt[0]; y += 13; }
      chips.push({ k, r: [x, y, w, 11] });
      x += w + 3;
    }
    const body = [opt[0], y + 16, opt[2], opt[1] + opt[3] - (y + 16)];
    return { box, opt, s, cx, cy, chips, body };
  }

  // Everything tappable in the current sub-tab, with where it goes.
  wsItems(L) {
    const A = this.album, C = this.cam, [bx, by, bw] = L.body, items = [];
    const flow = (list, size, gap, y0) => {
      let x = bx, y = y0;
      for (const it of list) {
        if (x + size > bx + bw) { x = bx; y += size + gap; }
        it.r = [x, y, size, size];
        items.push(it);
        x += size + gap;
      }
      return y + size + gap;
    };
    const button = (label, x, y, act) => { const w = textWidth(label) + 8; items.push({ kind: 'btn', label, act, r: [x, y, w, 11] }); return w; };
    if (A.sub === 'model') {
      Object.keys(MODELS).forEach((k, i) => items.push({ kind: 'model', id: k, r: [bx, by + i * 18, bw, 16] }));
      button('share my camera', bx, by + Object.keys(MODELS).length * 18 + 4, () => this.shareCamera());
    } else if (A.sub === 'paint') {
      const list = (slot) => Object.keys(PAINTS).map((id) => ({ kind: 'paint', slot, id }));
      items.push({ kind: 'label', label: 'body', r: [bx, by, 0, 0] });
      const y2 = flow(list('body'), 11, 3, by + 9);
      items.push({ kind: 'label', label: 'trim', r: [bx, y2 + 2, 0, 0] });
      flow(list('trim'), 11, 3, y2 + 11);
    } else if (A.sub === 'sticker') {
      const list = Object.keys(STICKERS).filter((k) => k !== 'photo').map((id) => ({ kind: 'sticker', id }));
      const photos = Object.keys(this.book).filter((k) => this.book[k].img).map((key) => ({ kind: 'sticker', id: 'photo', key }));
      const y2 = flow(list.concat(photos.length ? photos : [{ kind: 'sticker', id: 'photo', key: null }]), 14, 3, by);
      const w = button('undo', bx, y2, () => { C.stickers.pop(); this.camChanged(); });
      button('clear', bx + w + 4, y2, () => { C.stickers = []; this.camChanged(); });
    } else if (A.sub === 'charm') {
      const prizes = C.charms.filter((id) => id.startsWith('k:') || id === 'pearl' || id === 'fishguy');
      flow([{ kind: 'charm', id: null }].concat(Object.keys(CHARMS).concat(prizes).map((id) => ({ kind: 'charm', id }))), 18, 3, by);
    } else if (A.sub === 'banner') {
      [null, ...SETS.map((S) => S.id)].forEach((id, i) => items.push({ kind: 'banner', id, r: [bx, by + i * 15, bw, 13] }));
    } else if (A.sub === 'draw') {
      if (!C.markers) button(`buy markers ✦${MARKER_PRICE}`, bx, by, () => { if (this.spend(MARKER_PRICE)) { C.markers = true; this.save(); } });
      else {
        const y2 = flow(PENS.map((col, i) => ({ kind: 'pen', id: i + 1 })).concat([{ kind: 'pen', id: 0 }]), 11, 3, by);
        button('clear', bx, y2, () => { C.art = ''; this.artArr = null; this.camChanged(); });
      }
    } else if (A.sub === 'upgrade') {
      Object.keys(UPGRADES).forEach((k, i) => items.push({ kind: 'upgrade', id: k, r: [bx, by + i * 28, bw, 25] }));
    }
    return items;
  }

  spend(cost) {
    if (this.points < cost) { this.shake = 0.4; this.story.sound.sfx('escape'); return false; }
    this.points -= cost; this.shown = this.points;
    this.story.sound.sfx('coin');
    return true;
  }
  camChanged() { this.camDirty = true; this.save(); }

  workshopTap(x, y) {
    const A = this.album, C = this.cam, snd = this.story.sound, L = this.ws();
    for (const c of L.chips) if (this.hit(c.r, x, y)) { A.sub = c.k; A.sel = null; snd.sfx('type'); return; }
    // on the camera itself: stick a sticker, or start doodling
    const gx = Math.floor((x - L.cx) / L.s), gy = Math.floor((y - L.cy) / L.s);
    if (gx >= 0 && gy >= 0 && gx < CAM_W && gy < CAM_H) {
      if (A.sub === 'sticker' && A.sel) {
        if (C.stickers.length >= 16) C.stickers.shift();
        C.stickers.push({ k: A.sel.id, key: A.sel.key || undefined, x: gx, y: gy });
        snd.sfx('pop'); this.camChanged();
        return;
      }
      if (A.sub === 'draw' && C.markers) { A.drawing = true; this.doodle(x, y); return; }
      this.charmV += 4; snd.sfx('type');
      return;
    }
    for (const it of this.wsItems(L)) {
      if (!it.r || !this.hit(it.r, x, y)) continue;
      if (it.kind === 'btn') { it.act(); snd.sfx('type'); return; }
      if (it.kind === 'model') {
        const M = MODELS[it.id];
        if (!C.models.includes(it.id)) { if (!this.spend(M.price)) return; C.models.push(it.id); snd.sfx('yes'); }
        C.model = it.id; this.charmV += 4; this.camChanged(); return;
      }
      if (it.kind === 'paint') {
        if (!C.paints.includes(it.id)) { if (!this.spend(PAINT_PRICE)) return; C.paints.push(it.id); }
        C[it.slot] = it.id; snd.sfx('pop'); this.camChanged(); return;
      }
      if (it.kind === 'sticker') {
        if (!C.stickerSet.includes(it.id)) { if (!this.spend(STICKERS[it.id])) return; C.stickerSet.push(it.id); this.save(); }
        if (it.id === 'photo' && !it.key) { this.shake = 0.3; return; }
        A.sel = { id: it.id, key: it.key }; snd.sfx('pop'); return;
      }
      if (it.kind === 'banner') {
        if (it.id && !C.banners.includes(it.id)) { this.shake = 0.3; snd.sfx('escape'); return; }
        C.banner = it.id; snd.sfx('ding'); this.camChanged(); return;
      }
      if (it.kind === 'charm') {
        if (it.id && !C.charms.includes(it.id)) { if (!this.spend(CHARMS[it.id])) return; C.charms.push(it.id); }
        C.charm = it.id; this.charmV += 6; snd.sfx('ding'); this.save(); return;
      }
      if (it.kind === 'pen') { A.pen = it.id; snd.sfx('type'); return; }
      if (it.kind === 'upgrade') {
        const lv = this.levels[it.id], cost = UPGRADES[it.id].costs[lv];
        if (cost == null || !this.spend(cost)) return;
        this.levels[it.id]++;
        if (it.id === 'roll') this.film = ROLL_CAP[this.levels.roll];
        snd.sfx('yes'); this.save(); return;
      }
    }
  }

  doodle(x, y) {
    const L = this.ws(), A = this.album;
    const gx = Math.floor((x - L.cx) / L.s), gy = Math.floor((y - L.cy) / L.s);
    if (!this.artArr) this.artArr = (this.cam.art || '').padEnd(CAM_W * CAM_H, '0').split('');
    // join up the stroke from the last point so fast drags draw lines
    const from = A.last || [gx, gy], n = Math.max(Math.abs(gx - from[0]), Math.abs(gy - from[1]), 1);
    for (let k = 0; k <= n; k++) {
      const px = Math.round(lerp(from[0], gx, k / n)), py = Math.round(lerp(from[1], gy, k / n));
      if (px >= 0 && py >= 0 && px < CAM_W && py < CAM_H) this.artArr[py * CAM_W + px] = A.pen.toString(16);
    }
    A.last = [gx, gy];
    this.cam.art = this.artArr.join('');
    this.camDirty = true;
  }
  saveArt() { this.save(); }

  drawWorkshop(ctx) {
    const A = this.album, C = this.cam, L = this.ws(), [bx, by, bw, bh] = L.box;
    // the desk
    ctx.fillStyle = '#d9c49a'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#c8b084'; for (let j = by + 3; j < by + bh; j += 5) ctx.fillRect(bx, j, bw, 1);
    ctx.fillStyle = 'rgba(60,40,20,0.25)'; ctx.fillRect(L.cx + 2 * L.s, L.cy + (CAM_H - 2) * L.s, (CAM_W - 4) * L.s, 3 * L.s);
    const img = this.camImage();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, L.cx, L.cy, CAM_W * L.s, CAM_H * L.s);
    if (A.sub === 'draw' && C.markers) {
      ctx.fillStyle = 'rgba(40,20,10,0.18)';
      for (let j = 0; j <= CAM_H; j += 2) for (let i = 0; i <= CAM_W; i += 2) ctx.fillRect(L.cx + i * L.s, L.cy + j * L.s, 1, 1);
    }
    drawCharm(ctx, C.charm, L.cx + img.lug[0] * L.s, L.cy + img.lug[1] * L.s, this.charmA, Math.max(1, Math.round(L.s * 0.75)));
    const M = this.model();
    drawText(ctx, fit(`${M.name} · ${M.perk}`, bw - 6), bx + bw / 2, by + bh - 10, { align: 'center', color: '#5a3a1e' });
    // sub-tabs
    for (const c of L.chips) {
      const [x, y, w, h] = c.r, on = A.sub === c.k;
      ctx.fillStyle = on ? '#2aa8c8' : '#d4f1f6'; ctx.fillRect(x, y, w, h);
      drawText(ctx, c.k, x + w / 2, y + 2, { align: 'center', color: on ? '#ffffff' : '#1e6a84' });
    }
    const hint = { sticker: A.sel ? 'tap the camera to stick it on' : 'pick a sticker', draw: C.markers ? 'draw on the camera' : '', paint: `new colours ✦${PAINT_PRICE}`, charm: 'finish a jigsaw for its keychain', banner: 'finish a whole tank in the encyclopedia' }[A.sub];
    for (const it of this.wsItems(L)) {
      const [x, y, w, h] = it.r;
      if (it.kind === 'label') { drawText(ctx, it.label, x, y, { color: '#8a6a4a' }); continue; }
      if (it.kind === 'btn') { ctx.fillStyle = '#ff6a9a'; ctx.fillRect(x, y, w, h); drawText(ctx, it.label, x + w / 2, y + 2, { align: 'center', color: '#ffffff' }); continue; }
      if (it.kind === 'model') {
        const Md = MODELS[it.id], owned = C.models.includes(it.id), on = C.model === it.id;
        ctx.fillStyle = on ? '#ffe4ee' : '#fffaf0'; ctx.fillRect(x, y, w, h);
        drawText(ctx, Md.name, x + 3, y + 2, { color: '#3a2a4a' });
        if (w > 120) drawText(ctx, fit(Md.perk, w - textWidth(Md.name) - 50), x + textWidth(Md.name) + 8, y + 2, { color: '#8a6a4a' });
        const tag = on ? 'using' : owned ? 'use' : `✦${Md.price}`;
        const tw = textWidth(tag) + 6;
        ctx.fillStyle = on ? '#8ad0a0' : owned ? '#c8b898' : this.points >= Md.price ? '#ff6a9a' : '#c8a8b0';
        ctx.fillRect(x + w - tw - 2, y + 2, tw, 11);
        drawText(ctx, tag, x + w - tw / 2 - 2, y + 4, { align: 'center', color: '#ffffff' });
        continue;
      }
      if (it.kind === 'paint') {
        const on = C[it.slot] === it.id, owned = C.paints.includes(it.id);
        ctx.fillStyle = on ? '#ff3a7a' : '#5a3a1e'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = PAINTS[it.id]; ctx.fillRect(x, y, w, h);
        if (!owned) { ctx.fillStyle = 'rgba(40,20,10,0.55)'; ctx.fillRect(x + 3, y + 5, 5, 4); ctx.fillRect(x + 4, y + 3, 3, 2); }
        continue;
      }
      if (it.kind === 'sticker' || it.kind === 'charm') {
        const id = it.id, sel = it.kind === 'sticker' ? A.sel && A.sel.id === id && A.sel.key === it.key : C.charm === id;
        const owned = it.kind === 'sticker' ? C.stickerSet.includes(id) : !id || C.charms.includes(id);
        ctx.fillStyle = sel ? '#ff8ab4' : '#fffaf0'; ctx.fillRect(x, y, w, h);
        if (it.kind === 'sticker' && id === 'photo') {
          const im = it.key && this.book[it.key].img;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y + 3, w - 4, h - 5);
          if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x + 3, y + 4, w - 6, h - 8); ctx.imageSmoothingEnabled = false; }
          else drawText(ctx, '?', x + w / 2, y + 4, { align: 'center', color: '#a08060' });
        } else if (it.kind === 'sticker') drawStickerIcon(ctx, id, x + w / 2, y + h / 2);
        else if (id) drawCharmIcon(ctx, id, x + w / 2, y + h / 2);
        else drawText(ctx, '×', x + w / 2, y + 5, { align: 'center', color: '#a08060' });
        if (!owned) { ctx.fillStyle = 'rgba(243,230,200,0.6)'; ctx.fillRect(x, y, w, h); const pr = it.kind === 'sticker' ? STICKERS[id] : CHARMS[id]; drawText(ctx, `${pr}`, x + w / 2, y + h - 7, { align: 'center', color: '#c2466e' }); }
        continue;
      }
      if (it.kind === 'banner') {
        const S = SETS.find((q) => q.id === it.id), owned = !it.id || C.banners.includes(it.id), on = C.banner === it.id;
        ctx.fillStyle = on ? '#ffe4ee' : '#fffaf0'; ctx.fillRect(x, y, w, h);
        if (S) { for (let k = 0; k < 10; k++) { ctx.fillStyle = S.cols[k % 2]; ctx.fillRect(x + 3 + k * 2, y + 3, 2, 7); } }
        drawText(ctx, S ? S.name : 'no banner', x + (S ? 27 : 4), y + 3, { color: owned ? '#3a2a4a' : '#a89070' });
        const tag = on ? 'using' : owned ? 'use' : `${S.keys.filter((k) => puzzleDone(this.book, k)).length}/${S.keys.length}`;
        const tw = textWidth(tag) + 6;
        ctx.fillStyle = on ? '#8ad0a0' : owned ? '#c8b898' : '#d8c8a8'; ctx.fillRect(x + w - tw - 2, y + 1, tw, 11);
        drawText(ctx, tag, x + w - tw / 2 - 2, y + 3, { align: 'center', color: '#ffffff' });
        continue;
      }
      if (it.kind === 'pen') {
        const on = A.pen === it.id;
        ctx.fillStyle = on ? '#ff3a7a' : '#5a3a1e'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        if (it.id) { ctx.fillStyle = PENS[it.id - 1]; ctx.fillRect(x, y, w, h); }
        else { ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#ff6a8a'; ctx.fillRect(x + 2, y + 4, w - 4, 3); }
        continue;
      }
      if (it.kind === 'upgrade') {
        const U = UPGRADES[it.id], lv = this.levels[it.id];
        ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, w, h);
        drawText(ctx, U.name, x + 4, y + 3, { color: '#3a2a4a' });
        for (let k = 0; k < 3; k++) { ctx.fillStyle = k < lv ? '#ff8ab4' : '#d8c8a8'; ctx.fillRect(x + 8 + textWidth(U.name) + k * 5, y + 5, 4, 4); }
        const say = (l) => (it.id === 'lens' ? LENSES[l] : it.id === 'film' ? `${FILMS[l]} x${FILM_MULT[l]}` : it.id === 'dev' ? `${DEV_TIME[l]}s to develop` : `${ROLL_CAP[l]} shots`);
        drawText(ctx, fit(lv < 3 ? `${say(lv)} > ${say(lv + 1)}` : say(lv), w - 50), x + 4, y + 14, { color: '#8a6a4a' });
        const cost = U.costs[lv], tag = cost == null ? 'max' : `✦${cost}`, tw = textWidth(tag) + 6;
        ctx.fillStyle = cost == null ? '#c8b898' : this.points >= cost ? '#ff6a9a' : '#c8a8b0';
        ctx.fillRect(x + w - tw - 3, y + 7, tw, 11);
        drawText(ctx, tag, x + w - tw / 2 - 3, y + 9, { align: 'center', color: '#ffffff' });
      }
    }
    if (hint) { const [ox, oy, ow, oh] = L.opt; drawText(ctx, fit(hint, ow), ox + ow / 2, oy + oh - 9, { align: 'center', color: '#8a6a4a' }); }
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
    drawStickerIcon(ctx, 'fish', sx + 8, sy + 9);
    ctx.fillStyle = 'rgba(60,40,80,0.55)';
    for (let a = 0; a < TAU; a += 0.35) ctx.fillRect(Math.round(sx - 4 + Math.cos(a) * 8), Math.round(sy + 12 + Math.sin(a) * 8), 1, 1);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 14; k++) ctx.fillRect(sx - 20 + k, sy + 8 + i * 4 + Math.round(Math.sin(k * 0.8) * 1), 1, 1);
    if (wide) drawText(ctx, 'greetings from', tx, ty - 10, { color: '#8a6a4a' });
    drawText(ctx, name, tx, ty, { color: '#3a2a4a', scale: wide && textWidth(name) * 2 < cw - iw - 20 ? 2 : 1 });
    const ly = ty + (wide ? 18 : 10);
    drawText(ctx, '★'.repeat(r) + ' ' + RARITY_NAME[r], tx, ly, { color: RARITY_COL[r], outline: '#3a2a4a' });
    drawText(ctx, `snapped ×${e.n}`, tx, ly + 10, { color: '#8a6a4a' });
    if (e.score) drawText(ctx, `best ✦${e.score}`, tx, ly + 20, { color: '#c27a10' });
    // save it as a souvenir photo
    const label = 'save as jpeg', bw = textWidth(label) + 10;
    const bx = x + cw - bw - 6, by = y + chh - 17;
    ctx.fillStyle = '#10142a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 13);
    ctx.fillStyle = '#ff6a9a'; ctx.fillRect(bx, by, bw, 11);
    drawText(ctx, label, bx + bw / 2, by + 2, { align: 'center', color: '#ffffff' });
    this.cardBtn = [bx, by, bw, 11];
    const note = 'tap save to keep the souvenir i made for you';
    drawText(ctx, fit(note, bx - x - 10), x + 6, by + 2, { color: '#c2466e' });
  }

  // ---------------------------------------------------------- souvenirs --
  // A big polaroid of your best shot of a species: the photo blown up in
  // crisp pixels, the name and stars written below, a stamp and a postmark.
  souvenir(key) {
    const e = this.book[key];
    if (!e || !e.img) return null;
    const [name, r] = SPECIES[key], im = e.img;
    const k = clamp(Math.floor(760 / im.width), 4, 12);
    const pw = im.width * k, ph = im.height * k, side = 7 * k, top = 7 * k, bottom = 32 * k;
    const W = pw + side * 2, H = ph + top + bottom;
    const c = makeCanvas(W, H), x = c.ctx;
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#fbf6ea'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(150,110,60,0.07)';
    const g = Math.max(1, k >> 1);
    for (let i = 0; i < (W * H) / (g * g * 90); i++) x.fillRect(((i * 97) % Math.ceil(W / g)) * g, ((i * 57 + (i >> 4)) % Math.ceil(H / g)) * g, g, g);
    x.fillStyle = '#2a1a10'; x.fillRect(side - g, top - g, pw + g * 2, ph + g * 2);
    x.drawImage(im, side, top, pw, ph);
    const ts = Math.max(2, Math.round(k * 0.8)), ss = Math.max(1, Math.round(k * 0.45));
    const ty = top + ph + 5 * k;
    drawText(x, name, side, ty, { scale: ts, color: '#3a2a4a' });
    drawText(x, '★'.repeat(r) + ' ' + RARITY_NAME[r], side, ty + 10 * ts, { scale: ss, color: RARITY_COL[r], outline: '#3a2a4a' });
    const now = new Date(), date = `'${String(now.getFullYear()).slice(2)} ${now.getMonth() + 1} ${now.getDate()}`;
    drawText(x, 'Very Cool Aquarium Game', side, H - 5 * k - 7 * ss, { scale: ss, color: '#8a6a4a' });
    drawText(x, `${date} · ${this.model().name}`, W - side, H - 5 * k - 7 * ss, { scale: ss, align: 'right', color: '#8a6a4a' });
    // stamp and postmark
    const st = makeCanvas(18, 20), sx = st.ctx;
    sx.fillStyle = '#ffffff'; sx.fillRect(1, 1, 16, 18);
    for (let i = 1; i < 17; i += 2) { sx.clearRect(i, 1, 1, 1); sx.clearRect(i, 18, 1, 1); }
    sx.fillStyle = RARITY_COL[r]; sx.fillRect(3, 3, 12, 14);
    drawStickerIcon(sx, 'fish', 9, 10);
    const sk = Math.max(2, Math.round(k * 0.9)), stx = W - side - 18 * sk, sty = top + ph + 4 * k;
    x.drawImage(st, stx, sty, 18 * sk, 20 * sk);
    x.fillStyle = 'rgba(60,40,80,0.5)';
    for (let a = 0; a < TAU; a += 0.2) x.fillRect(Math.round(stx - 4 * sk + Math.cos(a) * 9 * sk), Math.round(sty + 13 * sk + Math.sin(a) * 9 * sk), g, g);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 20; j++) x.fillRect(Math.round(stx - 26 * sk + j * sk), Math.round(sty + 8 * sk + i * 5 * sk + Math.sin(j * 0.8) * sk), g, g);
    return c;
  }

  // Your camera design as a picture to show people: blown up big on a
  // little card with its model, colours and prizes.
  cameraCard() {
    const k = 10, img = this.camImage(), C = this.cam, M = this.model();
    const W = CAM_W * k + 160, H = CAM_H * k + 200;
    const c = makeCanvas(W, H), x = c.ctx;
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#f3e6c8'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#d9c49a'; for (let j = 10; j < H; j += 16) x.fillRect(0, j, W, 3);
    x.fillStyle = 'rgba(60,40,20,0.25)'; x.fillRect(80 + 2 * k, 70 + (CAM_H - 2) * k, (CAM_W - 4) * k, 3 * k);
    x.drawImage(img, 80, 70, CAM_W * k, CAM_H * k);
    drawCharm(x, C.charm, 80 + img.lug[0] * k, 70 + img.lug[1] * k, 0.25, Math.round(k * 0.75));
    drawText(x, 'my camera', W / 2, 20, { align: 'center', scale: 4, color: '#3a2a4a' });
    const line = `${M.name} · ${C.body} & ${C.trim}${C.banner ? ' · ' + (SETS.find((q) => q.id === C.banner) || {}).name + ' banner' : ''}`;
    drawText(x, line, W / 2, H - 70, { align: 'center', scale: 2, color: '#6a4a2a' });
    drawText(x, `notebook ${ORDER.filter((q) => puzzleDone(this.book, q)).length}/${ORDER.length} · Very Cool Aquarium Game`, W / 2, H - 40, { align: 'center', scale: 2, color: '#a08060' });
    return c;
  }

  async shareCamera() {
    const blob = await new Promise((res) => this.cameraCard().toBlob(res, 'image/png'));
    if (blob) await this.saveBlob(blob, 'my-camera.png', 'camera saved');
  }

  // Resolves the claude.ai downloads capability, or null outside the viewer.
  downloads() {
    if (!this.dlP) {
      const cl = typeof window !== 'undefined' && window.claude;
      this.dlP = cl && cl.use ? cl.use('downloads').catch(() => null) : Promise.resolve(null);
    }
    return this.dlP;
  }

  async exportSouvenir(key) {
    const c = this.souvenir(key);
    if (!c) return;
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    const filename = `souvenir-${SPECIES[key][0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.jpg`;
    await this.saveBlob(blob, filename, 'souvenir saved');
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
// The album's backing: a summer day at the sea. Pale sky-to-sea card with a
// teal frame, a band of rolling waves along the top behind the tabs, a sandy
// strip along the bottom with shells and a starfish, and a little sun.
function paper(ctx, x, y, w, h, t = 0) {
  ctx.fillStyle = '#0e5a78'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#3ab0c8'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#dff6fb'); g.addColorStop(0.55, '#f2fbf8'); g.addColorStop(1, '#fff3d8');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // waves along the top
  for (let i = 0; i < w; i++) {
    const wy = Math.round(3 + Math.sin(i * 0.16 + t * 2) * 1.5 + Math.sin(i * 0.05 - t) * 1);
    ctx.fillStyle = '#9ee0ee'; ctx.fillRect(x + i, y, 1, wy + 11);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + i, y + wy + 11, 1, 1);
  }
  ctx.fillStyle = 'rgba(58,176,200,0.35)';
  for (let i = 0; i < w; i += 9) ctx.fillRect(x + ((i + Math.floor(t * 6)) % w), y + 7 + (i % 3), 3, 1);
  // sand along the bottom
  ctx.fillStyle = '#f6dca0'; ctx.fillRect(x, y + h - 4, w, 4);
  ctx.fillStyle = '#e8c27a'; for (let i = 2; i < w; i += 5) ctx.fillRect(x + i, y + h - 2 - (i % 2), 1, 1);
  ctx.fillStyle = '#ffffff'; for (let i = 0; i < w; i++) if (Math.sin(i * 0.2 + t * 1.5) > 0.3) ctx.fillRect(x + i, y + h - 5, 1, 1);
  // shells and a starfish in the corners
  const shell = (sx, sy) => { ctx.fillStyle = '#ff9a8a'; ctx.fillRect(sx - 2, sy, 5, 2); ctx.fillRect(sx - 1, sy - 1, 3, 1); ctx.fillStyle = '#ffd6c8'; ctx.fillRect(sx, sy - 1, 1, 3); };
  const star = (sx, sy) => { ctx.fillStyle = '#ff7a3a'; ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx, sy - 2, 1, 5); ctx.fillRect(sx - 1, sy + 1, 1, 2); ctx.fillRect(sx + 1, sy + 1, 1, 2); };
  shell(x + 6, y + h - 4); star(x + 14, y + h - 4); shell(x + w - 8, y + h - 4);
}

function drawBook(ctx, x, y) {
  ctx.fillStyle = '#1a1020'; ctx.fillRect(x, y, 15, 14);
  ctx.fillStyle = '#ff7aa8'; ctx.fillRect(x + 1, y + 1, 13, 12);
  ctx.fillStyle = '#c2466e'; ctx.fillRect(x + 1, y + 1, 2, 12);
  ctx.fillStyle = '#fff4e0'; ctx.fillRect(x + 13, y + 2, 1, 10);
  drawStickerIcon(ctx, 'fish', x + 8, y + 7);
}
