// Procedural pixel-art fish. Each species is an implicit side-view shape
// (profile curves + fin polygons) that is evaluated per output pixel, so any
// size, pitch and swim frame renders pixel-crisp with consistent shading.
import { TAU, clamp, smoothstep, fract, curve, pointInPoly, ramp, bayer, fbm, hash2, Buf, hex, mixRGB } from '../util.js';
import { B, timed, queueWarm } from './budget.js';

const P = (stops, n) => ramp(stops, n);

// ---------------------------------------------------------------- species --
export const SPECIES = {
  trevally: {
    frames: 8, be: 0.78, swing: 0.34, wob: 0.022,
    top: [[0, 0.02], [0.03, -0.035], [0.08, -0.105], [0.18, -0.165], [0.3, -0.19], [0.42, -0.18], [0.56, -0.12], [0.68, -0.06], [0.78, -0.026]],
    bot: [[0, 0.03], [0.04, 0.07], [0.12, 0.13], [0.25, 0.16], [0.38, 0.152], [0.52, 0.11], [0.66, 0.058], [0.78, 0.026]],
    tail: [[0, -0.026], [0.06, -0.09], [0.2, -0.2], [0.23, -0.19], [0.13, -0.07], [0.1, 0], [0.13, 0.07], [0.23, 0.19], [0.2, 0.2], [0.06, 0.09], [0, 0.026]],
    fins: [
      { pts: [[0.29, -0.17], [0.32, -0.225], [0.35, -0.23], [0.38, -0.175]], up: 1 },
      { pts: [[0.4, -0.17], [0.44, -0.275], [0.47, -0.26], [0.52, -0.16], [0.64, -0.1], [0.73, -0.05], [0.72, -0.03]], up: 1 },
      { pts: [[0.44, 0.13], [0.49, 0.225], [0.52, 0.21], [0.56, 0.13], [0.66, 0.08], [0.73, 0.045], [0.72, 0.03]], up: 0 },
      { pts: [[0.23, 0.15], [0.27, 0.215], [0.3, 0.2], [0.29, 0.15]], up: 0 },
    ],
    pect: { pivot: [0.21, 0.035], pts: [[0.2, 0.02], [0.25, 0.005], [0.43, 0.035], [0.45, 0.055], [0.3, 0.058], [0.21, 0.052]], flap: 0.18, mix: 0.38, lvl: 4.2 },
    eye: { u: 0.075, v: -0.038, r: 0.032, iris: '#e6c65a' },
    mouth: [[0.0, 0.028], [0.035, 0.036]],
    operc: 0.175,
    pal: {
      body: P(['#0f2350', '#1d3d73', '#2b5693', '#4274b2', '#679dd3', '#98c6ec', '#cde8fc', '#ffffff'], 8),
      fin: P(['#2b4764', '#5a7a6a', '#93ac6c', '#c6d27c', '#ebe8a4', '#fbf8d8'], 6),
    },
    shade: [[0, 1.2], [0.1, 2.0], [0.26, 3.6], [0.42, 5.4], [0.6, 6.2], [0.85, 6.5], [1, 4.5]],
    bars: { n: 5.5, u0: 0.18, u1: 0.62, t0: 0.05, t1: 0.55, w: 0.28, amt: 0.7 },
    lateral: { t: [[0.15, 0.42], [0.3, 0.3], [0.45, 0.36], [0.78, 0.5]], scutes: 0.52 },
    scales: 44, finBase: 3.2, finTip: 1.0, tailLvl: [3.4, 1.4], finAlpha: 235,
  },
  giant: {
    frames: 8, be: 0.77, swing: 0.32, wob: 0.02,
    top: [[0, 0.03], [0.02, -0.02], [0.06, -0.09], [0.14, -0.155], [0.28, -0.19], [0.42, -0.18], [0.56, -0.12], [0.68, -0.06], [0.77, -0.028]],
    bot: [[0, 0.04], [0.04, 0.08], [0.12, 0.135], [0.25, 0.165], [0.38, 0.155], [0.52, 0.11], [0.66, 0.058], [0.77, 0.028]],
    tail: [[0, -0.028], [0.06, -0.09], [0.21, -0.21], [0.24, -0.2], [0.13, -0.07], [0.1, 0], [0.13, 0.07], [0.24, 0.2], [0.21, 0.21], [0.06, 0.09], [0, 0.028]],
    fins: [
      { pts: [[0.28, -0.17], [0.31, -0.22], [0.34, -0.225], [0.37, -0.175]], up: 1 },
      { pts: [[0.4, -0.17], [0.44, -0.27], [0.47, -0.255], [0.52, -0.16], [0.64, -0.1], [0.72, -0.05], [0.71, -0.03]], up: 1 },
      { pts: [[0.44, 0.13], [0.49, 0.225], [0.52, 0.21], [0.56, 0.13], [0.66, 0.08], [0.72, 0.045], [0.71, 0.03]], up: 0 },
    ],
    pect: { pivot: [0.2, 0.04], pts: [[0.19, 0.03], [0.24, 0.012], [0.42, 0.045], [0.44, 0.065], [0.29, 0.066], [0.2, 0.06]], flap: 0.16, mix: 0.5, lvl: 3 },
    eye: { u: 0.07, v: -0.03, r: 0.026, iris: '#b8c0c8' },
    mouth: [[0.0, 0.04], [0.045, 0.05]],
    operc: 0.17,
    pal: {
      body: P(['#0a1733', '#152a52', '#213f6e', '#33598c', '#4d78a9', '#739dc6', '#a4c4e2', '#dbeaf8'], 8),
      fin: P(['#101c34', '#1f2f4c', '#34496a', '#50668a', '#7187a8', '#9cb0c8'], 6),
    },
    shade: [[0, 1], [0.12, 1.8], [0.28, 3.1], [0.45, 4.6], [0.65, 5.6], [0.88, 6.2], [1, 4.2]],
    lateral: { t: [[0.15, 0.42], [0.3, 0.3], [0.45, 0.36], [0.77, 0.5]], scutes: 0.5 },
    speckle: 0.5,
    scales: 40, finBase: 2.6, finTip: 0.8, tailLvl: [2.8, 1.0], finAlpha: 240,
  },
  bait: {
    frames: 6, be: 0.8, swing: 0.3, wob: 0.03,
    top: [[0, 0.012], [0.08, -0.05], [0.25, -0.095], [0.45, -0.1], [0.65, -0.06], [0.8, -0.022]],
    bot: [[0, 0.02], [0.1, 0.06], [0.3, 0.09], [0.5, 0.085], [0.68, 0.05], [0.8, 0.022]],
    tail: [[0, -0.02], [0.12, -0.1], [0.16, -0.1], [0.09, -0.02], [0.09, 0.02], [0.16, 0.1], [0.12, 0.1], [0, 0.02]],
    fins: [{ pts: [[0.36, -0.075], [0.42, -0.13], [0.48, -0.075]], up: 1 }],
    pect: null,
    eye: { u: 0.09, v: -0.012, r: 0.02 },
    pal: {
      body: P(['#12305f', '#24528e', '#3f7cbc', '#74b0e2', '#b4dcf6', '#e4f6ff'], 6),
      fin: P(['#4a78ac', '#86b2dc', '#c6e2fa'], 3),
    },
    shade: [[0, 0.6], [0.2, 1.4], [0.42, 3.6], [0.6, 4.6], [0.85, 4.8], [1, 3.4]],
    stripe: { t: 0.44, w: 0.12, amt: 0.9 },
    finBase: 1.2, finTip: 0.4, tailLvl: [1.3, 0.8], finAlpha: 210,
  },
  shark: {
    rays: false, dither: 0.45,
    frames: 12, be: 0.74, swing: 0.3, wob: 0.014, bodyWob: 0.01,
    top: [[0, 0.012], [0.03, -0.018], [0.08, -0.043], [0.18, -0.072], [0.32, -0.088], [0.45, -0.084], [0.58, -0.064], [0.68, -0.042], [0.74, -0.027]],
    bot: [[0, 0.016], [0.04, 0.04], [0.1, 0.064], [0.22, 0.085], [0.36, 0.09], [0.5, 0.075], [0.62, 0.05], [0.74, 0.024]],
    tail: [[0, -0.027], [0.07, -0.06], [0.16, -0.1], [0.22, -0.125], [0.23, -0.112], [0.18, -0.06], [0.13, -0.012], [0.115, 0.02], [0.1, 0.06], [0.08, 0.09], [0.06, 0.085], [0.04, 0.05], [0, 0.024]],
    fins: [
      { pts: [[0.35, -0.084], [0.4, -0.165], [0.43, -0.17], [0.45, -0.16], [0.5, -0.075]], up: 1 },
      { pts: [[0.59, -0.062], [0.63, -0.13], [0.66, -0.13], [0.69, -0.046]], up: 1 },
      { pts: [[0.51, 0.072], [0.56, 0.115], [0.58, 0.112], [0.58, 0.064]], up: 0 },
      { pts: [[0.63, 0.048], [0.66, 0.085], [0.685, 0.083], [0.69, 0.04]], up: 0 },
    ],
    pect: { pivot: [0.22, 0.07], pts: [[0.19, 0.055], [0.24, 0.052], [0.29, 0.11], [0.3, 0.15], [0.285, 0.152], [0.25, 0.11], [0.2, 0.08]], flap: 0.06, mix: 0.9, lvl: 3.4 },
    eye: { u: 0.085, v: -0.012, r: 0.011, shark: true },
    mouth: [[0.035, 0.034], [0.07, 0.05], [0.12, 0.052]],
    teeth: true,
    gills: { u0: 0.175, u1: 0.235, n: 5, t0: 0.3, t1: 0.75 },
    pal: {
      body: P(['#101c34', '#1d2e4e', '#2b4268', '#3c5782', '#4f6d99', '#6887af', '#8aa6c6', '#b6cade', '#e2ecf6'], 9),
      fin: P(['#101c34', '#1d2e4e', '#2b4268', '#3c5782', '#4f6d99', '#6887af', '#8aa6c6'], 7),
    },
    shade: [[0, 2.6], [0.15, 3.6], [0.4, 4.6], [0.58, 5.2], [0.64, 7.4], [0.8, 8], [1, 5.6]],
    spots: { scale: 26, thr: 0.74, amt: 1.3, t1: 0.6 },
    scales: 999, finBase: 4.2, finTip: 3.4, tailLvl: [4.2, 3.0], finAlpha: 255,
  },
  reefshark: {
    rays: false, dither: 0.45,
    frames: 12, be: 0.72, swing: 0.3, wob: 0.014, bodyWob: 0.01,
    top: [[0, 0.02], [0.03, -0.01], [0.08, -0.04], [0.18, -0.07], [0.32, -0.084], [0.45, -0.078], [0.58, -0.058], [0.68, -0.038], [0.72, -0.026]],
    bot: [[0, 0.024], [0.04, 0.045], [0.1, 0.066], [0.22, 0.082], [0.36, 0.08], [0.5, 0.064], [0.62, 0.042], [0.72, 0.022]],
    tail: [[0, -0.026], [0.07, -0.07], [0.19, -0.14], [0.27, -0.175], [0.275, -0.16], [0.2, -0.08], [0.13, -0.012], [0.12, 0.015], [0.12, 0.06], [0.1, 0.1], [0.07, 0.09], [0.03, 0.04], [0, 0.022]],
    fins: [
      { pts: [[0.28, -0.08], [0.34, -0.18], [0.37, -0.19], [0.39, -0.175], [0.44, -0.078]], up: 1, tip: 1 },
      { pts: [[0.6, -0.054], [0.63, -0.085], [0.65, -0.084], [0.67, -0.044]], up: 1 },
      { pts: [[0.47, 0.066], [0.51, 0.1], [0.53, 0.098], [0.53, 0.06]], up: 0 },
    ],
    pect: { pivot: [0.2, 0.07], pts: [[0.17, 0.055], [0.22, 0.052], [0.28, 0.12], [0.29, 0.16], [0.275, 0.162], [0.23, 0.115], [0.18, 0.08]], flap: 0.06, mix: 0.9, lvl: 3.4 },
    eye: { u: 0.08, v: -0.006, r: 0.011, shark: true },
    mouth: [[0.04, 0.042], [0.09, 0.056]],
    gills: { u0: 0.165, u1: 0.215, n: 5, t0: 0.3, t1: 0.72 },
    pal: {
      body: P(['#0c1628', '#18263e', '#253854', '#344b6c', '#465f84', '#5d779c', '#7e97b6', '#aabdd2', '#dde6f0'], 9),
      fin: P(['#070c18', '#0f1a2e', '#1f3048', '#304562', '#435b7c', '#5b7496', '#7a92b0'], 7),
    },
    shade: [[0, 2.8], [0.15, 3.6], [0.4, 4.4], [0.56, 5], [0.62, 7.2], [0.8, 7.8], [1, 5.4]],
    tailTip: 1,
    scales: 999, finBase: 4.4, finTip: 0.6, tailLvl: [4.4, 1.0], finAlpha: 255,
  },
  grouper: {
    dither: 0.6,
    frames: 10, be: 0.8, swing: 0.24, wob: 0.016,
    top: [[0, 0.045], [0.03, -0.01], [0.1, -0.085], [0.22, -0.14], [0.4, -0.16], [0.58, -0.125], [0.72, -0.085], [0.8, -0.068]],
    bot: [[0, 0.07], [0.05, 0.11], [0.14, 0.155], [0.3, 0.172], [0.5, 0.152], [0.66, 0.105], [0.8, 0.068]],
    tail: [[0, -0.068], [0.08, -0.11], [0.15, -0.105], [0.19, -0.05], [0.2, 0], [0.19, 0.05], [0.15, 0.105], [0.08, 0.11], [0, 0.068]],
    fins: [
      { pts: [[0.18, -0.12], [0.21, -0.185], [0.3, -0.205], [0.42, -0.21], [0.52, -0.19], [0.55, -0.14]], up: 1 },
      { pts: [[0.53, -0.14], [0.6, -0.215], [0.7, -0.17], [0.76, -0.09], [0.74, -0.07]], up: 1 },
      { pts: [[0.54, 0.135], [0.6, 0.205], [0.68, 0.19], [0.74, 0.1], [0.72, 0.08]], up: 0 },
      { pts: [[0.25, 0.16], [0.3, 0.225], [0.35, 0.215], [0.34, 0.16]], up: 0 },
    ],
    pect: { pivot: [0.22, 0.05], pts: [[0.21, 0.02], [0.28, 0.0], [0.36, 0.03], [0.37, 0.08], [0.3, 0.11], [0.22, 0.09]], flap: 0.22 },
    eye: { u: 0.1, v: -0.025, r: 0.024, iris: '#c8a868' },
    mouth: [[0.0, 0.055], [0.06, 0.07], [0.13, 0.068]],
    lip: true,
    operc: 0.2,
    pal: {
      body: P(['#12151f', '#1f2433', '#2e3548', '#40485e', '#555e76', '#6d778e', '#8a93a6', '#adb5c4'], 8),
      fin: P(['#141824', '#232a3a', '#343c50', '#4a5368', '#636c82'], 5),
    },
    shade: [[0, 2.2], [0.2, 3.4], [0.5, 4.2], [0.8, 4.8], [1, 3.2]],
    blotch: { scale: 9, thr: 0.54, amt: 1.6 },
    freckle: { n: 60, amt: 1.2 },
    scales: 999, finBase: 2.4, finTip: 0.6, tailLvl: [2.4, 1.0], finAlpha: 255, finSpots: true,
  },
  butterfly: {
    frames: 6, be: 0.8, swing: 0.26, wob: 0.025,
    top: [[0, 0.0], [0.06, -0.06], [0.14, -0.2], [0.28, -0.3], [0.45, -0.32], [0.62, -0.26], [0.74, -0.14], [0.8, -0.05]],
    bot: [[0, 0.012], [0.08, 0.08], [0.2, 0.2], [0.36, 0.27], [0.52, 0.26], [0.66, 0.18], [0.76, 0.09], [0.8, 0.05]],
    tail: [[0, -0.05], [0.1, -0.09], [0.17, -0.085], [0.19, 0], [0.17, 0.085], [0.1, 0.09], [0, 0.05]],
    fins: [
      { pts: [[0.4, -0.3], [0.6, -0.33], [0.74, -0.2], [0.8, -0.06], [0.7, -0.1]], up: 1 },
      { pts: [[0.45, 0.26], [0.62, 0.3], [0.74, 0.18], [0.8, 0.06], [0.7, 0.1]], up: 0 },
    ],
    pect: { pivot: [0.26, 0.04], pts: [[0.25, 0.02], [0.33, 0.0], [0.36, 0.05], [0.26, 0.07]], flap: 0.3 },
    eye: { u: 0.15, v: -0.05, r: 0.028, hide: true },
    pal: {
      body: P(['#4c5a38', '#7b8a48', '#a8b85c', '#cfdb7a', '#ecf0aa', '#fbfbe2'], 6),
      fin: P(['#5a6a3c', '#8a9a4c', '#c0cc6a', '#e8ec9c'], 4),
      b: P(['#46628c', '#7fa0c8', '#c2d8f0', '#f4fbff'], 4),
      a: P(['#070b16', '#121a30'], 2),
    },
    shade: [[0, 2.6], [0.3, 3.8], [0.7, 4.4], [1, 3]],
    marks: (u, t, v) => {
      if (Math.abs(u - 0.15 - (t - 0.5) * 0.04) < 0.028 && t < 0.78) return { p: 'a', l: 0.5 };
      if (u < 0.5 - Math.sin(t * 3.14) * 0.08) return { p: 'b', l: 3.2 - t * 0.8 };
      const sp = Math.hypot(u - 0.68, v + 0.12);
      if (sp < 0.03) return { p: 'a', l: 0.5 };
      if (sp < 0.045) return { p: 'b', l: 3 };
      return null;
    },
    finBase: 2.4, finTip: 0.6, tailLvl: [2.6, 1.6], finAlpha: 245,
  },
  tang: {
    frames: 6, be: 0.78, swing: 0.28, wob: 0.024,
    top: [[0, 0.01], [0.05, -0.06], [0.15, -0.17], [0.32, -0.235], [0.5, -0.225], [0.66, -0.15], [0.78, -0.05]],
    bot: [[0, 0.03], [0.06, 0.08], [0.18, 0.17], [0.35, 0.215], [0.52, 0.195], [0.68, 0.12], [0.78, 0.05]],
    tail: [[0, -0.05], [0.12, -0.14], [0.2, -0.17], [0.15, -0.06], [0.13, 0], [0.15, 0.06], [0.2, 0.17], [0.12, 0.14], [0, 0.05]],
    fins: [
      { pts: [[0.15, -0.16], [0.25, -0.285], [0.55, -0.29], [0.72, -0.15], [0.76, -0.06]], up: 1 },
      { pts: [[0.25, 0.2], [0.4, 0.29], [0.65, 0.22], [0.76, 0.07]], up: 0 },
    ],
    pect: { pivot: [0.24, 0.03], pts: [[0.23, 0.01], [0.33, -0.01], [0.37, 0.04], [0.25, 0.06]], flap: 0.3, pal: 'y' },
    eye: { u: 0.1, v: -0.035, r: 0.028 },
    pal: {
      body: P(['#0a1a5c', '#132c8c', '#1f44bc', '#3563e0', '#6590f4', '#a8c6ff'], 6),
      fin: P(['#060c30', '#0e1a58', '#1a3090', '#2c50c8', '#4c78ec'], 5),
      a: P(['#03050e', '#0c1230', '#18214a'], 3),
      y: P(['#7a6a1c', '#b8a232', '#e8d052', '#fff29a'], 4),
    },
    shade: [[0, 2], [0.3, 3.2], [0.6, 3.8], [0.9, 4.2], [1, 3]],
    marks: (u, t, v) => {
      const c = 0.3 + (u - 0.45) * 0.3;
      const band = Math.abs(t - c) < 0.13 + Math.sin(clamp((u - 0.15) / 0.6) * 3.14) * 0.06;
      if (u > 0.14 && u < 0.76 && band) {
        if (Math.hypot((u - 0.46) * 1.2, t - c) < 0.07) return { p: null, l: 4.2 };
        return { p: 'a', l: 1.2 };
      }
      return null;
    },
    tailPal: 'y',
    finBase: 2.2, finTip: 0.5, tailLvl: [2.6, 1.8], finAlpha: 250,
  },
  snapper: {
    frames: 8, be: 0.78, swing: 0.3, wob: 0.022,
    top: [[0, 0.015], [0.05, -0.048], [0.14, -0.118], [0.3, -0.158], [0.48, -0.15], [0.64, -0.1], [0.78, -0.045]],
    bot: [[0, 0.03], [0.06, 0.07], [0.18, 0.118], [0.36, 0.13], [0.54, 0.11], [0.68, 0.07], [0.78, 0.045]],
    tail: [[0, -0.045], [0.1, -0.1], [0.2, -0.155], [0.22, -0.14], [0.14, -0.05], [0.12, 0], [0.14, 0.05], [0.22, 0.14], [0.2, 0.155], [0.1, 0.1], [0, 0.045]],
    fins: [
      { pts: [[0.24, -0.15], [0.3, -0.225], [0.5, -0.21], [0.62, -0.19], [0.7, -0.12], [0.74, -0.06]], up: 1 },
      { pts: [[0.5, 0.11], [0.56, 0.18], [0.64, 0.16], [0.7, 0.075]], up: 0 },
    ],
    pect: { pivot: [0.22, 0.03], pts: [[0.21, 0.02], [0.3, 0.0], [0.36, 0.04], [0.22, 0.05]], flap: 0.22 },
    eye: { u: 0.085, v: -0.035, r: 0.028, iris: '#f0d060' },
    mouth: [[0.0, 0.028], [0.04, 0.034]],
    pal: {
      body: P(['#5a4a1e', '#8c7a2c', '#bca840', '#dccc62', '#f0e49a', '#fcf8d8'], 6),
      fin: P(['#6c5c24', '#a89038', '#dcc456', '#f6e690'], 4),
      a: P(['#10306e', '#2a64c4', '#6aa6f2', '#c0e2ff'], 4),
    },
    shade: [[0, 1.6], [0.2, 2.6], [0.5, 3.4], [0.8, 4.4], [1, 3.4]],
    marks: (u, t) => {
      if (u < 0.1 || u > 0.74) return null;
      for (const st of [0.24, 0.39, 0.54, 0.69]) {
        const d = Math.abs(t - st);
        if (d < 0.032) return { p: 'a', l: d < 0.014 ? 2.4 : 1.2 };
      }
      return null;
    },
    finBase: 2.2, finTip: 0.8, tailLvl: [2.4, 1.2], finAlpha: 245,
  },
  batfish: {
    frames: 8, be: 0.8, swing: 0.24, wob: 0.02,
    top: [[0, 0.02], [0.05, -0.06], [0.12, -0.16], [0.25, -0.24], [0.42, -0.26], [0.58, -0.22], [0.72, -0.12], [0.8, -0.05]],
    bot: [[0, 0.04], [0.06, 0.1], [0.16, 0.2], [0.3, 0.26], [0.46, 0.26], [0.6, 0.2], [0.72, 0.11], [0.8, 0.05]],
    tail: [[0, -0.05], [0.12, -0.12], [0.17, -0.11], [0.17, 0.11], [0.12, 0.12], [0, 0.05]],
    fins: [
      { pts: [[0.28, -0.24], [0.42, -0.46], [0.54, -0.44], [0.66, -0.3], [0.76, -0.1], [0.7, -0.1]], up: 1 },
      { pts: [[0.28, 0.25], [0.42, 0.46], [0.54, 0.43], [0.66, 0.28], [0.76, 0.09], [0.7, 0.1]], up: 0 },
    ],
    pect: { pivot: [0.25, 0.04], pts: [[0.24, 0.02], [0.33, 0.0], [0.35, 0.05], [0.25, 0.07]], flap: 0.25 },
    eye: { u: 0.1, v: -0.035, r: 0.028, hide: true },
    pal: {
      body: P(['#1c2a44', '#304464', '#4a6288', '#6c86aa', '#96aecc', '#c6d6ea', '#eef4fb'], 7),
      fin: P(['#141e32', '#26364e', '#3e5270', '#5c7292', '#8298b6'], 5),
      a: P(['#070b16', '#131b30', '#222c46'], 3),
    },
    shade: [[0, 2.2], [0.3, 3.8], [0.6, 4.8], [0.9, 5.4], [1, 4]],
    marks: (u, t) => {
      if (Math.abs(u - 0.11 - (t - 0.5) * 0.05) < 0.035) return { p: 'a', l: 1 };
      if (Math.abs(u - 0.36 - (t - 0.5) * 0.06) < 0.05) return { p: 'a', l: 1.2 };
      return null;
    },
    finBase: 2.0, finTip: 1.2, tailLvl: [2, 1], finAlpha: 230, finMarks: true,
  },
  // Clownfish: stubby orange body, three white bands edged in black.
  clown: {
    frames: 6, be: 0.78, swing: 0.3, wob: 0.03, rays: false,
    top: [[0, 0.02], [0.05, -0.075], [0.15, -0.155], [0.3, -0.19], [0.48, -0.18], [0.64, -0.12], [0.78, -0.06]],
    bot: [[0, 0.045], [0.06, 0.095], [0.18, 0.15], [0.34, 0.168], [0.5, 0.15], [0.66, 0.1], [0.78, 0.06]],
    tail: [[0, -0.06], [0.08, -0.12], [0.16, -0.13], [0.2, -0.07], [0.21, 0], [0.2, 0.07], [0.16, 0.13], [0.08, 0.12], [0, 0.06]],
    fins: [
      { pts: [[0.2, -0.17], [0.26, -0.25], [0.36, -0.26], [0.42, -0.2]], up: 1, tip: 1 },
      { pts: [[0.42, -0.19], [0.5, -0.28], [0.62, -0.25], [0.72, -0.12], [0.7, -0.08]], up: 1, tip: 1 },
      { pts: [[0.48, 0.15], [0.56, 0.24], [0.66, 0.2], [0.72, 0.1], [0.68, 0.08]], up: 0, tip: 1 },
      { pts: [[0.26, 0.16], [0.3, 0.24], [0.36, 0.23], [0.36, 0.16]], up: 0, tip: 1 },
    ],
    pect: { pivot: [0.24, 0.04], pts: [[0.23, 0.02], [0.3, 0.0], [0.36, 0.05], [0.32, 0.09], [0.24, 0.07]], flap: 0.4, lvl: 3.4 },
    eye: { u: 0.1, v: -0.045, r: 0.042, iris: '#f4a040' },
    mouth: [[0.0, 0.035], [0.03, 0.04]],
    pal: {
      body: P(['#3a1204', '#7a2806', '#c24a0a', '#ec6e14', '#ff9030', '#ffb66a', '#ffe0b8'], 7),
      fin: P(['#140804', '#6a2406', '#c84c0c', '#f07418', '#ff9c44'], 5),
      w: P(['#8e9aac', '#c8d2de', '#eef4fa', '#ffffff', '#ffffff'], 5),
      a: P(['#0a0604', '#1c120c'], 2),
    },
    shade: [[0, 3.0], [0.3, 3.8], [0.7, 4.2], [1, 3.4]],
    marks: (u, t) => {
      const bands = [[0.17 + (t - 0.5) * (t - 0.5) * 0.14, 0.05], [0.45 - Math.sin(t * Math.PI) * 0.055, 0.05], [0.745, 0.028]];
      for (const [c, w] of bands) {
        const d = Math.abs(u - c);
        if (d < w) return { p: 'w', l: 3.2 - t * 1.2 };
        if (d < w + 0.018) return { p: 'a', l: 0.6 };
      }
      return null;
    },
    tailTip: 1,
    finBase: 3.2, finTip: 3.0, tailLvl: [3.4, 3.0], finAlpha: 250,
  },
  // Minnow: tiny silver fish with a rose-gold stripe that catches the light.
  minnow: {
    frames: 6, be: 0.8, swing: 0.32, wob: 0.03,
    top: [[0, 0.012], [0.08, -0.05], [0.25, -0.09], [0.45, -0.095], [0.65, -0.058], [0.8, -0.022]],
    bot: [[0, 0.02], [0.1, 0.055], [0.3, 0.085], [0.5, 0.08], [0.68, 0.048], [0.8, 0.022]],
    tail: [[0, -0.02], [0.12, -0.1], [0.16, -0.1], [0.09, -0.02], [0.09, 0.02], [0.16, 0.1], [0.12, 0.1], [0, 0.02]],
    fins: [{ pts: [[0.36, -0.072], [0.42, -0.125], [0.48, -0.072]], up: 1 }],
    pect: null,
    eye: { u: 0.09, v: -0.012, r: 0.02 },
    pal: {
      body: P(['#26224a', '#443e78', '#6e6ca8', '#a4a8d6', '#d6daf4', '#ffffff'], 6),
      fin: P(['#6a6aa4', '#a2a6d8', '#dadcf6'], 3),
      a: P(['#7a2c56', '#d05c8e', '#ff9cc4', '#ffe0ee'], 4),
    },
    shade: [[0, 0.8], [0.25, 1.8], [0.45, 3.4], [0.6, 4.4], [0.85, 4.8], [1, 3.4]],
    marks: (u, t) => (u > 0.1 && u < 0.76 && Math.abs(t - 0.44) < 0.1 ? { p: 'a', l: t < 0.44 ? 2.6 : 2 } : null),
    finBase: 1.2, finTip: 0.4, tailLvl: [1.3, 0.8], finAlpha: 210,
  },
  // Whale shark: vast, gentle, broad-headed, painted with white spots.
  whaleshark: {
    rays: false, dither: 0.4, noPitch: true,
    frames: 12, be: 0.74, swing: 0.22, wob: 0.012, bodyWob: 0.008,
    top: [[0, 0.012], [0.02, -0.03], [0.06, -0.058], [0.14, -0.082], [0.28, -0.098], [0.42, -0.096], [0.56, -0.076], [0.66, -0.05], [0.74, -0.028]],
    bot: [[0, 0.032], [0.03, 0.056], [0.1, 0.075], [0.24, 0.088], [0.38, 0.085], [0.52, 0.068], [0.64, 0.044], [0.74, 0.022]],
    tail: [[0, -0.028], [0.05, -0.058], [0.11, -0.1], [0.155, -0.135], [0.172, -0.128], [0.125, -0.062], [0.095, -0.01], [0.095, 0.025], [0.11, 0.055], [0.1, 0.078], [0.078, 0.078], [0.04, 0.045], [0, 0.022]],
    fins: [
      { pts: [[0.46, -0.092], [0.505, -0.145], [0.53, -0.148], [0.545, -0.138], [0.58, -0.08]], up: 1 },
      { pts: [[0.66, -0.048], [0.68, -0.075], [0.7, -0.073], [0.71, -0.04]], up: 1 },
      { pts: [[0.52, 0.066], [0.56, 0.1], [0.58, 0.098], [0.59, 0.06]], up: 0 },
    ],
    pect: { pivot: [0.24, 0.07], pts: [[0.21, 0.062], [0.27, 0.06], [0.33, 0.11], [0.35, 0.145], [0.325, 0.145], [0.27, 0.1], [0.215, 0.082]], flap: 0.05, mix: 0.9, lvl: 4.4 },
    eye: { u: 0.05, v: -0.004, r: 0.008, shark: true },
    mouth: [[0.0, 0.03], [0.04, 0.037], [0.08, 0.035]],
    gills: { u0: 0.14, u1: 0.2, n: 5, t0: 0.25, t1: 0.8 },
    pal: {
      body: P(['#08101e', '#0f1c32', '#172a46', '#203c5a', '#2c5070', '#46708e', '#7a9cb6', '#b4cadc', '#e8f0f8'], 9),
      fin: P(['#08101e', '#0f1c32', '#172a46', '#203c5a', '#2c5070', '#46708e', '#6a8aa6'], 7),
      w: P(['#6c8aa4', '#b0c8dc', '#e4f0fa', '#ffffff'], 4),
    },
    shade: [[0, 2.8], [0.15, 3.5], [0.4, 4.1], [0.56, 4.6], [0.62, 6.4], [0.8, 7.1], [1, 5.6]],
    marks: (u, t) => {
      if (t > 0.6 || u < 0.03 || u > 0.72) return null;
      const head = u < 0.18;
      const rows = head ? 11 : 6.5;
      const row = Math.floor(t * rows);
      const gu = u * (head ? 58 : 30) + (row % 2) * 0.5;
      const du = gu - Math.round(gu);
      const dv = t * rows - (row + 0.5);
      if (du * du + dv * dv * 0.8 < 0.045) return { p: 'w', l: 0.9 + (0.6 - t) * 2.2 };
      const lu = u * 32;
      if (u > 0.2 && t > 0.08 && Math.abs(lu - Math.round(lu)) < 0.04) return { p: 'w', l: 0.3 };
      return null;
    },
    scales: 999, finBase: 4.6, finTip: 4.0, tailLvl: [4.8, 4.0], finAlpha: 255,
  },
};

// ------------------------------------------------------------- rendering --
const prep = new Map();
function prepared(id) {
  if (prep.has(id)) return prep.get(id);
  const sp = SPECIES[id];
  const top = curve(sp.top), bot = curve(sp.bot);
  const shade = curve(sp.shade);
  const lat = sp.lateral ? curve(sp.lateral.t) : null;
  const fins = sp.fins.map((f) => {
    let h = 0;
    for (const [u, v] of f.pts) h = Math.max(h, f.up ? top(u) - v : v - bot(u));
    return { ...f, h: Math.max(h, 1e-3) };
  });
  const tailMax = Math.max(...sp.tail.map((p) => p[0]));
  // Local-space extents for the bounding box.
  let v0 = 0, v1 = 0;
  const all = [...sp.tail.map(([u, v]) => [u + sp.be, v]), ...sp.fins.flatMap((f) => f.pts), ...(sp.pect ? sp.pect.pts : [])];
  for (let u = 0; u <= sp.be; u += 0.02) { v0 = Math.min(v0, top(u)); v1 = Math.max(v1, bot(u)); }
  for (const [, v] of all) { v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const u1 = sp.be + tailMax;
  const eyeCol = sp.eye.iris ? hex(sp.eye.iris) : null;
  const pr = { sp, top, bot, shade, lat, fins, tailMax, v0: v0 - 0.03, v1: v1 + 0.03, u0: -0.02, u1: u1 + 0.02, eyeCol };
  prep.set(id, pr);
  return pr;
}

const rot = (pts, [cx, cy], a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

const PUPIL = [6, 9, 18], WHITE = [255, 255, 255];

/**
 * Render one sprite. L = total length in px, frame index, ang = screen
 * rotation in radians (+ = nose down for a right-facing fish), flash = glint.
 * Returns a canvas facing right with .ox/.oy = pivot offset (body centre).
 */
export function renderFish(id, L, frame, ang = 0, flash = 0) {
  const pr = prepared(id);
  const sp = pr.sp;
  const ph = (frame / sp.frames) * TAU;
  const sw = Math.sin(ph);
  const fore = 1 - sp.swing * sw * sw;
  const wob = sp.wob * Math.sin(ph);
  const tailDark = -1.1 * sw * sw;
  // Animated tail polygon
  const tail = sp.tail.map(([du, dv]) => [sp.be + du * fore, dv + wob * (du / pr.tailMax) * 2]);
  const pect = sp.pect ? rot(sp.pect.pts, sp.pect.pivot, sp.pect.flap * Math.sin(ph * 2 + 1)) : null;
  const tailU1 = sp.be + pr.tailMax * fore;
  const bw = sp.bodyWob || 0.006;

  // Bounding box of the rotated local rect.
  const cx = 0.45;
  const c = Math.cos(ang), s = Math.sin(ang);
  const corners = [[pr.u0, pr.v0], [pr.u1, pr.v0], [pr.u0, pr.v1], [pr.u1, pr.v1]].map(([u, v]) => {
    const x = (u - cx) * L, y = v * L;
    return [x * c - y * s, x * s + y * c];
  });
  const minX = Math.floor(Math.min(...corners.map((p) => p[0]))) - 1;
  const maxX = Math.ceil(Math.max(...corners.map((p) => p[0]))) + 1;
  const minY = Math.floor(Math.min(...corners.map((p) => p[1]))) - 1;
  const maxY = Math.ceil(Math.max(...corners.map((p) => p[1]))) + 1;
  const W = maxX - minX, H = maxY - minY;
  const N = W * H;
  const mat = new Uint8Array(N); // 0 none,1 body,2 fin,3 tail
  const lvl = new Float32Array(N);
  const pal = new Array(N);
  const over = new Float32Array(N).fill(-1); // pectoral overlay level
  const dith = (L >= 22 ? 0.7 : L >= 14 ? 0.35 : 0) * (sp.dither ?? 1);
  const px1 = 1 / L;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = px + minX + 0.5, sy = py + minY + 0.5;
      const u = (sx * c + sy * s) / L + cx;
      const v = (-sx * s + sy * c) / L;
      const i = py * W + px;
      // Pectoral overlay (near side)
      if (pect && pointInPoly(u, v, pect)) over[i] = 1;
      // Body
      if (u >= 0 && u <= sp.be) {
        const k = u > 0.45 ? Math.pow((u - 0.45) / (sp.be - 0.45), 2) : 0;
        const vo = v - bw * Math.sin(ph - u * 4) * k;
        const tp = pr.top(u), bt = pr.bot(u);
        if (vo >= tp && vo <= bt) {
          const t = (vo - tp) / (bt - tp);
          let l = pr.shade(t);
          let p = 'body';
          if (sp.operc) {
            if (u < sp.operc) l += 0.35;
            const oc = sp.operc - 0.03 * Math.pow((t - 0.5) * 2, 2);
            if (Math.abs(u - oc) < 0.55 * px1 && t > 0.15 && t < 0.92 && L >= 16) l -= 1.1;
          }
          l -= smoothstep(sp.be - 0.2, sp.be, u) * 0.7;
          if (sp.bars) {
            const b = sp.bars;
            if (u > b.u0 && u < b.u1 && t > b.t0 && t < b.t1 && fract((u - b.u0) * b.n) < b.w) l -= b.amt * (1 - t);
          }
          if (sp.stripe && Math.abs(t - sp.stripe.t) < sp.stripe.w) l += sp.stripe.amt;
          if (sp.spots && t < sp.spots.t1 && u > 0.12 && u < sp.be - 0.05) {
            if (fbm(u * sp.spots.scale, v * sp.spots.scale, 7, 2) > sp.spots.thr) l -= sp.spots.amt;
          }
          if (sp.blotch && u > 0.06) {
            const n = fbm(u * sp.blotch.scale, v * sp.blotch.scale * 1.4, 3, 3);
            if (n > sp.blotch.thr) l -= sp.blotch.amt * smoothstep(sp.blotch.thr, sp.blotch.thr + 0.1, n);
          }
          if (sp.freckle && L >= 30 && hash2(px + minX * 3, py + minY * 7, 5) < 0.06) l += sp.freckle.amt;
          if (sp.speckle && L >= 30 && t < 0.4 && hash2(px, py, 11) < 0.05) l -= sp.speckle;
          if (pr.lat && L >= 20) {
            const lt = pr.lat(u);
            const lv = tp + (bt - tp) * lt;
            const onLine = Math.abs(vo - lv) < 0.6 * px1;
            if (onLine && u > 0.14) {
              l -= 0.8;
              if (sp.lateral.scutes && u > sp.lateral.scutes) l -= 1.2;
            } else if (sp.lateral.scutes && u > sp.lateral.scutes && Math.abs(vo - lv) < 1.3 * px1 && L >= 34) l -= 0.6;
          }
          if (sp.gills && L >= 40 && u > sp.gills.u0 && u < sp.gills.u1 && t > sp.gills.t0 && t < sp.gills.t1) {
            const gp = (u - sp.gills.u0) / (sp.gills.u1 - sp.gills.u0) * sp.gills.n;
            if (fract(gp) < 0.9 * px1 * sp.gills.n / (sp.gills.u1 - sp.gills.u0)) l -= 0.9;
          }
          if (sp.scales && L >= sp.scales && t > 0.15 && t < 0.85) {
            if ((px + (py % 2) * 2) % 4 === 0) l += 0.45;
          }
          if (sp.marks) {
            const m = sp.marks(u, t, v);
            if (m) { if (m.p) p = m.p; l = m.l; }
          }
          if (flash && t > 0.18 && t < 0.72) l += 1.6 * flash;
          mat[i] = 1; lvl[i] = l; pal[i] = p;
          continue;
        }
      }
      // Tail
      if (u > sp.be - 0.02 && u < tailU1 + 0.02 && pointInPoly(u, v, tail)) {
        const tt = clamp((u - sp.be) / (tailU1 - sp.be));
        let l = sp.tailLvl[0] + (sp.tailLvl[1] - sp.tailLvl[0]) * tt + tailDark;
        if (sp.rays !== false && L >= 26 && fract((v * 3 + tt) * L * 0.18) < 0.4) l += 0.4;
        if (sp.tailTip && tt > 0.72) l = 0.6;
        mat[i] = 3; lvl[i] = l; pal[i] = sp.tailPal || 'fin';
        continue;
      }
      // Fins (behind body)
      for (const f of pr.fins) {
        if (pointInPoly(u, v, f.pts)) {
          const d = f.up ? pr.top(clamp(u, 0, sp.be)) - v : v - pr.bot(clamp(u, 0, sp.be));
          const ft = clamp(d / f.h);
          let l = sp.finBase + (sp.finTip - sp.finBase) * ft;
          if (sp.rays !== false && L >= 26 && fract(u * L * 0.35) < 0.45) l += 0.35;
          if (f.tip && ft > 0.7) l = 0.4;
          if (sp.finMarks && ft > 0.2 && fract(ft * 3) < 0.3) l -= 0.8;
          if (sp.finSpots && hash2(px, py, 9) < 0.18) l -= 0.9;
          mat[i] = 2; lvl[i] = l; pal[i] = 'fin';
          break;
        }
      }
    }
  }

  // Edge pass: rim light from above, sel-out shadow below.
  const out = new Buf(W, H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mat[y * W + x]);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const m = mat[i];
      if (!m) continue;
      let l = lvl[i];
      const up = at(px, py - 1), dn = at(px, py + 1), lf = at(px - 1, py), rt = at(px + 1, py);
      if (m === 1) {
        if (up !== 1) l += L >= 14 ? 1.2 : 0.6;
        if (dn !== 1) l -= L >= 14 ? 1.4 : 0.8;
        if ((lf === 0 || rt === 0) && up === 1 && dn === 1) l -= 0.6;
      } else {
        if (!up || !dn || !lf || !rt) l -= 0.5;
      }
      const ramp = sp.pal[pal[i]] || sp.pal.body;
      const idx = clamp(Math.round(l + (bayer(px, py) - 0.5) * dith), 0, ramp.length - 1);
      let col = ramp[idx];
      let a = m === 1 ? 255 : sp.finAlpha;
      if (over[i] > 0) {
        const fr = sp.pal[sp.pect.pal] || sp.pal.fin;
        const pl = (sp.pect.lvl ?? sp.finBase + 1) + (m === 1 && lvl[i] > 5 ? 0.5 : 0);
        const pc = fr[clamp(Math.round(pl + (bayer(px, py) - 0.5) * dith), 0, fr.length - 1)];
        col = m ? mixRGB(col, pc, sp.pect.mix ?? 0.72) : pc;
        a = m ? 255 : sp.finAlpha;
      }
      out.set(px, py, col, a);
    }
  }
  // Pectoral pixels that fall outside body/fins
  if (pect) {
    for (let i = 0; i < N; i++) {
      if (over[i] > 0 && !mat[i]) {
        const px = i % W, py = (i / W) | 0;
        const fr = sp.pal[sp.pect.pal] || sp.pal.fin;
        out.set(px, py, fr[clamp(Math.round((sp.pect.lvl ?? sp.finBase + 1) - 0.4), 0, fr.length - 1)], sp.finAlpha);
      }
    }
  }

  // Mouth line
  const toPx = (u, v) => {
    const x = (u - cx) * L, y = v * L;
    return [Math.floor(x * c - y * s - minX), Math.floor(x * s + y * c - minY)];
  };
  if (sp.mouth && L >= 18) {
    const dark = sp.pal.body[1];
    for (let k = 0; k < sp.mouth.length - 1; k++) {
      const [a0, b0] = sp.mouth[k], [a1, b1] = sp.mouth[k + 1];
      const steps = Math.ceil(Math.hypot(a1 - a0, b1 - b0) * L * 1.5) + 1;
      for (let j = 0; j <= steps; j++) {
        const [mx, my] = toPx(a0 + ((a1 - a0) * j) / steps, b0 + ((b1 - b0) * j) / steps);
        if (out.alpha(mx, my)) out.set(mx, my, dark);
        if (sp.teeth && L >= 60 && j % 3 === 1 && out.alpha(mx, my + 1)) out.set(mx, my + 1, [226, 236, 246]);
      }
    }
    if (sp.lip && L >= 30) {
      const [mx, my] = toPx(sp.mouth[0][0] + 0.01, sp.mouth[0][1] + 0.012);
      out.set(mx, my, sp.pal.body[4]);
    }
  }

  // Eye
  const e = sp.eye;
  if (e && !(e.hide && L < 14)) {
    const [ex, ey] = toPx(e.u, e.v);
    const r = e.r * L;
    if (e.hide) {
      // eye sits in a dark band: just a glint
      if (r >= 1) out.set(ex, ey, [90, 110, 140]);
    } else if (e.shark) {
      out.set(ex, ey, PUPIL);
      if (r > 0.9) { out.set(ex + 1, ey, PUPIL); out.set(ex, ey - 1, [120, 150, 190]); }
    } else if (r < 0.95) {
      out.set(ex, ey, PUPIL);
    } else if (r < 1.7) {
      out.set(ex, ey, WHITE); out.set(ex + 1, ey, PUPIL); out.set(ex, ey + 1, PUPIL); out.set(ex + 1, ey + 1, PUPIL);
    } else {
      const R2 = r * r, pr2 = (r * 0.62) * (r * 0.62);
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const d2 = (dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5);
          if (d2 > R2) continue;
          out.set(ex + dx, ey + dy, d2 < pr2 ? PUPIL : pr.eyeCol || [200, 220, 240]);
        }
      }
      out.set(ex - 1, ey - 1, WHITE);
    }
  }

  const cv = out.toCanvas();
  cv.ox = -minX;
  cv.oy = -minY;
  return cv;
}

// ------------------------------------------------------------- the cache --
export const PITCHES = [-0.5, -0.25, 0, 0.25, 0.5];
const cache = new Map();
const warmSizes = new Map(); // id -> Set of lengths with every level frame cached
const K = (id, L, f, p, fl) => id + '|' + L + '|' + f + '|' + p + '|' + fl;

function fallback(id, L, frame, pitchIdx) {
  const c = cache.get(K(id, L, frame, pitchIdx, 0)) || cache.get(K(id, L, frame, 2, 0));
  if (c) return c;
  const sizes = warmSizes.get(id);
  if (!sizes || !sizes.size) return null;
  let best = -1, bd = 1e9;
  for (const s of sizes) { const d = Math.abs(s - L); if (d < bd) { bd = d; best = s; } }
  return cache.get(K(id, best, frame, 2, 0)) || null;
}

export function fishSprite(id, L, frame, pitchIdx = 2, flash = 0) {
  const key = K(id, L, frame, pitchIdx, flash);
  let c = cache.get(key);
  if (c) return c;
  if (B.left <= 0) {
    const fb = fallback(id, L, frame, pitchIdx);
    if (fb) return fb;
  }
  c = timed(() => renderFish(id, L, frame, PITCHES[pitchIdx], flash));
  cache.set(key, c);
  return c;
}

// Render every level frame of a size now (used during loading).
export function warmLevel(id, L) {
  const sp = SPECIES[id];
  for (let f = 0; f < sp.frames; f++) fishSprite(id, L, f, 2, 0);
  let set = warmSizes.get(id);
  if (!set) warmSizes.set(id, (set = new Set()));
  set.add(L);
}

// Queue the remaining variants for background rendering.
export function queueVariants(id, L, pitches = [1, 3, 0, 4], flash = false) {
  const sp = SPECIES[id];
  queueWarm(() => warmLevel(id, L));
  for (const p of pitches) for (let f = 0; f < sp.frames; f++) queueWarm(() => fishSprite(id, L, f, p, 0));
  if (flash) for (const p of [2, 1, 3]) for (let f = 0; f < sp.frames; f++) queueWarm(() => fishSprite(id, L, f, p, 1));
}
