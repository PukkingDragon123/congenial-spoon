// Boot: sizing, asset generation with a loader, the main loop and input.
import { makeCanvas, clamp } from './util.js';
import { Post } from './post.js';
import { Aquarium, CX, CY } from './world/scene.js';
import { JellyRoom, ReefRoom } from './world/rooms.js';
import { Story } from './story/story.js';
import { drawText } from './font.js';
import { bubbleSprite } from './world/fx.js';
import { B, pumpWarm } from './art/budget.js';
import { Water } from './world/water.js';
import { renderPuffer, PUFF_FRAMES } from './art/creatures.js';
const TAU = Math.PI * 2;

const params = new URLSearchParams(location.search);
const SPEED = +(params.get('speed') || 1);

const view = document.getElementById('view');
const post = new Post(view);
const world = makeCanvas(2, 2);
const ui = makeCanvas(2, 2);
const aq = new Aquarium();
const rooms = { jelly: new JellyRoom(aq.couple), reef: new ReefRoom(aq.couple) };
const water = new Water();
let story = null;
let W = 0, H = 0, S = 1, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  const dw = Math.round(window.innerWidth * DPR), dh = Math.round(window.innerHeight * DPR);
  // Smaller world canvas = bigger pixels = a closer, fuller-looking tank.
  let s = Math.max(1, Math.floor(dh / 268));
  s = Math.max(1, Math.min(s, Math.floor(dw / 200)));
  S = s;
  W = Math.ceil(dw / s);
  H = Math.ceil(dh / s);
  for (const c of [world, ui]) { c.width = W; c.height = H; c.ctx.imageSmoothingEnabled = false; }
  post.resize(W * s, H * s);
  view.style.width = (W * s) / DPR + 'px';
  view.style.height = (H * s) / DPR + 'px';
  aq.resize(W, H);
  for (const r of Object.values(rooms)) r.resize(W, H);
  water.resize(W, H);
  if (story) story.resize(W, H);
}

// ------------------------------------------------------------------ loader --
let loadP = 0;
let isLoading = false;
let loadT = 0;
const LOAD_TIPS = ['tip: tap the pufferfish', 'tip: he really hates being poked', 'tip: rare animals pay more coins', 'tip: headphones on for the best bit', 'tip: centre your shot for a bonus'];
const loadBubbles = [];
// the loading screen's pufferfish: pottering about the little tank, and when
// you poke him he puffs into a spiky ball and bounces off the glass, cross
const LP = { x: 0.5, y: 0.6, vx: 0, vy: 0, puff: 0, mad: 0, spin: 0, face: -1, goal: [0.5, 0.6], pokes: 0, init: false, blink: 0 };
let loadTank = [0, 0, 1, 1], loadWaterTop = 0;
function loaderTank() {
  const tw = Math.round(clamp(W * 0.62, 150, 300)), th = Math.round(clamp(H * 0.42, 80, 150));
  return [Math.round(W / 2 - tw / 2), Math.round(H / 2 - th / 2 + 6), tw, th];
}
if (typeof window !== 'undefined') window.__loader = { LP, tank: () => loadTank, W: () => W, H: () => H };
function loaderTap(x, y) {
  const [tx, ty, tw, th] = loadTank, S = Math.round(clamp(th * 0.26, 16, 34));
  const px = tx + LP.x * tw, py = ty + LP.y * th;
  if (Math.hypot(x - px, y - py) > S * 1.2) return;
  LP.mad = 3.2; LP.pokes++;
  const a = Math.atan2(py - y, px - x);
  LP.vx = Math.cos(a) * 1.1 + (Math.random() - 0.5) * 0.4; LP.vy = Math.sin(a) * 1.1 - 0.5;
  for (let i = 0; i < 10; i++) loadBubbles.push({ x: px + (Math.random() - 0.5) * S, y: py, r: Math.random() < 0.5 ? 1 : 2, v: 20 + Math.random() * 30, ph: Math.random() * 6, inTank: true });
}
function drawLoader(dt) {
  loadT += dt;
  const c = world.ctx;
  // deep water, light rays swaying down from the surface
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2a5a'); g.addColorStop(0.55, '#061634'); g.addColorStop(1, '#02060e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = W * (0.15 + i * 0.18) + Math.sin(loadT * 0.4 + i) * 20;
    c.fillStyle = 'rgba(120,190,255,0.05)';
    c.beginPath(); c.moveTo(x - 8, 0); c.lineTo(x + 8, 0); c.lineTo(x + 40, H); c.lineTo(x - 10, H); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  const u = ui.ctx;
  u.clearRect(0, 0, W, H);
  const cx = Math.round(W / 2);
  const [tx, ty, tw, th] = (loadTank = loaderTank());
  drawText(u, 'Very Cool Aquarium Game', cx, ty - 22 - (W > 360 ? 8 : 0), { align: 'center', color: '#d8f0ff', outline: '#0a1a44', shadow: '#ff5a9a', scale: W > 360 ? 2 : 1 });
  // the tank: a wooden stand, the glass, water filling up with the progress
  u.fillStyle = '#3a2412'; u.fillRect(tx - 8, ty + th + 2, tw + 16, 8);
  u.fillStyle = '#6a4424'; u.fillRect(tx - 8, ty + th + 2, tw + 16, 2);
  u.fillStyle = '#2a180a'; u.fillRect(tx - 4, ty + th + 10, 4, 8); u.fillRect(tx + tw, ty + th + 10, 4, 8);
  u.fillStyle = '#16304e'; u.fillRect(tx - 3, ty - 3, tw + 6, th + 6);
  u.fillStyle = '#0a1a32'; u.fillRect(tx, ty, tw, th);
  const level = 0.3 + 0.7 * clamp(loadP, 0, 1), wTop = ty + Math.round(th * (1 - level));
  loadWaterTop = wTop;
  const wg = u.createLinearGradient(0, wTop, 0, ty + th);
  wg.addColorStop(0, '#3aa8e8'); wg.addColorStop(1, '#0e4a8a');
  u.fillStyle = wg;
  for (let x = 0; x < tw; x++) {
    const wy = wTop + Math.round(Math.sin(x * 0.12 + loadT * 3) * 1.2 + Math.sin(x * 0.05 - loadT * 2) * 0.8);
    u.fillRect(tx + x, wy, 1, ty + th - wy);
    u.fillStyle = '#bff0ff'; u.fillRect(tx + x, wy, 1, 1); u.fillStyle = wg;
  }
  // caustic flecks and light shafts in the water
  u.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const sx = tx + tw * (0.15 + i * 0.25) + Math.sin(loadT * 0.6 + i) * 8; u.fillStyle = 'rgba(160,230,255,0.07)'; u.beginPath(); u.moveTo(sx - 4, wTop); u.lineTo(sx + 4, wTop); u.lineTo(sx + 14, ty + th); u.lineTo(sx - 6, ty + th); u.fill(); }
  for (let i = 0; i < 30; i++) { const fx = tx + ((i * 37 + loadT * 6) % tw), fy = ty + th - 10 - ((i * 13) % 20); if (fy > wTop) { u.fillStyle = `rgba(200,240,255,${0.12 + 0.1 * Math.sin(loadT * 3 + i)})`; u.fillRect(Math.round(fx), Math.round(fy), 2, 1); } }
  u.globalCompositeOperation = 'source-over';
  // gravel, pebbles, a swaying plant and a little shell
  for (let x = 0; x < tw; x++) { const gh = 4 + Math.round(Math.sin(x * 0.3) + Math.sin(x * 0.11) * 1.5); for (let j = 0; j < gh; j++) { u.fillStyle = ['#d8b880', '#b8945a', '#e8d0a0', '#a07a48'][(x * 7 + j * 13) % 4]; u.fillRect(tx + x, ty + th - j - 1, 1, 1); } }
  for (const [px, pc] of [[0.12, '#7a8aa0'], [0.2, '#a0a8b8'], [0.83, '#8a7a9a'], [0.9, '#9ab0c0']]) { u.fillStyle = pc; u.fillRect(Math.round(tx + tw * px), ty + th - 7, 5, 3); u.fillStyle = '#d8e0ea'; u.fillRect(Math.round(tx + tw * px) + 1, ty + th - 7, 2, 1); }
  for (let k = 0; k < 3; k++) {
    const bx = tx + tw * (0.07 + k * 0.035), hgt = th * (0.45 + k * 0.08);
    for (let i = 0; i < hgt; i++) { const wy = ty + th - 4 - i; if (wy < wTop + 2) break; const sx = bx + Math.sin(loadT * 1.6 + i * 0.12 + k) * (i / hgt) * 4; u.fillStyle = i % 6 < 3 ? '#3ab86a' : '#2a9a58'; u.fillRect(Math.round(sx), wy, 2, 1); }
  }
  u.fillStyle = '#ff9a8a'; u.fillRect(Math.round(tx + tw * 0.72), ty + th - 6, 6, 2); u.fillRect(Math.round(tx + tw * 0.72) + 1, ty + th - 7, 4, 1);
  // the pufferfish
  const S = Math.round(clamp(th * 0.26, 16, 34));
  const water = (wTop - ty) / th;
  if (!LP.init) { LP.init = true; LP.y = Math.max(water + 0.2, 0.6); }
  LP.mad = Math.max(0, LP.mad - dt);
  const want = LP.mad > 0.5 ? 1 : 0;
  LP.puff += (want - LP.puff) * Math.min(1, dt * (want ? 10 : 1.4));
  const rx = (S * (0.9 + 0.3 * LP.puff)) / tw, ry = (S * (0.7 + 0.4 * LP.puff)) / th;
  const top = water + ry + 0.03, bot = 1 - ry - 0.06;
  if (LP.puff > 0.5) {
    // a spiky ball: bounces off the glass, the gravel and the surface
    LP.vy += 0.5 * dt;
    LP.x += LP.vx * dt; LP.y += LP.vy * dt;
    if (LP.x < rx + 0.01) { LP.x = rx + 0.01; LP.vx = Math.abs(LP.vx) * 0.85; }
    if (LP.x > 1 - rx - 0.01) { LP.x = 1 - rx - 0.01; LP.vx = -Math.abs(LP.vx) * 0.85; }
    if (LP.y > bot) { LP.y = bot; LP.vy = -Math.abs(LP.vy) * 0.75 - 0.15; }
    if (LP.y < top) { LP.y = top; LP.vy = Math.abs(LP.vy) * 0.6; }
    LP.spin += LP.vx * dt * 6;
  } else {
    if (Math.random() < dt * 0.5 || Math.hypot(LP.goal[0] - LP.x, LP.goal[1] - LP.y) < 0.03) LP.goal = [0.2 + Math.random() * 0.6, clamp(top + 0.05 + Math.random() * 0.5, top, bot)];
    const dx = LP.goal[0] - LP.x, dy = LP.goal[1] - LP.y, d = Math.hypot(dx, dy) || 1;
    LP.x += (dx / d) * 0.12 * dt; LP.y += (dy / d) * 0.08 * dt;
    LP.y = clamp(LP.y, top, bot);
    if (Math.abs(dx) > 0.01) LP.face = dx > 0 ? 1 : -1;
    LP.spin *= 1 - Math.min(1, dt * 5); LP.vx *= 0.9; LP.vy *= 0.9;
    if (Math.random() < dt * 1.2) loadBubbles.push({ x: tx + LP.x * tw - LP.face * S * 0.7, y: ty + LP.y * th, r: 1, v: 14 + Math.random() * 10, ph: Math.random() * 6, inTank: true });
  }
  const px = Math.round(tx + LP.x * tw), py = Math.round(ty + LP.y * th + (LP.puff > 0.5 ? 0 : Math.sin(loadT * 3) * 1.5));
  const img = renderPuffer(S, Math.floor(loadT * 8) % PUFF_FRAMES, LP.puff, LP.mad > 0);
  // a soft shadow on the gravel
  u.globalAlpha = 0.25; u.fillStyle = '#1a1008'; u.beginPath(); u.ellipse(px, ty + th - 3, S * 0.6 * (0.5 + 0.5 * LP.y), 1.5, 0, 0, TAU); u.fill(); u.globalAlpha = 1;
  u.save(); u.translate(px, py); u.rotate(LP.puff > 0.5 ? LP.spin : 0); u.scale(-LP.face, 1); u.drawImage(img, -img.ox, -img.oy); u.restore();
  if (LP.mad > 0) {
    // a cross little anger mark and puffs of steam
    const ax = px + Math.round(S * 0.6), ay = py - Math.round(S * 0.8) - Math.round(Math.abs(Math.sin(loadT * 8)) * 2), k = 1 + Math.round(Math.sin(loadT * 12) * 0.5 + 0.5);
    u.fillStyle = '#ff2a3a';
    for (const [dx2, dy2] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { u.fillRect(ax + dx2 * k - (dx2 < 0 ? 1 : 0), ay + dy2 * k, 2, 1); u.fillRect(ax + dx2 * k, ay + dy2 * k - (dy2 < 0 ? 1 : 0), 1, 2); }
    for (let i = 0; i < 3; i++) { const q = (loadT * 1.5 + i / 3) % 1; u.globalAlpha = 0.7 * (1 - q); u.fillStyle = '#ffffff'; u.fillRect(Math.round(px - S * 0.5 - q * 6 + i * 3), Math.round(py - S * 0.7 - q * 10), 2 + (i % 2), 2); }
    u.globalAlpha = 1;
  }
  // bubbles: in the tank they stop at the surface, outside they drift up
  if (Math.random() < dt * 10) loadBubbles.push({ x: Math.random() * W, y: H + 4, r: Math.random() < 0.7 ? 1 : 2, v: 14 + Math.random() * 20, ph: Math.random() * 6 });
  for (const b of loadBubbles) { b.y -= b.v * dt; const s2 = bubbleSprite(b.r); u.globalAlpha = b.inTank ? 0.85 : 0.45; u.drawImage(s2, Math.round(b.x + Math.sin(loadT * 2 + b.ph) * 2) - s2.o, Math.round(b.y) - s2.o); }
  for (let i = loadBubbles.length - 1; i >= 0; i--) { const b = loadBubbles[i]; if (b.y < -8 || (b.inTank && b.y < loadWaterTop + 2)) loadBubbles.splice(i, 1); }
  u.globalAlpha = 1;
  // glass: a rim on top and two glints
  u.fillStyle = 'rgba(255,255,255,0.3)'; u.fillRect(tx + 4, ty + 4, 1, th - 12); u.fillRect(tx + 7, ty + 4, 1, Math.round(th * 0.3)); u.fillRect(tx + tw - 6, ty + Math.round(th * 0.5), 1, Math.round(th * 0.3));
  u.fillStyle = '#4a6a8a'; u.fillRect(tx - 4, ty - 4, tw + 8, 2);
  // progress, pokes and a tip
  const by = ty + th + 22;
  u.fillStyle = '#0a1a32'; u.fillRect(cx - 50, by, 100, 4);
  u.fillStyle = '#5ac8ff'; u.fillRect(cx - 50, by, Math.round(100 * clamp(loadP, 0, 1)), 4);
  u.fillStyle = '#bff0ff'; u.fillRect(cx - 50, by, Math.round(100 * clamp(loadP, 0, 1)), 1);
  drawText(u, `filling the tank... ${Math.round(loadP * 100)}%`, cx, by + 8, { align: 'center', color: '#9ad8ff' });
  const tip = LP.pokes ? (LP.pokes > 5 ? `${LP.pokes} pokes. he's furious` : `pokes: ${LP.pokes}`) : LOAD_TIPS[Math.floor(loadT / 2.6) % LOAD_TIPS.length];
  drawText(u, tip, cx, by + 20, { align: 'center', color: '#fff4b0', alpha: 0.65 + Math.sin(loadT * 3) * 0.2 });
  post.p.fade = 0;
  post.render(world, ui, loadT);
}

// -------------------------------------------------------------------- input --
function toLow(e) {
  const r = view.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
view.addEventListener('pointerdown', (e) => { if (isLoading) { const [x, y] = toLow(e); loaderTap(x, y); if (story) story.sound.unlock(); return; } if (story) { story.sound.unlock(); story.sound.retry(); if (story.vinyl) { story.vinyl.unlock(); story.vinyl.retry(); } const [x, y] = toLow(e); story.pointer('down', x, y); } });
view.addEventListener('pointermove', (e) => { if (story) { const [x, y] = toLow(e); story.pointer('move', x, y); view.classList.toggle('pointer', story.hoverClickable); } });
view.addEventListener('pointerup', (e) => { if (story) { const [x, y] = toLow(e); story.pointer('up', x, y); } });
window.addEventListener('keydown', (e) => { if (story && (e.key === ' ' || e.key === 'Enter')) { story.sound.unlock(); story.pointer('key', W / 2, H / 2); } });
// after the story: walk around with the arrow keys
const WALK_KEYS = { ArrowLeft: -1, a: -1, ArrowRight: 1, d: 1 };
window.addEventListener('keydown', (e) => { if (story && WALK_KEYS[e.key]) story.walkKey(WALK_KEYS[e.key], true); });
window.addEventListener('keyup', (e) => { if (story && WALK_KEYS[e.key]) story.walkKey(WALK_KEYS[e.key], false); });
window.addEventListener('resize', () => resize());
document.addEventListener('visibilitychange', () => {
  const snd = story && story.sound;
  if (!snd || !snd.ctx) return;
  const el = snd.source || snd.el;
  if (story.vinyl && story.vinyl.playing) { if (document.hidden) snd.ctx.suspend(); else snd.ctx.resume(); return; }
  if (document.hidden) { snd.ctx.suspend(); if (el && snd.playing) el.pause(); }
  else { snd.ctx.resume(); if (el && snd.playing) el.play().catch(() => {}); }
});

// -------------------------------------------------------------------- boot --
async function boot() {
  resize();
  let loading = true;
  isLoading = true;
  let last = performance.now();
  const loaderLoop = (now) => {
    if (!loading) return;
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    drawLoader(dt);
    requestAnimationFrame(loaderLoop);
  };
  requestAnimationFrame(loaderLoop);
  story = new Story(aq, post, { debug: params.get('scene'), rooms });
  story.worldCanvas = world; // photo mode prints from the rendered tank
  story.water = water;
  story.sound.sim = params.get('sim') === '1';
  const song = story.sound.load(); // decode in parallel with the art
  await rooms.jelly.build((p) => { loadP = p * 0.6; });
  await rooms.reef.build((p) => { loadP = 0.6 + p * 0.3; });
  await Promise.race([song, new Promise((r) => setTimeout(r, 6000))]);
  loadP = 1;
  loading = false;
  isLoading = false;
  // The big tank isn't on screen until the chorus: build it behind the title.
  story.mainReady = aq.build();
  story.resize(W, H);
  story.start();
  last = performance.now();
  let time = 0;
  let fpsAcc = 0, fpsN = 0;
  const loop = (now) => {
    const raw = (now - last) / 1000;
    fpsAcc += raw; fpsN++;
    if (fpsAcc > 1) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    const dt = clamp(raw, 0, 0.05) * SPEED;
    last = now;
    time += dt;
    B.left = 4; // ms of on-demand sprite rendering allowed this frame
    story.sound.update(dt);
    story.update(dt);
    story.stage.update(dt);
    story.stage.render(world.ctx);
    ui.ctx.clearRect(0, 0, W, H);
    story.draw(ui.ctx);
    water.update(dt, loading ? null : story.stage, story.sound.pulse);
    post.render(world, ui, time, water);
    pumpWarm(raw < 0.02 ? 5 : 2);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Test hook: advance the simulation without rendering.
  const step = async (sec) => {
    for (let t = 0; t < sec; t += 1 / 30) {
      story.sound.update(1 / 30); story.update(1 / 30); story.stage.update(1 / 30);
      for (let k = 0; k < 6; k++) await null; // let the story script's awaits resolve
    }
  };
  window.__app = { aq, rooms, story, post, step };
}

boot();
