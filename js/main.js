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
let loadT = 0;
const LOAD_TIPS = ['tip: tap the pufferfish. he hates it', 'tip: rare animals pay more coins', 'tip: headphones on for the best bit', 'tip: centre your shot for a bonus', 'tip: the notebook is a jigsaw book'];
const loadBubbles = [];
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
  // bubbles drifting up
  if (Math.random() < dt * 14) loadBubbles.push({ x: Math.random() * W, y: H + 4, r: Math.random() < 0.7 ? 1 : 2, v: 14 + Math.random() * 20, ph: Math.random() * 6 });
  for (const b of loadBubbles) { b.y -= b.v * dt; const s2 = bubbleSprite(b.r); u.globalAlpha = 0.6; u.drawImage(s2, Math.round(b.x + Math.sin(loadT * 2 + b.ph) * 3) - s2.o, Math.round(b.y) - s2.o); }
  for (let i = loadBubbles.length - 1; i >= 0; i--) if (loadBubbles[i].y < -8) loadBubbles.splice(i, 1);
  u.globalAlpha = 1;
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  drawText(u, 'Very Cool Aquarium Game', cx, cy - 44, { align: 'center', color: '#d8f0ff', outline: '#0a1a44', shadow: '#ff5a9a', scale: W > 360 ? 2 : 1 });
  // a little glass tank filling up with water
  const tw = 70, th = 40, tx = cx - tw / 2, ty = cy - 14;
  u.fillStyle = '#0e2448'; u.fillRect(tx - 2, ty - 2, tw + 4, th + 4);
  u.fillStyle = '#081a36'; u.fillRect(tx, ty, tw, th);
  const lvl = Math.round(th * clamp(loadP, 0, 1));
  for (let x = 0; x < tw; x++) {
    const wy = ty + th - lvl + Math.round(Math.sin(x * 0.3 + loadT * 4) * 1);
    const hgt = ty + th - wy;
    if (hgt <= 0) continue;
    u.fillStyle = '#2a8ad8'; u.fillRect(tx + x, wy, 1, hgt);
    u.fillStyle = '#9ae0ff'; u.fillRect(tx + x, wy, 1, 1);
  }
  // a little fish swimming in it once there's enough water
  if (lvl > 10) {
    const fx = tx + 8 + ((loadT * 18) % (tw - 16)), fy = ty + th - Math.min(lvl, th) / 2 + Math.sin(loadT * 3) * 2;
    u.fillStyle = '#ff8a3a'; u.fillRect(Math.round(fx), Math.round(fy), 5, 3); u.fillRect(Math.round(fx) - 2, Math.round(fy) - 1, 2, 5);
    u.fillStyle = '#ffffff'; u.fillRect(Math.round(fx) + 1, Math.round(fy), 1, 3);
    u.fillStyle = '#1a1020'; u.fillRect(Math.round(fx) + 4, Math.round(fy), 1, 1);
  }
  u.fillStyle = 'rgba(255,255,255,0.35)'; u.fillRect(tx + 3, ty + 3, 1, th - 8); u.fillRect(tx + 5, ty + 3, 1, 6);
  u.fillStyle = '#5a4a3a'; u.fillRect(tx - 4, ty + th + 2, tw + 8, 3);
  drawText(u, `filling the tank... ${Math.round(loadP * 100)}%`, cx, ty + th + 10, { align: 'center', color: '#9ad8ff' });
  const tip = LOAD_TIPS[Math.floor(loadT / 2.6) % LOAD_TIPS.length];
  drawText(u, tip, cx, ty + th + 24, { align: 'center', color: '#fff4b0', alpha: 0.6 + Math.sin(loadT * 3) * 0.2 });
  post.p.fade = 0;
  post.render(world, ui, loadT);
}

// -------------------------------------------------------------------- input --
function toLow(e) {
  const r = view.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
view.addEventListener('pointerdown', (e) => { if (story) { story.sound.unlock(); story.sound.retry(); const [x, y] = toLow(e); story.pointer('down', x, y); } });
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
