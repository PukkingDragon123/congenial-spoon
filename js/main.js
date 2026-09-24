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
function drawLoader(dt) {
  loadT += dt;
  const c = world.ctx;
  c.fillStyle = '#02040c';
  c.fillRect(0, 0, W, H);
  const u = ui.ctx;
  u.clearRect(0, 0, W, H);
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  // progress: a row of bubbles filling up
  const n = 12;
  for (let i = 0; i < n; i++) {
    const on = i / n < loadP;
    const b = bubbleSprite(on ? 2 : 1);
    u.globalAlpha = on ? 1 : 0.3;
    u.drawImage(b, cx - n * 4 + i * 8 - b.o + 4, cy - b.o + Math.round(on ? Math.sin(loadT * 5 + i) : 0));
  }
  u.globalAlpha = 1;
  drawText(u, 'filling the tank...', cx, cy + 12, { align: 'center', color: '#6aa8e8' });
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
