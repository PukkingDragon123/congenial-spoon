// The other galleries on the walk through the aquarium: a dark jellyfish hall
// lit by slowly shifting colour, and a bright coral reef with clownfish in
// their anemones and crabs on the sand. Both share the main tank's world
// coordinates, camera, couple and effect hooks, so the story can drive any of
// them the same way.
import { TAU, clamp, lerp, R, rng, makeCanvas, ramp, bayer, Buf, hex, mixRGB, hash2, fbm } from '../util.js';
import { CX, tallExtra, genCaustics, genSand } from '../art/env.js';
import { Creature, Crab } from './creatures.js';
import { Particles, bubbleSprite, glowSprite } from './fx.js';
import { renderJelly, JELLY_FRAMES } from '../art/creatures.js';
import { warmLevel, queueVariants } from '../art/fish.js';

const CY = 200;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class Room {
  constructor(couple) {
    this.t = 0;
    this.cam = { x: CX, y: CY };
    this.creatures = [];
    this.fx = new Particles();
    this.bubbles = new Particles();
    this.glows = [];
    this.extras = [];
    this.decor = [];          // {z, draw(ctx)} depth-sorted with creatures
    this.couple = couple;
    this.coupleX = CX;
    this.coupleY = 352;
    this.pulse = 0;
    this.energy = 0;
    this.waves = [];
    this.light = 1;
    this.motes = [];
    this.span = 300;
    this.near = 294; this.far = 262;
  }

  floorY(z) { return lerp(this.near, this.far, z); }
  toScreen(x, y, z) {
    const p = 1 - 0.5 * z;
    return [this.W / 2 + (x - CX) - (this.cam.x - CX) * p, this.H / 2 + (y - CY) - (this.cam.y - CY) * p];
  }
  fromScreen(sx, sy, z) {
    const p = 1 - 0.5 * z;
    return [sx - this.W / 2 + CX + (this.cam.x - CX) * p, sy - this.H / 2 + CY + (this.cam.y - CY) * p];
  }
  xRange(z, b) {
    if (b) return b;
    const hw = this.span + 260 * (1 - 0.5 * z);
    return [CX - hw, CX + hw];
  }
  sendWave(x0, dir = 1, o = {}) {
    this.waves.push({ x: x0, dir, speed: o.speed ?? 620, amp: o.amp ?? 5, width: o.width ?? 150, life: o.life ?? 3.4, age: 0 });
  }
  waveAt(x, z) {
    let dy = 0;
    for (const w of this.waves) {
      const d = (x - w.x) * w.dir;
      if (d < -w.width || d > w.width) continue;
      const k = 1 - Math.abs(d) / w.width;
      dy -= Math.sin(k * Math.PI) * w.amp * (1 - w.age / w.life) * (1 - 0.5 * z);
    }
    return dy;
  }
  startle(x, y, radius = 220, power = 1) {
    for (const c of this.creatures) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < radius) c.react(x, y, power * (1 - d / radius));
    }
  }

  resize(W, H) {
    this.W = W; this.H = H;
    const extra = tallExtra(H);
    this.extra = extra;
    this.camY0 = CY - extra * 0.3;
    this.cam.y = this.camY0;
    this.off = H / 2 - this.camY0;
    this.yTop = 58 - extra * 0.75;
    this.tank = makeCanvas(W, H);
    this.refl = makeCanvas(W, H);
    const mx = Math.max(6, Math.round(W * 0.035));
    this.win = { l: mx, r: W - mx, top: Math.round(30 - extra + this.off), sill: Math.round(306 + this.off) };
    this.curves = { top: (x) => this.winTop(x), sill: () => this.win.sill };
    this.wall = this.buildWall();
    this.buildScreen();
  }

  // Window top edge in screen space; rooms override for arches.
  winTop() { return this.win.top; }

  buildWall() {
    const { W, H } = this;
    const b = new Buf(W, H);
    const w = this.win;
    const [rimA, rimB, rimC] = this.rimCols;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const top = this.winTop(x);
      const inside = x >= w.l && x < w.r && y >= top && y <= w.sill;
      if (inside) continue;
      // distance to the window's outline (square falloff keeps the rim a frame)
      const dx = Math.max(w.l - x, 0, x - w.r + 1);
      const dy = Math.max(top - y, 0, y - w.sill);
      const d = Math.max(dx, dy);
      let c;
      if (d <= 1) c = rimA;
      else if (d <= 2) c = rimB;
      else if (d <= 4) c = rimC;
      else if (y > w.sill) {
        // hall floor: dark and glossy, fading away from the glass
        const k = clamp((y - w.sill - 4) / (H - w.sill));
        c = mixRGB(this.floorCol[0], this.floorCol[1], k);
      } else {
        const k = clamp(d / 40);
        c = mixRGB(this.wallCol[0], this.wallCol[1], k);
      }
      const dd = (bayer(x, y) - 0.5) * 6;
      b.set(x, y, [clamp(c[0] + dd, 0, 255), clamp(c[1] + dd, 0, 255), clamp(c[2] + dd, 0, 255)]);
    }
    return b.toCanvas();
  }

  update(dt) {
    this.t += dt;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.age += dt; w.x += w.dir * w.speed * dt;
      if (w.age > w.life) this.waves.splice(i, 1);
    }
    for (const c of this.creatures) c.update(dt, this);
    for (let i = this.creatures.length - 1; i >= 0; i--) if (this.creatures[i].dead) this.creatures.splice(i, 1);
    this.bubbles.update(dt);
    const top = this.yTop - 20;
    this.bubbles.list = this.bubbles.list.filter((b) => b.y > top);
    this.fx.update(dt);
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.t * 0.5 + m.ph) * 3) * dt;
      m.y += m.vy * dt;
      if (m.y < this.yTop - 10) { m.y = this.floorY(m.z); m.x = CX + (R() - 0.5) * (this.spread || 1100); }
    }
    this.couple.update(dt);
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      if (g.life) { g.age = (g.age || 0) + dt; if (g.age > g.life) this.glows.splice(i, 1); }
    }
    this.tick(dt);
  }
  tick() {}

  // Depth-sorted creatures, decor and story extras, with bubbles interleaved.
  drawLife(ctx) {
    const list = [];
    for (const d of this.decor) list.push([d.z, 0, d]);
    for (const c of this.creatures) list.push([c.z, 1, c]);
    for (const e of this.extras) list.push([e.z, 2, e]);
    list.sort((a, b) => b[0] - a[0]);
    const bl = this.bubbles.list.slice().sort((a, b) => b.z - a.z);
    let bi = 0;
    for (const [z, type, o] of list) {
      while (bi < bl.length && bl[bi].z > z) this.drawBubble(ctx, bl[bi++]);
      if (type === 0) o.draw(ctx);
      else if (type === 1) this.drawCreature(ctx, o);
      else o.draw(ctx);
    }
    while (bi < bl.length) this.drawBubble(ctx, bl[bi++]);
  }
  drawCreature(ctx, c) { c.draw(ctx, this); }
  drawBubble(ctx, b) {
    const [sx, sy] = this.toScreen(b.x, b.y, b.z);
    const s = bubbleSprite(b.r);
    ctx.drawImage(s, Math.round(sx) - s.o, Math.round(sy) - s.o);
  }
  drawGlows(ctx) {
    for (const g of this.glows) {
      const [sx, sy] = this.toScreen(g.x, g.y, g.z);
      const k = g.life ? Math.sin(Math.PI * clamp(g.age / g.life)) : 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (g.a ?? 1) * k;
      const s = glowSprite(g.r, g.col);
      ctx.drawImage(s, Math.round(sx - g.r), Math.round(sy - g.r));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  drawMotes(ctx) {
    for (const m of this.motes) {
      const [sx, sy] = this.toScreen(m.x, m.y, m.z);
      if (sx < -2 || sx > this.W + 2) continue;
      const tw = 0.5 + 0.5 * Math.sin(this.t * m.f + m.ph);
      ctx.globalAlpha = m.a * tw * (0.7 + this.pulse * 0.6);
      ctx.fillStyle = m.col;
      const X = Math.round(sx), Y = Math.round(sy);
      ctx.fillRect(X, Y, 1, 1);
      if (m.big && tw > 0.8) { ctx.globalAlpha *= 0.6; ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); }
    }
    ctx.globalAlpha = 1;
  }
  // Soft vertical shafts of light that sway and breathe with the music.
  drawShafts(ctx, shafts, col, amt) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of shafts) {
      const [sx] = this.toScreen(s.x, 0, s.z);
      const sway = Math.sin(this.t * s.f + s.ph) * 10;
      const top = this.winTop(sx);
      const bot = this.win.sill;
      const a = amt * (0.55 + 0.45 * Math.sin(this.t * s.f * 0.7 + s.ph)) * (0.8 + this.energy * 0.6);
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - s.w * 0.3 + sway * 0.3, top);
      ctx.lineTo(sx + s.w * 0.3 + sway * 0.3, top);
      ctx.lineTo(sx + s.w + sway, bot);
      ctx.lineTo(sx - s.w + sway, bot);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  render(ctx) {
    const { W, H } = this;
    this.drawTank(this.tank.ctx);
    ctx.drawImage(this.tank, 0, 0);
    ctx.drawImage(this.wall, 0, 0);
    // glossy floor reflection of the tank
    const sill = this.win.sill;
    const ledge = sill + 5;
    const rh = H - ledge;
    if (rh > 0) {
      const rc = this.refl.ctx;
      rc.globalCompositeOperation = 'copy';
      rc.setTransform(1, 0, 0, -0.6, 0, 0);
      const sh = Math.round(rh / 0.6);
      rc.drawImage(this.tank, 0, sill - sh, W, sh, 0, -sh, W, sh);
      rc.setTransform(1, 0, 0, 1, 0, 0);
      rc.globalCompositeOperation = 'destination-in';
      const g = rc.createLinearGradient(0, 0, 0, rh);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      rc.fillStyle = g;
      rc.fillRect(0, 0, W, rh);
      rc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.reflA;
      for (let y = 0; y < rh; y++) {
        const wob = Math.round(Math.sin(y * 0.7 + this.t * 2) * (y / rh) * 2);
        ctx.drawImage(this.refl, 0, y, W, 1, wob, ledge + y, W, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // the couple + reflection
    const img = this.couple.render();
    const [cx, cy] = this.toScreen(this.coupleX, this.coupleY, 0);
    const X = Math.round(cx - this.couple.R.ox), Y = Math.round(cy - this.couple.R.oy);
    const fs = this.couple.flip;
    ctx.globalAlpha = 0.28;
    ctx.setTransform(fs, 0, 0, -0.55, Math.round(cx), Math.round(cy) + 1);
    ctx.drawImage(img, -this.couple.R.ox, -this.couple.R.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (fs !== 1) {
      ctx.setTransform(fs, 0, 0, 1, Math.round(cx), 0);
      ctx.drawImage(img, -this.couple.R.ox, Y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else ctx.drawImage(img, X, Y);
  }

  makeMotes(n, cols, o = {}) {
    for (let i = 0; i < n; i++) {
      const z = R();
      this.motes.push({
        x: CX + (R() - 0.5) * (this.spread || 1100), y: this.yTop + R() * 260, z,
        vx: (R() - 0.5) * 4, vy: -(o.rise ?? 3) * (0.4 + R()), ph: R() * TAU, f: 1.5 + R() * 3,
        a: (o.a ?? 0.8) * (1 - z * 0.5), col: cols[(R() * cols.length) | 0], big: R() < 0.18,
      });
    }
  }
}

// ======================================================= jellyfish hall ==
export class JellyRoom extends Room {
  constructor(couple) {
    super(couple);
    this.rimCols = [hex('#d8b4ff'), hex('#8a5ad8'), hex('#3a2070')];
    this.wallCol = [hex('#140a2e'), hex('#05030e')];
    this.floorCol = [hex('#0e0824'), hex('#020106')];
    this.reflA = 0.34;
    this.span = 260;
    this.shafts = [];
  }

  // A gentle arch.
  winTop(x) {
    const w = this.win;
    const u = (x - (w.l + w.r) / 2) / ((w.r - w.l) / 2);
    return Math.round(w.top + 26 * Math.min(1, u * u) ** 1.4);
  }

  async build(progress = () => {}) {
    const r = rng(7771);
    const hues = ['pink', 'blue', 'violet', 'gold', 'blue', 'pink', 'violet'];
    const sizes = [12, 16, 20, 26, 32];
    // keep them where the screen can see them, however narrow or tall it is
    this.spread = clamp(this.W * 1.7, 280, 900);
    const top = 40 - this.extra, bot = this.floorY(0.5);
    for (let i = 0; i < 26; i++) {
      const z = 0.08 + r() * 0.85;
      const si = clamp(Math.round((1 - z) * 4 + (r() - 0.5) * 1.4), 0, 4);
      const j = new Creature('jelly', { x: CX + (r() - 0.5) * this.spread, y: top + r() * (bot - top), z, len: sizes[si], speed: 2.5 + r() * 4, mode: 'rise', anim: 2.2 + r() * 1.6 });
      j.hue = hues[(r() * hues.length) | 0];
      j.vx = 0; j.vy = -j.speed;
      this.creatures.push(j);
    }
    // a few sea nettles trailing long ribbons, and big gentle hero jellies up front
    for (let i = 0; i < 5; i++) {
      const z = 0.2 + r() * 0.6;
      const j = new Creature('jelly', { x: CX + (r() - 0.5) * this.spread, y: top + r() * (bot - top), z, len: z < 0.45 ? 22 : 16, speed: 2 + r() * 2.5, mode: 'rise', anim: 1.8 + r() });
      j.hue = 'nettle'; j.vx = 0; j.vy = -j.speed;
      this.creatures.push(j);
    }
    for (let i = 0; i < 3; i++) {
      const j = new Creature('jelly', { x: CX + (i - 1) * this.spread * 0.33 + (r() - 0.5) * 40, y: top + 40 + r() * (bot - top - 80), z: 0.02 + r() * 0.05, len: 40 + ((r() * 2) | 0) * 6, speed: 1.6 + r(), mode: 'rise', anim: 1.6 });
      j.hue = ['pink', 'violet', 'blue'][i]; j.vx = 0; j.vy = -j.speed;
      this.creatures.push(j);
    }
    // comb jellies: tiny ovals with rainbow shimmer running down their rows
    this.combs = [];
    for (let i = 0; i < 12; i++) this.combs.push({ x: CX + (r() - 0.5) * this.spread, y: top + r() * (bot - top), z: 0.1 + r() * 0.7, ph: r() * TAU, s: 3 + ((r() * 3) | 0), vx: (r() - 0.5) * 6, vy: -1 - r() * 2 });
    const self = this;
    for (const cb of this.combs) this.decor.push({ get z() { return cb.z; }, draw(ctx) { self.drawComb(ctx, cb); } });
    for (let i = 0; i < 6; i++) this.shafts.push({ x: CX + (i - 2.5) * 150 + (r() - 0.5) * 60, z: 0.5 + r() * 0.4, w: 26 + r() * 30, f: 0.2 + r() * 0.3, ph: r() * TAU });
    this.makeMotes(130, ['#ffffff', '#ffd6f0', '#d8c8ff', '#bff4ff', '#fff2c0'], { rise: 2.5, a: 0.9 });
    // warm the jelly sprites that are on screen at the title
    const need = new Set(this.creatures.map((c) => c.len + '|' + c.hue));
    let n = 0;
    for (const k of need) {
      const [len, hue] = k.split('|');
      for (let f = 0; f < JELLY_FRAMES; f++) renderJelly(+len, f, hue);
      progress(++n / need.size);
      await nextFrame();
    }
  }

  buildScreen() {
    const { W, H } = this;
    // deep indigo void, dithered
    const pal = ramp(['#020108', '#05031a', '#0a0730', '#120c48', '#1c1260', '#261a74'], 6);
    const b = new Buf(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = (x - W / 2) / (W * 0.6), cy = (y - H * 0.42) / (H * 0.7);
      const l = 4.8 - (cx * cx + cy * cy) * 4.2 - Math.max(0, (y - this.win.sill + 40) / 30);
      b.set(x, y, pal[clamp(Math.round(l + (bayer(x, y) - 0.5) * 1.2), 0, 5)]);
    }
    this.backdrop = b.toCanvas();
    // three big colour washes that cross-fade behind the jellies
    const R0 = Math.round(Math.max(W, H) * 0.55);
    this.washes = ['#ff4fb4', '#7a4cff', '#2fd4ff'].map((col) => {
      const c = makeCanvas(R0 * 2, R0 * 2);
      const g = c.ctx.createRadialGradient(R0, R0, 0, R0, R0, R0);
      const [cr, cg, cb] = hex(col);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},0.55)`);
      g.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.18)`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      c.ctx.fillStyle = g;
      c.ctx.fillRect(0, 0, R0 * 2, R0 * 2);
      c.R0 = R0;
      return c;
    });
  }

  drawComb(ctx, c) {
    const [sx, sy] = this.toScreen(c.x, c.y, c.z);
    if (sx < -10 || sx > this.W + 10) return;
    const X = Math.round(sx), Y = Math.round(sy);
    const s = Math.max(2, Math.round(c.s * (1 - c.z * 0.4)));
    ctx.globalAlpha = 0.5 * (1 - c.z * 0.5);
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(X - 1, Y - s, 3, s * 2 + 1);
    ctx.fillRect(X - 2, Y - s + 1, 5, s * 2 - 1);
    // eight rows of cilia flashing rainbow in a running wave
    for (let k = 0; k < s * 2; k++) {
      const h = (this.t * 240 + k * 45 + c.ph * 57) % 360;
      ctx.globalAlpha = (0.55 + 0.45 * Math.sin(this.t * 6 - k + c.ph)) * (1 - c.z * 0.4);
      ctx.fillStyle = `hsl(${h},100%,70%)`;
      ctx.fillRect(X - 2, Y - s + 1 + k, 1, 1);
      ctx.fillRect(X + 2, Y - s + 1 + k, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  tick(dt) {
    for (const c of this.combs || []) {
      c.x += (c.vx + Math.sin(this.t * 0.4 + c.ph) * 3) * dt;
      c.y += c.vy * dt;
      if (c.y < 20 - this.extra) { c.y = this.floorY(c.z); c.x = CX + (R() - 0.5) * this.spread; }
    }
    if (R() < dt * 2.5) {
      const z = R() * 0.8;
      this.bubbles.add({ kind: 'bubble', x: CX + (R() - 0.5) * this.spread, y: this.floorY(z), z, vx: 0, vy: -(18 + R() * 16), age: 0, life: 14, r: R() < 0.7 ? 1 : 2, wob: 8, wobF: 4, ph: R() * TAU, fade: false });
    }
    for (const j of this.creatures) {
      if (j.kind === 'jelly' && j.y < 20 - this.extra) {
        j.y = this.floorY(j.z) + 40;
        j.x = CX + (R() - 0.5) * this.spread;
      }
    }
  }

  drawCreature(ctx, c) {
    if (c.kind === 'jelly') {
      const [sx, sy] = this.toScreen(c.x, c.y, c.z);
      const col = { pink: '#ff7ac8', blue: '#6ad8ff', violet: '#a07aff', gold: '#ffc870', nettle: '#ffa860' }[c.hue] || '#6ad8ff';
      const r = Math.round(c.len * 1.1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, (0.32 + 0.3 * this.pulse + (c.lit || 0) * 0.5) * (1 - c.z * 0.5));
      ctx.drawImage(glowSprite(r, col), Math.round(sx - r), Math.round(sy - r * 0.8));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      c.alpha = 1 - c.z * 0.6;   // far ones melt into the blue
    }
    c.draw(ctx, this);
  }

  drawTank(ctx) {
    const { W, H } = this;
    ctx.drawImage(this.backdrop, 0, 0);
    // colour washes drifting and breathing with the song
    ctx.globalCompositeOperation = 'lighter';
    this.washes.forEach((wc, i) => {
      const ph = this.t * 0.11 + i * (TAU / 3);
      const a = (0.35 + 0.65 * Math.max(0, Math.sin(ph))) * (0.7 + this.energy * 0.9);
      const [sx] = this.toScreen(CX + Math.sin(ph * 0.7) * 260, 0, 0.8);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.drawImage(wc, Math.round(sx - wc.R0), Math.round(H * 0.42 - wc.R0 + Math.sin(ph) * 30));
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.drawShafts(ctx, this.shafts, '200,180,255', 0.1);
    // a soft pool of light on the tank floor
    const [, fy] = this.toScreen(CX, this.floorY(0.5), 0.5);
    const pool = ctx.createRadialGradient(W / 2, fy, 0, W / 2, fy, W * 0.6);
    pool.addColorStop(0, `rgba(170,140,255,${0.22 + this.energy * 0.2})`);
    pool.addColorStop(1, 'rgba(170,140,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, W, this.H);
    ctx.globalCompositeOperation = 'source-over';
    this.drawMotes(ctx);
    this.drawLife(ctx);
    this.drawGlows(ctx);
    this.fx.draw(ctx, (p) => this.toScreen(p.x, p.y, p.z));
  }
}

// ========================================================= coral reef ==
const PAL = {
  pink: ramp(['#4a1238', '#8a2a64', '#c8468c', '#ec74b2', '#ffaed4', '#ffe2f0'], 6),
  purple: ramp(['#22124a', '#402680', '#6842b8', '#9a6ce0', '#c8a4f6', '#ecdcff'], 6),
  orange: ramp(['#40160a', '#80300e', '#c4561a', '#ec8430', '#ffb866', '#ffe0b0'], 6),
  lime: ramp(['#1e2e0e', '#3c5a18', '#6a8e26', '#a2c440', '#d4ec80', '#f2fcc4'], 6),
  teal: ramp(['#0a3040', '#145a68', '#23868e', '#48b4b6', '#8ee0dc', '#d0faf4'], 6),
  gold: ramp(['#3e2a08', '#7a5812', '#b8881e', '#e4b83a', '#fce07a', '#fff6c8'], 6),
  rock: ramp(['#0c1a30', '#16294a', '#243e62', '#36567e', '#4e729a', '#7094b8'], 6),
};

// Tiny software painter for coral layers: depth-tested pixels with top light.
class Painter {
  constructor(w, h) { this.w = w; this.h = h; this.b = new Buf(w, h); }
  px(x, y, pal, l) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.b.set(x, y, pal[clamp(Math.round(l + (bayer(x, y) - 0.5) * 0.9), 0, pal.length - 1)]);
  }
  blob(cx, cy, rx, ry, pal, fn = null) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      let l = 3.4 - v * 1.8 - u * 0.5 - d * 0.8;
      if (fn) l = fn(l, u, v, x, y);
      this.px(x, y, pal, l);
    }
  }
  stick(ax, ay, bx, by, r0, r1, pal, tipL = 0) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = lerp(ax, bx, t), y = lerp(ay, by, t), r = lerp(r0, r1, t);
      for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.3) continue;
        this.px(x + dx, y + dy, pal, 2.4 - dx / (r + 0.5) * 0.9 - dy / (r + 0.5) * 0.6 + t * tipL);
      }
    }
  }
  canvas() { return this.b.toCanvas(); }
}

function staghorn(P, x, y, ang, len, w, depth, pal, r) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  P.stick(x, y, ex, ey, w, Math.max(0.8, w * 0.72), pal, depth <= 1 ? 1.8 : 0.6);
  if (depth <= 0) { P.px(ex, ey, pal, 5); return; }
  const n = 2 + (r() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) staghorn(P, ex, ey, ang + (r() - 0.5) * 1.1, len * (0.62 + r() * 0.2), w * 0.72, depth - 1, pal, r);
}
function brain(P, cx, by, rx, pal, seed) {
  P.blob(cx, by, rx, rx * 0.7, pal, (l, u, v, x, y) => {
    if (v > 0.2) return l - 1.2;
    const g = Math.sin(x * 0.9 + fbm(x * 0.13, y * 0.13, seed, 3) * 9 + y * 0.35);
    return g > 0.55 ? l - 1.4 : l + 0.3;
  });
}
function fan(P, cx, by, rad, pal, seed) {
  for (let y = Math.floor(by - rad); y <= by; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
    const dx = x + 0.5 - cx, dy = by - (y + 0.5);
    const d = Math.hypot(dx * 0.9, dy) / rad;
    if (d > 1 || dy < 0) continue;
    const a = Math.atan2(dy, dx);
    const lattice = Math.abs(Math.sin(a * 16)) < 0.22 || Math.abs(Math.sin(d * 18 + fbm(x * 0.2, y * 0.2, seed, 2) * 3)) < 0.3;
    if (!lattice && d < 0.96) continue;
    P.px(x, y, pal, 2.2 + d * 2.4 - (dx > 0 ? 0.5 : 0));
  }
  P.stick(cx, by, cx, by - rad * 0.3, 1.4, 1, pal);
}
function table(P, cx, by, w, pal) {
  P.stick(cx, by, cx, by - w * 0.28, w * 0.07, w * 0.05, pal);
  P.blob(cx, by - w * 0.3, w * 0.5, w * 0.1, pal, (l, u, v) => l + (v < -0.3 ? 1.4 : 0) + Math.abs(Math.sin(u * 18)) * 0.4);
}
function tubes(P, x0, by, n, h, pal, r) {
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 6 + (r() - 0.5) * 3, hh = h * (0.6 + r() * 0.5);
    P.stick(x, by, x + (r() - 0.5) * 4, by - hh, 2.6, 2.2, pal, 1.2);
    P.blob(x, by - hh, 2.2, 1.2, PAL.rock, () => 0.4);
  }
}
function rocks(P, x0, x1, by, pal, seed, hMax) {
  for (let x = Math.floor(x0); x < x1; x++) {
    const h = (0.4 + fbm(x * 0.02, 0.5, seed, 3) * 0.8) * hMax * Math.sin(Math.PI * clamp((x - x0) / (x1 - x0)));
    for (let y = 0; y < h; y++) P.px(x, by - y, pal, 1.4 + (y / (h + 1)) * 2 + (y > h - 2 ? 1.2 : 0) + (hash2(x, y, seed) < 0.08 ? -0.8 : 0));
  }
}

// Anemone: a mound with swaying tentacles, pre-rendered as a loop.
const ANEM_FRAMES = 10;
function genAnemone(w, hue, seed) {
  const r = rng(seed);
  const pal = hue === 'purple' ? PAL.purple : hue === 'lime' ? PAL.lime : PAL.pink;
  const H = Math.round(w * 0.8);
  const frames = [];
  const tents = [];
  for (let i = 0; i < 34; i++) tents.push({ u: r(), len: 0.55 + r() * 0.45, ph: r() * TAU });
  for (let f = 0; f < ANEM_FRAMES; f++) {
    const P = new Painter(w + 8, H + 4);
    const ox = 4, base = H + 2;
    const ph = (f / ANEM_FRAMES) * TAU;
    P.blob(ox + w / 2, base - 2, w * 0.36, 4, PAL.purple, (l) => l - 0.8);
    tents.sort((a, b) => a.u - b.u);
    for (const t of tents) {
      const x0 = ox + w * (0.14 + t.u * 0.72);
      const y0 = base - 4;
      const L = H * t.len;
      let px = x0, py = y0;
      const lean = (t.u - 0.5) * 1.2;
      for (let k = 1; k <= 8; k++) {
        const s = k / 8;
        const a = -Math.PI / 2 + lean * s + Math.sin(ph + t.ph + s * 2.4) * 0.35 * s;
        const nx = px + Math.cos(a) * (L / 8), ny = py + Math.sin(a) * (L / 8);
        P.stick(px, py, nx, ny, 1.3 - s * 0.5, 1.2 - s * 0.5, pal, 0);
        px = nx; py = ny;
      }
      P.px(px, py, pal, 5);
    }
    const c = P.canvas();
    c.ox = ox + (w >> 1); c.oy = base;
    frames.push(c);
  }
  return frames;
}

export class ReefRoom extends Room {
  constructor(couple) {
    super(couple);
    this.rimCols = [hex('#b8f4ff'), hex('#4ab0d8'), hex('#1a4a78')];
    this.wallCol = [hex('#0a1c3a'), hex('#040a18')];
    this.floorCol = [hex('#0a1a34'), hex('#02050c')];
    this.reflA = 0.3;
    this.span = 280;
    this.near = 292; this.far = 258;
    this.shafts = [];
    this.layers = [];
  }

  winTop(x) {
    const w = this.win;
    const cr = 14;
    const dl = x - w.l, dr = w.r - 1 - x;
    const d = Math.min(dl, dr);
    if (d >= cr) return w.top;
    return Math.round(w.top + cr - Math.sqrt(Math.max(0, cr * cr - (cr - d) * (cr - d))));
  }

  async build(progress = () => {}) {
    const r = rng(4242);
    const k = clamp(this.W / 480, 0.5, 1);   // squeeze the layout on narrow screens
    const steps = [];
    const step = (fn) => steps.push(fn);
    this.caustics = genCaustics();
    this.sand = genSand(640, 48, 11);
    const LW = 1500, X0 = CX - LW / 2;
    // far reef silhouette
    step(() => {
      const h = 110, P = new Painter(LW, h);
      for (let x = 0; x < LW; x++) {
        const top = h - (30 + fbm(x * 0.012, 1, 3, 4) * 70 + Math.max(0, Math.sin(x * 0.03)) * 8);
        for (let y = Math.floor(top); y < h; y++) P.px(x, y, PAL.teal, 1.6 + (y - top < 2 ? 1.3 : 0) - (y - top) * 0.01);
      }
      this.layers.push({ img: P.canvas(), x: X0, z: 0.86, sink: 4 });
    });
    // mid reef: a garden of colourful corals
    step(() => {
      const h = 170, P = new Painter(LW, h), by = h - 2;
      rocks(P, 0, LW, by, PAL.rock, 5, 26);
      for (let x = 40; x < LW - 40; x += 34 + r() * 40) {
        const k = r();
        if (k < 0.22) staghorn(P, x, by - 8, -Math.PI / 2 + (r() - 0.5) * 0.4, 18 + r() * 10, 2.6, 3, r() < 0.5 ? PAL.teal : PAL.pink, r);
        else if (k < 0.4) brain(P, x, by - 6, 12 + r() * 10, r() < 0.5 ? PAL.lime : PAL.gold, (x | 0) % 97);
        else if (k < 0.58) fan(P, x, by - 8, 24 + r() * 16, PAL.purple, (x | 0) % 53);
        else if (k < 0.72) table(P, x, by - 6, 40 + r() * 20, PAL.teal);
        else if (k < 0.86) tubes(P, x, by - 6, 3 + ((r() * 3) | 0), 16 + r() * 12, PAL.orange, r);
        else staghorn(P, x, by - 8, -Math.PI / 2, 14, 2, 2, PAL.gold, r);
      }
      this.layers.push({ img: P.canvas(), x: X0, z: 0.5, sink: 6 });
    });
    // near: big heads framing the view left and right
    step(() => {
      const h = 190, P = new Painter(LW, h), by = h - 2;
      const side = (c0, c1, s) => {
        rocks(P, c0, c1, by, PAL.rock, s, 60);
        for (let x = c0 + 20; x < c1 - 10; x += 26 + r() * 20) {
          const k = r();
          if (k < 0.3) brain(P, x, by - 30 - r() * 20, 16 + r() * 10, PAL.lime, (x | 0) % 71);
          else if (k < 0.55) staghorn(P, x, by - 40, -Math.PI / 2 + (r() - 0.5) * 0.6, 22 + r() * 8, 3.2, 3, PAL.pink, r);
          else if (k < 0.75) fan(P, x, by - 40, 30 + r() * 14, PAL.purple, (x | 0) % 41);
          else tubes(P, x, by - 40, 3, 22, PAL.orange, r);
        }
      };
      side(80, 520, 8);
      side(LW - 520, LW - 80, 9);
      this.layers.push({ img: P.canvas(), x: X0, z: 0.1, sink: 16 });
    });
    // anemones with clownfish families
    step(() => {
      this.anemones = [
        { x: CX - 150 * k, z: 0.34, frames: genAnemone(44, 'pink', 1) },
        { x: CX + 140 * k, z: 0.3, frames: genAnemone(40, 'purple', 2) },
        { x: CX - 10, z: 0.2, frames: genAnemone(48, 'lime', 3) },
      ];
      for (const a of this.anemones) {
        const self = this;
        this.decor.push({ z: a.z + 0.001, draw(ctx) { self.drawAnemone(ctx, a); } });
        const ay = this.floorY(a.z) - 16;
        for (let i = 0; i < 3; i++) {
          const c = new Creature('clown', { x: a.x + (r() - 0.5) * 20, y: ay - r() * 8, z: a.z - 0.01, len: 20 + ((r() * 3) | 0) * 2, speed: 10, mode: 'hover', home: [a.x, ay - 4, a.z - 0.01], homeR: 18, anim: 10, turnRate: 6 });
          this.creatures.push(c);
        }
      }
    });
    step(() => {
      for (let i = 0; i < 6; i++) this.creatures.push(new Creature('tang', { x: CX + (r() - 0.5) * 700 * k, y: 120 + r() * 100, z: 0.2 + r() * 0.5, len: 28 + r() * 4, speed: 14 + r() * 6, anim: 8, turnRate: 2.5, dir: r() < 0.5 ? -1 : 1 }));
      for (let i = 0; i < 6; i++) this.creatures.push(new Creature('butterfly', { x: CX + (r() - 0.5) * 700 * k, y: 150 + r() * 90, z: 0.15 + r() * 0.5, len: 24 + r() * 4, speed: 8, mode: 'hover', homeR: 60, anim: 7, turnRate: 3 }));
      for (let i = 0; i < 6; i++) this.creatures.push(new Crab({ x: CX + (r() - 0.5) * 500 * k, z: 0.08 + r() * 0.4, size: 10 + r() * 4 }));
      for (let i = 0; i < 5; i++) this.shafts.push({ x: CX + (i - 2) * 190 + (r() - 0.5) * 60, z: 0.6, w: 34 + r() * 30, f: 0.25 + r() * 0.3, ph: r() * TAU });
      this.makeMotes(70, ['#ffffff', '#e8fcff', '#fff6c8'], { rise: 1.5, a: 0.55 });
      for (const [id, L] of [['clown', 20], ['clown', 22], ['clown', 24], ['tang', 26], ['tang', 28], ['butterfly', 24], ['butterfly', 22]]) warmLevel(id, L);
      for (const [id, L] of [['tang', 20], ['tang', 30], ['butterfly', 16], ['butterfly', 20], ['clown', 18]]) queueVariants(id, L, [1, 3]);
    });
    for (let i = 0; i < steps.length; i++) { steps[i](); progress((i + 1) / steps.length); await nextFrame(); }
  }

  buildScreen() {
    const { W, H } = this;
    const pal = ramp(['#0a3a6a', '#0e5088', '#1468a2', '#1c84ba', '#28a0cc', '#3cbcd8', '#62d4e2', '#9aeaf0'], 8);
    const b = new Buf(W, H);
    for (let y = 0; y < H; y++) {
      const wy = y - this.off;
      const v = clamp(1 - (wy - 20) / 260);
      for (let x = 0; x < W; x++) {
        const cx = (x - W / 2) / (W * 0.8);
        b.set(x, y, pal[clamp(Math.round(v * 7 + (1 - cx * cx) * 0.8 - 0.6 + (bayer(x, y) - 0.5) * 1.1), 0, 7)]);
      }
    }
    this.backdrop = b.toCanvas();
  }

  drawAnemone(ctx, a) {
    const f = a.frames[Math.floor(this.t * 6 + a.x) % ANEM_FRAMES];
    const [sx, sy] = this.toScreen(a.x, this.floorY(a.z) + 2, a.z);
    const e = this.pulse * 0.12;
    ctx.setTransform(1 - e * 0.5, 0, 0, 1 + e, Math.round(sx), Math.round(sy));
    ctx.drawImage(f, -f.ox, -f.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawSand(ctx) {
    const tex = this.sand, tw = tex.width, th = tex.height;
    for (let y = this.far - 2; y <= this.near + 14; y++) {
      const z = clamp((this.near - y) / (this.near - this.far), 0, 1);
      const [sx, sy] = this.toScreen(CX, y, z);
      const row = Math.round((1 - z) * (th - 1));
      let x0 = Math.round(sx - this.W / 2 - CX) % tw;
      if (x0 > 0) x0 -= tw;
      for (let x = x0; x < this.W; x += tw) ctx.drawImage(tex, 0, row, tw, 1, x, Math.round(sy), tw, 1);
    }
    const [, s0] = this.toScreen(CX, this.far, 1);
    const [, s1] = this.toScreen(CX, this.near + 14, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = this.causPattern;
    const off = Math.round(-(this.cam.x - CX) * 0.85);
    ctx.setTransform(1, 0, 0, 0.4, off % 96, Math.round(s0));
    ctx.fillRect(-off % 96, 0, this.W, Math.round((s1 - s0) / 0.4));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  tick(dt) {
    // a steady trickle of bubbles from the anemones
    if (R() < dt * 3 && this.anemones) {
      const a = this.anemones[(R() * this.anemones.length) | 0];
      this.bubbles.add({ kind: 'bubble', x: a.x + (R() - 0.5) * 10, y: this.floorY(a.z) - 18, z: a.z, vx: 0, vy: -(20 + R() * 20), age: 0, life: 10, r: R() < 0.7 ? 1 : 2, wob: 8, wobF: 5, ph: R() * TAU, fade: false });
    }
  }

  drawTank(ctx) {
    const { W } = this;
    this.causPattern = ctx.createPattern(this.caustics[Math.floor(this.t * 9) % this.caustics.length], 'repeat');
    ctx.drawImage(this.backdrop, 0, 0);
    this.drawShafts(ctx, this.shafts, '220,255,255', 0.16);
    // layers + sand + life, far to near
    const layerAt = (L) => {
      const [sx, sy] = this.toScreen(L.x, this.floorY(L.z) + L.sink - L.img.height, L.z);
      ctx.drawImage(L.img, Math.round(sx), Math.round(sy));
    };
    layerAt(this.layers[0]);
    // soft haze over the far reef
    ctx.fillStyle = 'rgba(60,170,210,0.28)';
    ctx.fillRect(0, 0, W, this.H);
    this.drawSand(ctx);
    // the coral layers sort in depth with the fish and crabs
    const saved = this.decor;
    this.decor = [...saved, { z: this.layers[1].z, draw: () => layerAt(this.layers[1]) }, { z: this.layers[2].z, draw: () => layerAt(this.layers[2]) }];
    this.drawLife(ctx);
    this.decor = saved;
    this.drawMotes(ctx);
    this.drawGlows(ctx);
    this.fx.draw(ctx, (p) => this.toScreen(p.x, p.y, p.z));
    // surface shimmer at the top of the window
    const top = this.win.top;
    const g = ctx.createLinearGradient(0, top, 0, top + 60);
    g.addColorStop(0, 'rgba(220,255,255,0.35)');
    g.addColorStop(1, 'rgba(220,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, 60);
    ctx.globalCompositeOperation = 'source-over';
  }
}
