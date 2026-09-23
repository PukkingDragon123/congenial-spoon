// WebGL2 compositor: pixel-exact upscale of the low-res world + UI layers,
// with mip-chain bloom, focus blur, ripple / warp distortions, flash, fade
// and vignette. Falls back to a plain 2D nearest-neighbour blit.

const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uW, uU;
uniform vec2 uRes;
uniform float uTime, uBlur, uBloom, uWarp, uDim, uFade, uVig, uUIGlow, uSat;
uniform vec4 uRip;      // center.xy (uv), radius, strength
uniform vec4 uFlash;    // rgb, amount
uniform vec3 uTint;

vec3 bloom(sampler2D s, vec2 uv){
  vec3 b = vec3(0.0);
  vec2 px = 1.0 / uRes;
  b += textureLod(s, uv, 2.0).rgb * 0.30;
  b += textureLod(s, uv + vec2(px.x*3.0, 0.0), 3.0).rgb * 0.12;
  b += textureLod(s, uv - vec2(px.x*3.0, 0.0), 3.0).rgb * 0.12;
  b += textureLod(s, uv + vec2(0.0, px.y*3.0), 3.0).rgb * 0.12;
  b += textureLod(s, uv - vec2(0.0, px.y*3.0), 3.0).rgb * 0.12;
  b += textureLod(s, uv, 4.5).rgb * 0.22;
  return b;
}
vec3 blurred(sampler2D s, vec2 uv, float lod){
  vec2 px = 1.0 / uRes * exp2(lod) * 0.6;
  vec3 c = textureLod(s, uv, lod).rgb * 0.4;
  c += textureLod(s, uv + vec2(px.x, px.y), lod).rgb * 0.15;
  c += textureLod(s, uv + vec2(-px.x, px.y), lod).rgb * 0.15;
  c += textureLod(s, uv + vec2(px.x, -px.y), lod).rgb * 0.15;
  c += textureLod(s, uv + vec2(-px.x, -px.y), lod).rgb * 0.15;
  return c;
}
void main(){
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  float ripLight = 0.0;
  if (uRip.w > 0.0) {
    vec2 d = uv - uRip.xy; d.x *= asp;
    float r = length(d);
    float band = (r - uRip.z);
    float env = exp(-band * band * 90.0);
    float wave = sin(band * 70.0) * env * uRip.w;
    uv -= normalize(d + 1e-5) * wave * 0.018 * vec2(1.0 / asp, 1.0);
    ripLight = max(0.0, wave) * 0.35;
  }
  if (uWarp > 0.0) {
    uv.x += sin(uv.y * 24.0 + uTime * 3.1) * 0.006 * uWarp;
    uv.y += cos(uv.x * 20.0 + uTime * 2.3) * 0.006 * uWarp;
  }
  uv = clamp(uv, vec2(0.0), vec2(0.99999));
  ivec2 ip = ivec2(floor(uv * uRes));
  vec3 w = texelFetch(uW, ip, 0).rgb;
  if (uBlur > 0.001) w = mix(w, blurred(uW, uv, 1.2 + uBlur * 1.6), clamp(uBlur * 1.4, 0.0, 1.0));
  vec3 bw = bloom(uW, uv);
  w += max(bw - 0.5, 0.0) * uBloom * 1.3 + bw * uBloom * 0.08;
  w *= (1.0 - uDim);
  // saturation / tint grade
  float l = dot(w, vec3(0.299, 0.587, 0.114));
  w = mix(vec3(l), w, uSat) * uTint;
  vec4 u = texelFetch(uU, ip, 0);
  vec3 ub = bloom(uU, uv);
  vec3 col = mix(w, u.rgb, u.a);
  col += ub * uUIGlow;
  col += ripLight * vec3(0.6, 0.85, 1.0);
  // vignette
  vec2 q = vUv - 0.5; q.x *= asp * 0.8;
  col *= 1.0 - uVig * smoothstep(0.35, 1.05, length(q));
  col = mix(col, uFlash.rgb, uFlash.a);
  col *= (1.0 - uFade);
  o = vec4(col, 1.0);
}`;

export class Post {
  constructor(canvas) {
    this.canvas = canvas;
    this.p = { blur: 0, bloom: 0.75, warp: 0, dim: 0, fade: 0, vig: 0.55, uiGlow: 0.55, sat: 1, tint: [1, 1, 1], rip: [0.5, 0.5, 0, 0], flash: [1, 1, 1, 0] };
    let gl = null;
    const noGL = typeof location !== 'undefined' && /[?&]gl=0/.test(location.search);
    if (!noGL) try { gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (gl && this.init(gl)) { this.gl = gl; return; }
    this.gl = null;
    this.ctx = canvas.getContext('2d');
  }

  init(gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return false; }
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const mk = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tW = mk(); this.tU = mk();
    this.u = {};
    for (const n of ['uW', 'uU', 'uRes', 'uTime', 'uBlur', 'uBloom', 'uWarp', 'uDim', 'uFade', 'uVig', 'uUIGlow', 'uSat', 'uRip', 'uFlash', 'uTint']) this.u[n] = gl.getUniformLocation(prog, n);
    return true;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  render(world, ui, time) {
    const p = this.p;
    if (!this.gl) {
      const c = this.ctx;
      c.imageSmoothingEnabled = false;
      c.globalAlpha = 1;
      c.drawImage(world, 0, 0, this.canvas.width, this.canvas.height);
      if (p.dim > 0) { c.fillStyle = `rgba(0,0,0,${p.dim})`; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      c.drawImage(ui, 0, 0, this.canvas.width, this.canvas.height);
      if (p.flash[3] > 0) { c.fillStyle = `rgba(${p.flash[0] * 255 | 0},${p.flash[1] * 255 | 0},${p.flash[2] * 255 | 0},${p.flash[3]})`; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      if (p.fade > 0) { c.fillStyle = `rgba(0,0,0,${p.fade})`; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      return;
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tW);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, world);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tU);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ui);
    gl.generateMipmap(gl.TEXTURE_2D);
    const u = this.u;
    gl.uniform1i(u.uW, 0); gl.uniform1i(u.uU, 1);
    gl.uniform2f(u.uRes, world.width, world.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBlur, p.blur);
    gl.uniform1f(u.uBloom, p.bloom);
    gl.uniform1f(u.uWarp, p.warp);
    gl.uniform1f(u.uDim, p.dim);
    gl.uniform1f(u.uFade, p.fade);
    gl.uniform1f(u.uVig, p.vig);
    gl.uniform1f(u.uUIGlow, p.uiGlow);
    gl.uniform1f(u.uSat, p.sat);
    gl.uniform4f(u.uRip, ...p.rip);
    gl.uniform4f(u.uFlash, ...p.flash);
    gl.uniform3f(u.uTint, ...p.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
