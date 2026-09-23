// Boot: sizing, asset generation with a loader, the main loop and input.
import { makeCanvas, clamp } from './util.js';
import { Post } from './post.js';
import { Aquarium, CX, CY } from './world/scene.js';
import { Story } from './story/story.js';
import { drawText } from './font.js';
import { heartSprite, bubbleSprite } from './world/fx.js';
import { B, pumpWarm } from './art/budget.js';

const params = new URLSearchParams(location.search);
const SPEED = +(params.get('speed') || 1);

const view = document.getElementById('view');
const post = new Post(view);
const world = makeCanvas(2, 2);
const ui = makeCanvas(2, 2);
const aq = new Aquarium();
let story = null;
let W = 0, H = 0, S = 1, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  const dw = Math.round(window.innerWidth * DPR), dh = Math.round(window.innerHeight * DPR);
  let s = Math.max(1, Math.floor(dh / 330));
  s = Math.max(1, Math.min(s, Math.floor(dw / 240)));
  S = s;
  W = Math.ceil(dw / s);
  H = Math.ceil(dh / s);
  for (const c of [world, ui]) { c.width = W; c.height = H; c.ctx.imageSmoothingEnabled = false; }
  post.resize(W * s, H * s);
  view.style.width = (W * s) / DPR + 'px';
  view.style.height = (H * s) / DPR + 'px';
  aq.resize(W, H);
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
  const hs = heartSprite(2);
  const beat = 1 + Math.max(0, Math.sin(loadT * 6)) * 0.0;
  u.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(loadT * 3));
  u.drawImage(hs, cx - hs.ox, cy - 18 - hs.oy + Math.round(Math.sin(loadT * 2) * 2));
  u.globalAlpha = 1;
  // progress: a row of bubbles filling up
  const n = 12;
  for (let i = 0; i < n; i++) {
    const on = i / n < loadP;
    const b = bubbleSprite(on ? 2 : 1);
    u.globalAlpha = on ? 1 : 0.3;
    u.drawImage(b, cx - n * 4 + i * 8 - b.o + 4, cy + 4 - b.o + Math.round(on ? Math.sin(loadT * 5 + i) : 0));
  }
  u.globalAlpha = 1;
  drawText(u, 'filling the tank...', cx, cy + 16, { align: 'center', color: '#6aa8e8' });
  post.p.fade = 0;
  post.render(world, ui, loadT);
  void beat;
}

// -------------------------------------------------------------------- input --
function toLow(e) {
  const r = view.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
view.addEventListener('pointerdown', (e) => { if (story) { const [x, y] = toLow(e); story.pointer('down', x, y); } });
view.addEventListener('pointermove', (e) => { if (story) { const [x, y] = toLow(e); story.pointer('move', x, y); view.classList.toggle('pointer', story.hoverClickable); } });
view.addEventListener('pointerup', (e) => { if (story) { const [x, y] = toLow(e); story.pointer('up', x, y); } });
window.addEventListener('keydown', (e) => { if (story && (e.key === ' ' || e.key === 'Enter')) story.pointer('key', W / 2, H / 2); });
window.addEventListener('resize', () => resize());
document.addEventListener('visibilitychange', () => {
  const snd = story && story.sound;
  if (!snd || !snd.ctx) return;
  if (document.hidden) snd.ctx.suspend(); else if (snd.enabled) snd.ctx.resume();
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
  await aq.build((p) => { loadP = p; });
  loading = false;
  story = new Story(aq, post, { debug: params.get('scene') });
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
    story.update(dt);
    aq.update(dt);
    aq.render(world.ctx);
    ui.ctx.clearRect(0, 0, W, H);
    story.draw(ui.ctx);
    post.render(world, ui, time);
    pumpWarm(raw < 0.02 ? 5 : 2);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Test hook: advance the simulation without rendering.
  const step = async (sec) => {
    for (let t = 0; t < sec; t += 1 / 30) {
      story.update(1 / 30); aq.update(1 / 30);
      for (let k = 0; k < 6; k++) await null; // let the story script's awaits resolve
    }
  };
  window.__app = { aq, story, post, step };
}

boot();
