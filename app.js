'use strict';
/* phone layout: narrow screens, plus touch phones held in landscape (wider than 820px but short) */
const isPhone = () => innerWidth <= 820 || matchMedia('(pointer:coarse) and (max-height:500px)').matches;
/* HELLO TLV — real-time Gaussian splat renderer + story. No external engine. */
(async function () {
const $ = (s) => document.querySelector(s);
const canvas = $('#gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
if (!gl) return fail('הדפדפן שלכם אינו תומך ב-WebGL2. נסו Chrome, Edge או Safari עדכניים.');

const G = { GROUND: 0, ROAD: 1, GRASS: 2, TREE: 3, CITY: 4, PROJ: 5, CAR: 6, LIGHT: 7, WATER: 8, RAIL: 9, RING: 10, DUST: 11, PGROUND: 12, PLAN: 13 };

/* ---------------------------------------------------------------- load */
const META = await (await fetch('scene.json')).json();
const WALKS = await fetch('assets/walks.json').then((r) => r.json()).catch(() => null);
const RAIL = await fetch('assets/rail.json?v=1').then((r) => r.json()).catch(() => null);
const LOAD_T0 = performance.now();
// packed scene (src/pack_scene.py): 16-bit positions per group + planar colours — ~45% less to download
const PACKED = !!(META.packed && META.qpos);
const buf = await fetchProgress(PACKED ? META.packed : 'scene.bin', (p) => { $('#pgBar').style.width = (p * 35).toFixed(1) + '%'; }, PACKED ? META.packed_bytes : META.count * 27 + META.nproj * 8);
$('#pgTxt').textContent = 'מרכיבים את העיר';
await new Promise((r) => setTimeout(r, 30));

const N = META.count, NP = META.nproj;
let o = 0, pos, scl, qt, rgba, mt;
if (PACKED) {
  const u8 = new Uint8Array(buf), P = 6 * N;
  scl = new Uint8Array(buf, P, N * 3); qt = new Uint8Array(buf, P + N * 3, N * 4);
  const rp = P + N * 7; mt = new Uint8Array(buf, P + N * 11, N * 4); o = P + N * 15;
  rgba = new Uint8Array(N * 4); pos = new Float32Array(N * 3);
  const LO = META.qpos.lo, K = META.qpos.k;
  for (let i = 0; i < N; i++) {
    const g = mt[i * 4], lo = LO[g], k = K[g];
    pos[i * 3] = lo[0] + (u8[i] | (u8[N + i] << 8)) * k[0];
    pos[i * 3 + 1] = lo[1] + (u8[2 * N + i] | (u8[3 * N + i] << 8)) * k[1];
    pos[i * 3 + 2] = lo[2] + (u8[4 * N + i] | (u8[5 * N + i] << 8)) * k[2];
    rgba[i * 4] = u8[rp + i]; rgba[i * 4 + 1] = u8[rp + N + i]; rgba[i * 4 + 2] = u8[rp + 2 * N + i]; rgba[i * 4 + 3] = u8[rp + 3 * N + i];
  }
} else {
  pos = new Float32Array(buf, 0, N * 3); o += N * 12;
  scl = new Uint8Array(buf, o, N * 3); o += N * 3;
  qt = new Uint8Array(buf, o, N * 4); o += N * 4;
  rgba = new Uint8Array(buf, o, N * 4); o += N * 4;
  mt = new Uint8Array(buf, o, N * 4); o += N * 4;
}
const logoXY = new Int16Array(buf.slice(o, o + NP * 4)); o += NP * 4;
const logoC = new Uint8Array(buf, o, NP * 4);

const TW = 2048, TH = Math.ceil(N / TW);
const tA = new Uint32Array(TW * TH * 4), tB = new Uint32Array(TW * TH * 4), tC = new Uint32Array(TW * TH * 4);
const fv = new Float32Array(1), iv = new Int32Array(fv.buffer);
function f2h(f) {
  fv[0] = f; const x = iv[0];
  const sign = (x >> 31) & 1, exp = (x >> 23) & 0xff; let frac = x & 0x7fffff, ne;
  if (exp === 0) ne = 0;
  else if (exp < 113) { ne = 0; frac |= 0x800000; frac >>= (113 - exp); if (frac & 0x1000000) { ne = 1; frac = 0; } }
  else if (exp < 142) ne = exp - 112;
  else { ne = 31; frac = 0; }
  return (sign << 15) | (ne << 10) | (frac >> 13);
}
const h2 = (a, b) => (f2h(a) | (f2h(b) << 16)) >>> 0;
const SOFF = META.scale_enc.off, SRNG = META.scale_enc.range;
const pv = new Float32Array(tA.buffer);
for (let i = 0; i < N; i++) {
  const s0 = Math.exp(scl[i * 3] / 255 * SRNG - SOFF), s1 = Math.exp(scl[i * 3 + 1] / 255 * SRNG - SOFF), s2 = Math.exp(scl[i * 3 + 2] / 255 * SRNG - SOFF);
  let w = (qt[i * 4] - 127.5) / 127.5, x = (qt[i * 4 + 1] - 127.5) / 127.5, y = (qt[i * 4 + 2] - 127.5) / 127.5, z = (qt[i * 4 + 3] - 127.5) / 127.5;
  const ql = Math.hypot(w, x, y, z) || 1; w /= ql; x /= ql; y /= ql; z /= ql;
  // columns of R
  const r00 = 1 - 2 * (y * y + z * z), r10 = 2 * (x * y + w * z), r20 = 2 * (x * z - w * y);
  const r01 = 2 * (x * y - w * z), r11 = 1 - 2 * (x * x + z * z), r21 = 2 * (y * z + w * x);
  const r02 = 2 * (x * z + w * y), r12 = 2 * (y * z - w * x), r22 = 1 - 2 * (x * x + y * y);
  const M0 = r00 * s0, M1 = r10 * s0, M2 = r20 * s0, M3 = r01 * s1, M4 = r11 * s1, M5 = r21 * s1, M6 = r02 * s2, M7 = r12 * s2, M8 = r22 * s2;
  const S00 = M0 * M0 + M3 * M3 + M6 * M6, S01 = M0 * M1 + M3 * M4 + M6 * M7, S02 = M0 * M2 + M3 * M5 + M6 * M8;
  const S11 = M1 * M1 + M4 * M4 + M7 * M7, S12 = M1 * M2 + M4 * M5 + M7 * M8, S22 = M2 * M2 + M5 * M5 + M8 * M8;
  const g = mt[i * 4], fl = mt[i * 4 + 1], dl = mt[i * 4 + 2], aux = mt[i * 4 + 3];
  // normal (local z) or, for cars, heading (local x)
  let nx = r02, ny = r12, nz = r22;
  if (g === G.CAR) { nx = r00; ny = r10; nz = r20; }
  const l1 = Math.abs(nx) + Math.abs(ny) + Math.abs(nz) || 1;
  let ox = nx / l1, oy = ny / l1;
  if (nz < 0) { const a = ox, b = oy; ox = (1 - Math.abs(b)) * (a >= 0 ? 1 : -1); oy = (1 - Math.abs(a)) * (b >= 0 ? 1 : -1); }
  const o1 = Math.round((ox * 0.5 + 0.5) * 255), o2 = Math.round((oy * 0.5 + 0.5) * 255);
  pv[i * 4] = pos[i * 3]; pv[i * 4 + 1] = pos[i * 3 + 1]; pv[i * 4 + 2] = pos[i * 3 + 2];
  tA[i * 4 + 3] = ((g & 15) | ((fl & 15) << 4) | (dl << 8) | (o1 << 16) | (o2 << 24)) >>> 0;
  tB[i * 4] = h2(S00, S01); tB[i * 4 + 1] = h2(S02, S11); tB[i * 4 + 2] = h2(S12, S22);
  tB[i * 4 + 3] = (rgba[i * 4] | (rgba[i * 4 + 1] << 8) | (rgba[i * 4 + 2] << 16) | (rgba[i * 4 + 3] << 24)) >>> 0;
  if (i < NP) {
    tC[i * 4] = ((logoXY[i * 2] & 0xffff) | ((logoXY[i * 2 + 1] & 0xffff) << 16)) >>> 0;
    tC[i * 4 + 1] = (logoC[i * 4] | (logoC[i * 4 + 1] << 8) | (logoC[i * 4 + 2] << 16) | (255 << 24)) >>> 0;
  }
  tC[i * 4 + 2] = aux;
}
function mkTex(data, unit) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, TW, TH, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
mkTex(tA, 0); mkTex(tB, 1); mkTex(tC, 2);

/* ---------------------------------------------------------------- shaders */
const VS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uA, uB, uC;
uniform mat4 uView, uProj; uniform vec2 uFocal, uViewport; uniform vec3 uCamPos;
uniform float uTime, uIntro, uNight, uFogDen, uRings, uExplode, uDim, uExposure, uReveal, uPlan, uPlanY;
uniform vec3 uSunDir, uSunCol, uSkyCol, uGndCol, uFogCol, uZenith, uFog2;
uniform vec4 uCursor; uniform vec4 uPulse[4]; uniform vec4 uSel; uniform float uHover, uCurR;
uniform vec3 uLogoC, uLogoR, uLogoU; uniform int uNP;
in vec2 aQuad; in uint aIndex;
out vec4 vCol; out vec2 vPos;
const vec3 GOLD = vec3(1.0, 0.72, 0.42);
float h11(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
vec3 octDec(vec2 e){ vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y)); if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); return normalize(v); }
float sstep(float t){ t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float eout(float t){ t = clamp(t, 0.0, 1.0); return 1.0 - pow(1.0 - t, 3.0); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 hazeC(vec3 d){ return mix(uFog2, uFogCol, pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)) * 0.5 + 0.5, 0.0), 2.5)); }
vec3 skyC(vec3 d){ float k = pow(clamp(d.y, 0.0, 1.0), 0.55); vec3 c = mix(hazeC(d), uZenith, k); float s = max(dot(d, uSunDir), 0.0); return c + uSunCol * (pow(s, 24.0) * 0.25 + pow(s, 600.0) * 3.0); }
void main(){
  uint id = aIndex;
  ivec2 tc = ivec2(int(id & 2047u), int(id >> 11));
  uvec4 A = texelFetch(uA, tc, 0), B = texelFetch(uB, tc, 0), C = texelFetch(uC, tc, 0);
  vec3 p = uintBitsToFloat(A.xyz);
  uint m = A.w; uint grp = m & 15u; uint flg = (m >> 4) & 15u; uint dly8 = (m >> 8) & 255u; float dly = float(dly8) / 255.0;
  vec3 N = octDec(vec2(float((m >> 16) & 255u), float((m >> 24) & 255u)) / 127.5 - 1.0);
  vec4 col = vec4(float(B.w & 255u), float((B.w >> 8) & 255u), float((B.w >> 16) & 255u), float((B.w >> 24) & 255u)) / 255.0;
  vec2 c1 = unpackHalf2x16(B.x), c2 = unpackHalf2x16(B.y), c3 = unpackHalf2x16(B.z);
  mat3 Vrk = mat3(c1.x, c1.y, c2.x, c1.y, c2.y, c3.x, c2.x, c3.x, c3.y);
  float rnd = h11(float(id) * 0.0137 + 0.31);
  float rnd2 = h11(float(id) * 0.0291 + 7.7);
  float sz = 1.0, alpha = col.a;
  vec3 alb = col.rgb * col.rgb;
  vec3 emi = vec3(0.0);
  bool lit = true, glass = false;
  vec3 V = normalize(p - uCamPos);
  float isProj = (int(id) < uNP) ? 1.0 : 0.0;
  uint bld = flg & 3u;
  float flr = float(dly8 >> 4);

  /* ---- story: logo -> city -> buildings */
  if (isProj > 0.5) {
    float lx = float(C.x & 65535u); if (lx >= 32768.0) lx -= 65536.0;
    float ly = float(C.x >> 16u); if (ly >= 32768.0) ly -= 65536.0;
    vec3 lpos = uLogoC + uLogoR * (lx / 16000.0) + uLogoU * (ly / 16000.0);
    vec3 lcol = vec3(float(C.y & 255u), float((C.y >> 8) & 255u), float((C.y >> 16) & 255u)) / 255.0;
    vec3 cloud = uLogoC + (vec3(rnd, h11(rnd * 91.7), rnd2) - 0.5) * vec3(1400.0, 700.0, 1400.0);
    float t1 = eout((uIntro - 0.4 - rnd * 1.6) / 2.0);
    float fl = (grp == ${G.PROJ}u) ? flr : rnd * 2.0;
    float t2 = sstep((uIntro - 5.6 - fl * 0.26 - rnd2 * 0.7) / 1.7);
    if (t2 < 1.0) {
      vec3 q = mix(cloud, lpos + vec3(0.0, sin(uTime * 1.3 + rnd * 20.0) * 0.6, 0.0), t1);
      vec3 swirl = vec3(sin(rnd * 40.0 + uIntro), 0.0, cos(rnd * 40.0 + uIntro)) * 26.0 * sin(t2 * 3.14159);
      p = mix(q, p, t2) + swirl;
      float glow = (1.0 - t2);
      alb = mix(lcol * lcol * 0.9, alb, t2);
      emi += mix(lcol * 0.55, GOLD * 0.9, 0.5) * glow * t1 * 0.9;
      alpha *= mix(0.95 * t1, 1.0, t2);
      sz = mix(0.7, 1.0, t2);
      lit = t2 > 0.5;
    }
  } else if (grp == ${G.PLAN}u) {
    alpha *= (float(bld) == uSel.x ? 1.0 : 0.0) * uPlan * smoothstep(0.35, 0.9, uExplode);
    p.y += uPlanY;
  } else if (grp != ${G.DUST}u && grp != ${G.CAR}u && grp != ${G.LIGHT}u && grp != ${G.RING}u) {
    float pc = sstep((uIntro - 2.4 - dly * 3.6) / 1.6);
    if (grp == ${G.CITY}u) p.y *= max(pc, 0.002);
    else if (grp == ${G.TREE}u) { sz *= pc; p.y *= pc; }
    alpha *= mix(0.0, 1.0, sstep(pc * 1.5));
  } else if (grp == ${G.CAR}u || grp == ${G.LIGHT}u) {
    alpha *= sstep((uIntro - 6.0) / 2.0);
  }

  /* ---- groups */
  if (grp == ${G.CAR}u) {
    vec3 T = N;
    float len = float(dly8);
    float speed = float(flg & 7u) * 3.4;
    float f = fract(float(C.z) / 255.0 + uTime * speed / len);
    p += T * f * len;
    alpha *= smoothstep(0.0, 0.06, f) * smoothstep(1.0, 0.92, f);
    float rear = step(0.0, dot(T, V));
    vec3 light = mix(vec3(1.0, 0.93, 0.8) * 1.6, vec3(1.0, 0.12, 0.06) * 1.3, rear);
    bool trail = (flg & 8u) != 0u;
    if (trail) { alpha *= uNight; lit = false; emi += light * uNight * 1.5; alb *= 1.0 - uNight; }
    else { emi += light * uNight * 2.4; N = vec3(0.0, 1.0, 0.0); }
  } else if (grp == ${G.LIGHT}u) {
    lit = false;
    if (flg == 2u) { alpha *= uNight; emi = alb * 0.55 * uNight; alb = vec3(0.0); }
    else { alpha *= mix(0.15, 1.0, uNight); emi = alb * 2.2 * uNight; alb *= 0.25; }
  } else if (grp == ${G.WATER}u) {
    float w1 = sin(p.x * 0.045 + uTime * 0.9) + sin(p.z * 0.06 - uTime * 0.7);
    float w2 = cos(p.x * 0.11 - uTime * 1.3 + p.z * 0.05);
    N = normalize(vec3(w1 * 0.05 + w2 * 0.03, 1.0, w2 * 0.05 - w1 * 0.02));
    vec3 R = reflect(V, N);
    float fr = 0.25 + 0.75 * pow(1.0 - max(dot(-V, N), 0.0), 4.0);
    vec3 sky = skyC(R);
    alb = mix(alb, vec3(0.0), 0.0);
    emi += sky * fr * 0.8 + uSunCol * pow(max(dot(R, uSunDir), 0.0), 280.0) * 9.0 * (flg == 2u ? 1.0 : 0.5);
    alb *= 0.6;
  } else if (grp == ${G.RING}u) {
    lit = false;
    float dash = 0.5 + 0.5 * sin(dly * 6.2832 * 60.0 - uTime * 3.0);
    alpha *= uRings * (0.35 + 0.65 * dash);
    emi = GOLD * (1.1 + 0.4 * dash) * uRings; alb = vec3(0.0);
  } else if (grp == ${G.DUST}u) {
    lit = false;
    float ph = float(dly8) / 255.0 * 6.2832;
    p += vec3(sin(uTime * 0.21 + ph * 7.0) * 7.0, sin(uTime * 0.17 + ph * 3.0) * 4.0, cos(uTime * 0.19 + ph * 5.0) * 7.0);
    vec3 toC = uCursor.xyz + vec3(0.0, 30.0, 0.0) - p; float dc = length(toC);
    p += toC / max(dc, 1.0) * min(dc, 60.0) * uCursor.w * exp(-dc / 140.0) * 0.6;
    float tw = 0.5 + 0.5 * sin(uTime * 2.3 + ph * 11.0);
    emi = GOLD * (0.35 + 0.65 * tw) * (0.7 + 0.8 * uNight);
    alpha *= (0.25 + 0.4 * tw) * (1.0 - smoothstep(0.0, 1.0, uIntro / 3.0) * 0.4);
    alb = vec3(0.0);
  } else if (grp == ${G.ROAD}u) {
    if ((flg & 1u) != 0u) emi += vec3(1.0, 0.62, 0.32) * 0.055 * uNight;
  } else if (grp == ${G.RAIL}u) {
    if (flg == 1u) emi += vec3(0.5, 0.7, 1.0) * 0.09 * uNight;
  }

  // glass & windows
  float win = 0.0;
  if (grp == ${G.CITY}u && (flg & 3u) != 0u && (flg & 4u) == 0u) {
    glass = true;
    vec3 cell = floor(p / vec3(3.0, 3.1, 3.0));
    float h = h31(cell + 0.5);
    float on = step(h, (flg & 2u) != 0u ? 0.34 : 0.26);
    vec3 wc = mix(vec3(1.0, 0.62, 0.30), vec3(0.95, 0.88, 0.78), step(0.8, h31(cell * 1.7)) * 0.8 + ((flg & 2u) != 0u ? 0.35 : 0.0));
    float far = mix(1.0, 0.45, smoothstep(500.0, 2600.0, length(p - uCamPos)));
    win = on * uNight * (0.7 + 0.3 * sin(uTime * 0.3 + h * 30.0)) * far;
    emi += wc * win * 0.95;
  }
  if (grp == ${G.PROJ}u) {
    if ((flg & 4u) != 0u) {
      glass = true;
      vec3 cell = floor(p / vec3(2.8, 3.2, 2.8));
      float h = h31(cell + float(bld) * 17.0);
      float on = step(h, 0.58);
      win = on * uNight * (0.7 + 0.3 * sin(uTime * 0.25 + h * 20.0)) * mix(0.75, 1.0, h31(cell * 3.1));
      emi += vec3(1.0, 0.66, 0.36) * win * 0.95;
    }
    if ((flg & 8u) != 0u) emi += vec3(1.0, 0.76, 0.5) * (0.25 + 1.4 * uNight);
    // selection / explode
    if (uSel.x >= 0.0) {
      if (float(bld) == uSel.x) {
        if (flr > uSel.y + 0.5) p.y += uExplode * 15.0;
        float isF = 1.0 - step(0.5, abs(flr - uSel.y));
        float pulse = 0.55 + 0.45 * sin(uTime * 3.2);
        emi += vec3(1.0, 0.42, 0.10) * isF * uSel.z * (0.45 + 0.5 * pulse);
        if (isF > 0.5 && glass) emi += vec3(1.0, 0.48, 0.14) * 0.9 * uSel.z;
        if (isF > 0.5) alb *= vec3(1.0, 0.8, 0.6);
        if (isF < 0.5) alb *= mix(1.0, 0.78, uSel.z);
        alpha *= mix(1.0, 0.16, (1.0 - isF) * uSel.w * step(uSel.y + 0.5, flr));
      } else {
        alb *= mix(1.0, 0.7, uSel.z);
      }
    }
    if (uHover >= 0.0 && float(bld) == uHover) emi += GOLD * 0.12;
  }

  // cursor light & hello pulses
  float dcur = length(p.xz - uCursor.xz);
  float kc = exp(-dcur * dcur / (2.0 * uCurR * uCurR)) * uCursor.w;
  if (grp == ${G.CITY}u || grp == ${G.PROJ}u || grp == ${G.TREE}u) p += N * kc * 0.9 * (0.6 + 0.4 * sin(uTime * 3.0 + rnd * 6.28));
  emi += GOLD * kc * 0.32;
  for (int i = 0; i < 4; i++) {
    vec4 P = uPulse[i];
    float age = uTime - P.z;
    if (age > 0.0 && age < 7.0) {
      float R = age * 240.0;
      float d = length(p.xz - P.xy);
      float k = exp(-pow((d - R) / 26.0, 2.0)) * exp(-age * 0.45) * P.w;
      p.y += k * (grp == ${G.CITY}u ? 5.0 : 2.4) * (0.5 + p.y / (p.y + 30.0));
      emi += GOLD * k * 1.1;
    }
  }

  // lighting
  vec3 c = alb;
  if (lit) {
    float ndl = dot(N, uSunDir);
    if (grp == ${G.TREE}u || grp == ${G.PGROUND}u && N.y < 0.9) ndl = ndl * 0.7 + 0.3;
    vec3 amb = mix(uGndCol, uSkyCol, N.y * 0.5 + 0.5);
    float ao = (grp == ${G.CITY}u || grp == ${G.PROJ}u) ? mix(0.62, 1.0, sstep(p.y / 16.0)) : 1.0;
    c = alb * (amb * ao + uSunCol * max(ndl, 0.0));
    if (glass) {
      vec3 R = reflect(V, N);
      float fr = 0.18 + 0.82 * pow(1.0 - abs(dot(V, N)), 3.0);
      c = mix(c, skyC(R) * 0.75, fr * (1.0 - win * 0.8)) + uSunCol * pow(max(dot(R, uSunDir), 0.0), 120.0) * 2.2 * (1.0 - uNight);
    }
  }
  if (uDim > 0.0 && isProj < 0.5 && grp != ${G.CAR}u && grp != ${G.LIGHT}u && grp != ${G.PLAN}u) {
    float l = dot(c, vec3(0.33));
    c = mix(c, vec3(l) * vec3(1.0, 0.94, 0.88), uDim * 0.55) * (1.0 - uDim * 0.35);
  }

  // atmosphere
  float dist = length(p - uCamPos);
  float fog = 1.0 - exp(-dist * uFogDen);
  fog *= fog * 0.35 + 0.65;
  c = mix(c, hazeC(p - uCamPos), fog);
  emi *= 1.0 - fog * 0.75;

  if (isProj < 0.5 && grp != ${G.DUST}u) { c *= mix(0.06, 1.0, uReveal); emi *= mix(0.3, 1.0, uReveal); }
  vec3 outc = c + emi;
  outc = aces(outc * uExposure);
  outc = pow(outc, vec3(1.0 / 2.2));

  /* ---- projection (EWA) */
  vec4 cam = uView * vec4(p, 1.0);
  vec4 p2 = uProj * cam;
  float clip = 1.2 * p2.w;
  if (alpha < 0.008 || p2.z < -clip || p2.x < -clip || p2.x > clip || p2.y < -clip || p2.y > clip || cam.z < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  Vrk *= sz * sz;
  mat3 J = mat3(uFocal.x / cam.z, 0.0, -(uFocal.x * cam.x) / (cam.z * cam.z),
                0.0, -uFocal.y / cam.z, (uFocal.y * cam.y) / (cam.z * cam.z),
                0.0, 0.0, 0.0);
  mat3 T = transpose(mat3(uView)) * J;
  mat3 cov2d = transpose(T) * Vrk * T;
  float a = cov2d[0][0] + 0.3, b = cov2d[0][1], d = cov2d[1][1] + 0.3;
  float mid = 0.5 * (a + d);
  float rad = length(vec2(0.5 * (a - d), b));
  float l1 = mid + rad, l2 = mid - rad;
  if (l2 < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 dv = normalize(vec2(b, l1 - a));
  if (abs(b) < 1e-7) dv = a >= d ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 maj = min(sqrt(2.0 * l1), 900.0) * dv;
  vec2 mnr = min(sqrt(2.0 * l2), 900.0) * vec2(dv.y, -dv.x);
  vec2 ctr = p2.xy / p2.w;
  vCol = vec4(outc, alpha);
  vPos = aQuad;
  gl_Position = vec4(ctr + aQuad.x * maj / uViewport * 2.0 + aQuad.y * mnr / uViewport * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec4 vCol; in vec2 vPos; out vec4 o;
void main(){ float A = -dot(vPos, vPos); if (A < -4.0) discard; float B = exp(A) * vCol.a; o = vec4(vCol.rgb * B, B); }`;

const SKY_VS = `#version 300 es
in vec2 aP; out vec2 vN; void main(){ vN = aP; gl_Position = vec4(aP, 0.999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 vN; out vec4 o;
uniform vec3 uR, uU, uF, uSunDir, uSunCol, uFogCol, uZenith, uFog2; uniform vec2 uTan; uniform float uNight, uTime, uExposure, uReveal;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 d = normalize(uF + uR * vN.x * uTan.x + uU * vN.y * uTan.y);
  float k = pow(clamp(d.y, 0.0, 1.0), 0.55);
  vec3 hz = mix(uFog2, uFogCol, pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)) * 0.5 + 0.5, 0.0), 2.5));
  vec3 c = mix(hz, uZenith, k);
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 6.0) * 0.12 + pow(s, 40.0) * 0.35 + smoothstep(0.9993, 0.9997, s) * 6.0) * (1.0 - uNight * 0.85);
  if (d.y < 0.0) c = mix(hz, hz * 0.7, clamp(-d.y * 6.0, 0.0, 1.0));
  // stars
  vec2 sp = vec2(atan(d.x, d.z) * 180.0, d.y * 260.0);
  vec2 cell = floor(sp); float h = h21(cell);
  float st = step(0.985, h) * smoothstep(0.08, 0.4, d.y) * uNight;
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 50.0);
  c += vec3(0.9, 0.92, 1.0) * st * tw * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * 1.4;
  c *= mix(0.08, 1.0, uReveal);
  c = clamp((c * uExposure * (2.51 * c * uExposure + 0.03)) / (c * uExposure * (2.43 * c * uExposure + 0.59) + 0.14), 0.0, 1.0);
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); throw new Error(gl.getShaderInfoLog(sh)); }
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name); }
  return { p, u };
}
const SP = prog(VS, FS), SK = prog(SKY_VS, SKY_FS);

const vaoS = gl.createVertexArray(); gl.bindVertexArray(vaoS);
const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]), gl.STATIC_DRAW);
let loc = gl.getAttribLocation(SP.p, 'aQuad'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
const initIdx = new Uint32Array(N); for (let i = 0; i < N; i++) initIdx[i] = i;
gl.bufferData(gl.ARRAY_BUFFER, initIdx, gl.DYNAMIC_DRAW);
loc = gl.getAttribLocation(SP.p, 'aIndex'); gl.enableVertexAttribArray(loc); gl.vertexAttribIPointer(loc, 1, gl.UNSIGNED_INT, 0, 0); gl.vertexAttribDivisor(loc, 1);
const vaoK = gl.createVertexArray(); gl.bindVertexArray(vaoK);
const kb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, kb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
loc = gl.getAttribLocation(SK.p, 'aP'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

/* ---------------------------------------------------------------- depth sort worker */
const workerSrc = `
let pos=null, alt=null, grp=null, N=0, NP=0, useAlt=false, key=null, cnt=null;
const BIAS=new Float32Array(16); BIAS[0]=6; BIAS[1]=3; BIAS[2]=3; BIAS[9]=2; BIAS[10]=-60; BIAS[7]=-1.5; BIAS[6]=-1;
onmessage=(e)=>{const d=e.data;
 if(d.pos){pos=d.pos;grp=d.grp;N=pos.length/3;NP=d.np;key=new Uint16Array(N);cnt=new Uint32Array(65536);return;}
 if(d.alt){alt=d.alt;}
 if('useAlt' in d) useAlt=d.useAlt;
 if(d.f){const fx=d.f[0],fy=d.f[1],fz=d.f[2],ex=d.e[0],ey=d.e[1],ez=d.e[2];
  const L0=0, L1=Math.log(30000), sc=65535/(L1-L0); cnt.fill(0);
  for(let i=0;i<N;i++){let x,y,z;if(useAlt&&i<NP){x=alt[i*3];y=alt[i*3+1];z=alt[i*3+2];}else{x=pos[i*3];y=pos[i*3+1];z=pos[i*3+2];}
   let dd=fx*(x-ex)+fy*(y-ey)+fz*(z-ez)+BIAS[grp[i]]; let k;
   if(dd<1){k=65535;} else {k=65535-((Math.log(dd)-L0)*sc)|0; if(k<0)k=0;}
   key[i]=k; cnt[k]++;}
  let s=0; for(let k=0;k<65536;k++){const c=cnt[k];cnt[k]=s;s+=c;}
  const idx=new Uint32Array(N); for(let i=0;i<N;i++){idx[cnt[key[i]]++]=i;}
  postMessage({idx},[idx.buffer]);}};`;
const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
{ const g = new Uint8Array(N); for (let i = 0; i < N; i++) g[i] = mt[i * 4] & 15; worker.postMessage({ pos: new Float32Array(pos), grp: g, np: NP }); }
let sortBusy = false, lastSortF = [0, 0, 0], lastSortE = [1e9, 0, 0], pendingIdx = null;
worker.onmessage = (e) => { pendingIdx = e.data.idx; sortBusy = false; };

/* ---------------------------------------------------------------- camera */
const D2R = Math.PI / 180;
const FOV = 42 * D2R;
const cam = { t: [-30, 40, -30], yaw: 43 * D2R, pitch: 21 * D2R, dist: 560 };
const camT = { ...cam, t: [...cam.t] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function eyeOf(c) {
  const cp = Math.cos(c.pitch);
  return [c.t[0] + Math.sin(c.yaw) * cp * c.dist, c.t[1] + Math.sin(c.pitch) * c.dist, c.t[2] + Math.cos(c.yaw) * cp * c.dist];
}
function basis(eye, tgt) {
  const f = norm([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const d = cross(f, r);
  return { f, r, d, u: [-d[0], -d[1], -d[2]] };
}
let W = 1, H = 1, DPR = Math.min(window.devicePixelRatio || 1, 1.5);
const MOB = isPhone;
function resize() {
  W = Math.floor(innerWidth * DPR); H = Math.floor(innerHeight * DPR);
  canvas.width = W; canvas.height = H;
  // phones: pin the CSS size to the real visible area (iOS 100vh ≠ innerHeight) so the 3D map and the
  // 2D overlay (purple line, labels) share exactly the same pixels and never drift apart
  const ov = document.getElementById('walk2d');
  for (const el of [canvas, ov]) if (el) { el.style.width = MOB() ? innerWidth + 'px' : ''; el.style.height = MOB() ? innerHeight + 'px' : ''; }
}
addEventListener('resize', resize); resize();
addEventListener('orientationchange', () => setTimeout(resize, 250));
window.visualViewport?.addEventListener('resize', () => { if (MOB()) resize(); });
function matrices(eye, B) {
  const { r, d, f } = B;
  const view = new Float32Array([r[0], d[0], f[0], 0, r[1], d[1], f[1], 0, r[2], d[2], f[2], 0, -dot(r, eye), -dot(d, eye), -dot(f, eye), 1]);
  const fy = H / (2 * Math.tan(FOV / 2)), fx = fy;
  const zn = 0.5, zf = 30000;
  const proj = new Float32Array([2 * fx / W, 0, 0, 0, 0, -2 * fy / H, 0, 0, 0, 0, zf / (zf - zn), 1, 0, 0, -(zf * zn) / (zf - zn), 0]);
  return { view, proj, fx, fy };
}

/* ---------------------------------------------------------------- time of day */
const KEYS = [
  { t: 0.0, az: 115, el: 28, sun: [2.3, 1.95, 1.55], sky: [0.22, 0.30, 0.50], gnd: [0.14, 0.12, 0.10], fog: [0.85, 0.78, 0.70], fog2: [0.50, 0.60, 0.76], zen: [0.10, 0.26, 0.66], den: 1 / 7500, exp: 0.85 },
  { t: 0.3, az: 205, el: 42, sun: [2.2, 2.0, 1.75], sky: [0.22, 0.30, 0.50], gnd: [0.14, 0.12, 0.10], fog: [0.72, 0.76, 0.82], fog2: [0.52, 0.62, 0.78], zen: [0.12, 0.30, 0.70], den: 1 / 7000, exp: 0.78 },
  { t: 0.48, az: 234, el: 12, sun: [3.4, 1.62, 0.66], sky: [0.13, 0.15, 0.30], gnd: [0.12, 0.08, 0.06], fog: [1.10, 0.55, 0.26], fog2: [0.36, 0.34, 0.50], zen: [0.08, 0.12, 0.36], den: 1 / 5800, exp: 0.9 },
  { t: 0.64, az: 255, el: -1, sun: [1.2, 0.38, 0.2], sky: [0.09, 0.09, 0.2], gnd: [0.06, 0.04, 0.04], fog: [0.62, 0.26, 0.20], fog2: [0.16, 0.14, 0.28], zen: [0.04, 0.05, 0.16], den: 1 / 4500, exp: 1.1 },
  { t: 0.82, az: 120, el: 38, sun: [0.05, 0.07, 0.13], sky: [0.02, 0.026, 0.05], gnd: [0.01, 0.01, 0.016], fog: [0.07, 0.055, 0.075], fog2: [0.04, 0.045, 0.08], zen: [0.004, 0.007, 0.028], den: 1 / 4200, exp: 1.2 },
  { t: 1.0, az: 120, el: 42, sun: [0.05, 0.07, 0.13], sky: [0.018, 0.024, 0.048], gnd: [0.01, 0.01, 0.016], fog: [0.065, 0.05, 0.07], fog2: [0.035, 0.04, 0.075], zen: [0.004, 0.006, 0.025], den: 1 / 4200, exp: 1.2 },
];
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function tod(t) {
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const A = KEYS[i], B = KEYS[i + 1]; let k = Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t))); k = k * k * (3 - 2 * k);
  let az = lerp(A.az, B.az, k), el = lerp(A.el, B.el, k);
  if (A.az > B.az) { az = k < 0.5 ? A.az : B.az; el = k < 0.5 ? lerp(A.el, -8, k * 2) : lerp(-8, B.el, (k - 0.5) * 2); }
  const dir = [Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)];
  const night = Math.min(1, Math.max(0, (t - 0.6) / 0.2));
  return { dir, sun: lerp3(A.sun, B.sun, k).map((v) => v * Math.max(0.0, Math.min(1, (el + 6) / 8) * (1 - night) + night)), sky: lerp3(A.sky, B.sky, k), gnd: lerp3(A.gnd, B.gnd, k), fog: lerp3(A.fog, B.fog, k), fog2: lerp3(A.fog2, B.fog2, k), zen: lerp3(A.zen, B.zen, k), den: lerp(A.den, B.den, k), exp: lerp(A.exp, B.exp, k), night: night * night * (3 - 2 * night) };
}
const DUSK = 0.585; // opening light: sunset over Tel Aviv ("דמדומים")
let todV = DUSK, todT = DUSK;
const todEl = $('#tod');
todEl.addEventListener('input', () => { todT = todV = todEl.value / 1000; userTod = true; });
let userTod = false;
function todLabel(t) { return t < 0.2 ? 'בוקר' : t < 0.4 ? 'צהריים' : t < 0.58 ? 'שעת זהב' : t < 0.72 ? 'דמדומים' : 'לילה'; }

/* ---------------------------------------------------------------- story chapters */
const LM = META.landmarks;
const byName = (n) => LM.find((l) => l.name === n);
const fmtD = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' ק״מ' : Math.round(d / 10) * 10 + ' מ׳';
const walk = (d) => Math.max(2, Math.round(d * 1.3 / 80));
const distLine = (n) => { const l = byName(n); return l ? `${n} <b>${fmtD(l.dist)}</b>` : ''; };
const CH = [
  { id: 'city', n: '01', name: 'העיר', cam: { t: [-40, 34, -40], yaw: 127, pitch: 14, dist: 600 }, camM: { t: [0, 30, 0], yaw: 117, pitch: 14, dist: 600 }, tod: DUSK, rings: 0, dim: 0, labels: 'land', orbit: 0.010, hold: 10500,
    k: 'אורון רובע השלום', h: ['יש ערים שחיים בהן.', '<em>ויש עיר שחיים אותה.</em>'],
    p: 'רובע חדש במפגש תל אביב–גבעתיים, על דרך השלום — בין מגדלי עזריאלי ושרונה לבין הירוק של פארק וולפסון.' },
  { id: 'loc', n: '02', name: 'המיקום', cam: { t: [-520, 0, -540], yaw: 30, pitch: 57, dist: 2700 }, tod: 0.4, rings: 1, dim: 0, labels: 'all', orbit: 0.005, fog: 0.4,
    k: 'הכל במרחק הליכה', h: ['כל מה שצריך —', '<em>במרחק הליכה.</em>'],
    p: [distLine('תחנת רכבת השלום'), distLine('קניון עזריאלי'), distLine('מתחם שרונה'), distLine('פארק וולפסון')].filter(Boolean).join(' · ') + '<br>טבעות האור: 500 מ׳ · 1 ק״מ · 1.5 ק״מ · 2 ק״מ (מרחק אווירי)' },
  { id: 'rail', n: '03', name: 'הרכבת הקלה', cam: { t: [250, 0, 330], yaw: 200, pitch: 31, dist: 1150 }, camM: { t: [210, 0, 240], yaw: 196, pitch: 60, dist: 2300 }, tod: 0.42, rings: 0, dim: 0, labels: 'none', orbit: 0, fog: 0.35, rail: true,
    k: 'הקו הסגול · רכבת קלה', h: ['הרכבת הקלה —', '<em>רק 900 מ׳ מהבית.</em>'],
    p: 'תחנת <b>המאבק</b> של הקו הסגול נמצאת על דרך השלום — כ-700 מ׳, <b>9 דקות הליכה</b> מהבית. משם ישירות להגנה, לאלנבי, לדיזנגוף ולארלוזורוב.' },
  { id: 'proj', n: '04', name: 'הפרויקט', cam: { t: [2, 20, 0], yaw: 224, pitch: 17, dist: 200 }, tod: 0.48, rings: 0, dim: 0.4, labels: 'bld', orbit: 0.028, panel: true,
    k: 'כנען שנהב אדריכלים', h: ['4 בניינים. 172 בתים.', '<em>9 ו-15 קומות.</em>'],
    p: 'שני מגדלים לדרך השלום ושני בניינים לרחוב עמישב, סביב חצר פנימית ירוקה. חיפוי אבן נסורה, אלומיניום וזכוכית. <b>לחצו על קומה</b> — וגלו מה מחכה בה.' },
  { id: 'apts', n: '05', name: 'הדירות', action: () => window.HELLO_APT?.openGallery() },
  { id: 'spec', n: '06', name: 'מפרט טכני', action: () => window.HELLO_PAGES?.open('spec') },
  { id: 'gallery', n: '07', name: 'הדמיות', action: () => window.HELLO_APT?.openCinema('ext') },
  { id: 'film', n: '08', name: 'סרטון הפרויקט', action: () => window.HELLO_PAGES?.open('film') },
  { id: 'about', n: '09', name: 'אודות הפרויקט', action: () => window.HELLO_ABOUT?.open() },
];
let chapter = -1, rings = 0, ringsT = 0, dim = 0, dimT = 0, orbit = 0.01, fogK = 1, fogKT = 1;
const nav = $('#chapters');
CH.forEach((c, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span class="tx">${c.name}</span>`;
  if (c.action) b.className = 'act';
  b.onclick = () => { stopTour(); if (c.action) { c.action(); return; } goChapter(i); };
  nav.appendChild(b);
});
let afterTimer = 0;
function goChapter(i) {
  if (CH[i].action) { CH[i].action(); i = (i + 1) % CH.length; while (CH[i].action) i = (i + 1) % CH.length; }
  chapter = i; const c = CH[i];
  clearTimeout(afterTimer); if (c.after) afterTimer = setTimeout(() => { if (chapter === i) c.after(); }, 3600);
  [...nav.children].forEach((b, j) => b.classList.toggle('on', j === i));
  const cc = (isPhone() && c.camM) || c.cam;
  Object.assign(camT, { yaw: cc.yaw * D2R, pitch: cc.pitch * D2R, dist: cc.dist, t: [...cc.t] });
  unwrapYaw();
  if (!userTod || c.id === 'night' || CH[prevCh]?.id === 'night') { todT = c.tod; }
  userTod = false;
  ringsT = c.rings; dimT = c.dim; orbit = c.orbit; fogKT = c.fog || 1;
  const cap = $('#caption'); cap.classList.remove('show');
  setTimeout(() => {
    cap.innerHTML = `<div class="k">${c.k}</div><h1>${c.h.map((l) => `<span class="ln"><span>${l}</span></span>`).join('')}</h1>`;
    requestAnimationFrame(() => requestAnimationFrame(() => cap.classList.add('show')));
  }, 380);
  $('#units').classList.toggle('on', !!c.panel);
  walkPanel(!!c.walk);
  railPanel(!!c.rail);
  if (!c.panel) { sel.on = false; } else if (sel.b < 0) { selectBuilding(0, false); }
  lastInteract = performance.now() - 5000 + (c.hold || 0);
  document.body.dataset.ch = c.id;
  prevCh = i;
}
let prevCh = -1;
function unwrapYaw() { while (camT.yaw - cam.yaw > Math.PI) camT.yaw -= 2 * Math.PI; while (camT.yaw - cam.yaw < -Math.PI) camT.yaw += 2 * Math.PI; }

/* ---------------------------------------------------------------- labels */
const labelsEl = $('#labels');
const labels = [];
function addLabel(name, sub, posv, cls, dist, kind) {
  const el = document.createElement('div'); el.className = 'lbl ' + (cls || '');
  let html = `<div class="t">${name}</div>`;
  if (sub) html += `<div class="s">${sub}</div>`;
  if (dist) html += `<div class="d"><bdi>${fmtD(dist)}</bdi><span>·</span><span>${walk(dist)} דק׳ הליכה</span></div>`;
  el.innerHTML = html; labelsEl.appendChild(el);
  labels.push({ el, pos: posv, kind, bi: kind === 'bld' ? labels.filter((x) => x.kind === 'bld').length : -1 });
}
for (const l of LM) {
  const park = /פארק|גן/.test(l.name);
  const minor = /אלקטרה|אלון|הארבעה|איילון/.test(l.name);
  addLabel(l.name, l.sub, l.pos, l.street ? 'street' : '', l.street ? 0 : l.dist, l.street ? 'street' : park ? 'park' : minor ? 'minor' : 'land');
}
addLabel('<b>HELLO</b> TLV', 'אורון רובע השלום', [0, 58, 0], 'hero', 0, 'hero');
for (const b of META.buildings) {
  const c = b.center;
  addLabel(`בניין ${b.id}`, b.kind === 'tower' ? `${b.floors} קומות · 56 דירות` : `${b.floors} קומות · 30 דירות`, [c[0], b.height + 4, -c[1]], 'bld', 0, 'bld');
}

/* ---------------------------------------------------------------- apartment finder */
const U = (type, rooms, area, out, ex, no) => ({ type, rooms, area, out, ex, no });
const EXP = { // per plan sheets of buildings 1 & 2
  GRa: 'צפון-מערב · צפון-מזרח', GRb: 'צפון-מזרח · דרום-מזרח · דרום-מערב', A: 'דרום-מערב · צפון-מערב', B: 'צפון-מערב · צפון-מזרח',
  C: 'צפון-מזרח · דרום-מזרח · דרום-מערב', D: 'דרום-מערב · דרום-מזרח', C1: 'צפון-מזרח · דרום-מזרח · דרום-מערב', D1: 'דרום-מערב · דרום-מזרח',
  PHa: 'צפון-מערב · דרום-מערב · דרום-מזרח', PHb: 'צפון-מערב · צפון-מזרח · דרום-מזרח',
  E: 'דרום-מערב · צפון-מערב', F: 'צפון-מערב · צפון-מזרח', G: 'צפון-מזרח · דרום-מזרח', H: 'דרום-מערב · דרום-מזרח',
  PHc: 'צפון-מזרח · צפון-מערב · דרום-מערב', PHd: 'צפון-מזרח · דרום-מזרח · דרום-מערב',
};
function unitsFor(kind, f) {
  if (kind === 'tower') {
    if (f === 0) return [U('GRa', 3, 83.3, 'גינה כ-104 מ״ר', 'GRa', 1), U('GRb', 5, 120.3, 'גינה כ-52.7 + 10.7 מ״ר', 'GRb', 2)];
    if (f === 14) return [U('PHa', 5, 143, 'מרפסת גג כ-43.6 מ״ר', 'PHa', 55), U('PHb', 5, 162.4, 'מרפסת גג כ-42.3 + 10.1 מ״ר', 'PHb', 56)];
    const c = f === 10 ? U('C1', 4, 104.2, 'מרפסת כ-12 מ״ר', 'C1', 41) : U('C', 4, 100.1, 'מרפסת כ-12 מ״ר', 'C', 4 * f + 1);
    const d = f === 10 ? U('D1', 5, 120.3, 'מרפסת כ-12 מ״ר', 'D1', 42) : U('D', 5, 124.4, 'מרפסת כ-12 מ״ר', 'D', 4 * f + 2);
    return [U('A', 3, 82, 'מרפסת כ-12 מ״ר', 'A', 4 * f - 1), U('B', 3, 82.7, 'מרפסת כ-12 מ״ר', 'B', 4 * f), c, d];
  }
  if (f === 0) return [];
  if (f === 8) return [U('PHc', 4, 153.4, 'מרפסת גג כ-42.4 + 6.6 מ״ר', 'PHc', 29), U('PHd', 5, 147.2, 'מרפסת גג כ-49.6 מ״ר', 'PHd', 30)];
  return [U('E', 3, 82.4, 'מרפסת כ-12 מ״ר', 'E', 4 * f - 3), U('F', 3, 82.9, 'מרפסת כ-12.2 מ״ר', 'F', 4 * f - 2), U('G', 3, 82.9, 'מרפסת כ-12.2 מ״ר', 'G', 4 * f - 1), U('H', 5, 118.6, 'מרפסת כ-12 מ״ר', 'H', 4 * f)];
}
const sel = { b: -1, f: -1, on: false, explode: true };
let selZ = 0, explodeV = 0, hoverB = -1;
// site svg (north up)
(function siteSvg() {
  const svg = $('#siteSvg');
  const all = META.plot.map(([x, z]) => [x, -z]).concat(...META.buildings.map((b) => b.footprint));
  const xs = all.map((p) => p[0]), ns = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), n0 = Math.min(...ns), n1 = Math.max(...ns);
  const s = Math.min(112 / (x1 - x0), 96 / (n1 - n0));
  const P = (p) => `${(4 + (p[0] - x0) * s).toFixed(1)},${(4 + (n1 - p[1]) * s).toFixed(1)}`;
  let h = `<polygon points="${META.plot.map(([x, z]) => P([x, -z])).join(' ')}" fill="none" stroke="rgba(234,211,182,.35)" stroke-dasharray="2 2" stroke-width=".6"/>`;
  META.buildings.forEach((b, i) => {
    const c = b.center;
    h += `<polygon class="fp" data-i="${i}" points="${b.footprint.map(P).join(' ')}"/><text x="${P(c).split(',')[0]}" y="${P(c).split(',')[1]}">${b.id}</text>`;
  });
  h += `<text x="10" y="8" style="font-size:6px;opacity:.6">N↑</text>`;
  svg.innerHTML = h;
  svg.querySelectorAll('.fp').forEach((el) => el.addEventListener('click', () => selectBuilding(+el.dataset.i, true)));
})();
function selectBuilding(i, focusCam) {
  sel.b = i; const b = META.buildings[i];
  $('#siteSvg').querySelectorAll('.fp').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
  $('#bInfo').innerHTML = `<div class="n">בניין ${b.id}</div><div class="m">${b.kind === 'tower' ? 'מגדל לדרך השלום' : 'בניין לרחוב עמישב'}<br>${b.floors} קומות · ${b.kind === 'tower' ? 56 : 30} דירות<br>גובה כ-${Math.round(b.height)} מ׳</div>`;
  const fl = $('#floors'); fl.innerHTML = '';
  for (let f = b.floors - 1; f >= 0; f--) {
    const bt = document.createElement('button');
    const ph = f === b.floors - 1;
    bt.innerHTML = f === 0 ? 'קרקע' : ph ? `${f}<small>פנטהאוז</small>` : `${f}`;
    if (ph) bt.style.height = '36px';
    bt.dataset.f = f;
    bt.onclick = () => selectFloor(f, true);
    bt.onmouseenter = () => { if (!sel.on) previewFloor(f); };
    fl.appendChild(bt);
  }
  selectFloor(b.kind === 'tower' ? 10 : 5, false);
  if (focusCam) {
    const c = b.center;
    camT.t = [c[0], b.height * 0.45, -c[1]];
    camT.dist = Math.max(110, b.height * 2.8);
    camT.pitch = 14 * D2R;
    camT.yaw = Math.atan2(c[0], -c[1]); unwrapYaw();
    lastInteract = performance.now();
  }
}
function previewFloor(f) { sel.f = f; }
function selectFloor(f, user) {
  sel.f = f; sel.on = !!user || sel.on;
  if (user) sel.on = true;
  const b = META.buildings[sel.b];
  $('#floors').querySelectorAll('button').forEach((el) => el.classList.toggle('on', +el.dataset.f === f));
  const us = unitsFor(b.kind, f);
  const lvl = b.levels[f];
  let h = `<div class="fh">${f === 0 ? 'קומת קרקע' : f === b.floors - 1 ? `קומה ${f} · פנטהאוזים` : `קומה ${f}`}<span>גובה ~${lvl ? lvl.y0.toFixed(1) : '-'} מ׳ מעל הרחוב</span></div>`;
  if (!us.length) h += `<div class="card"><div class="rm">לובי כניסה מעוצב</div><div class="meta">שטחים משותפים · כניסה לבניין</div></div>`;
  for (const u of us) {
    h += `<div class="card"><div class="r1"><span class="ty">טיפוס <bdi>${u.type}</bdi></span><span class="no">דירה מס׳ ${u.no}</span></div>
      <div class="rm">${u.rooms} חדרים</div>
      <div class="meta"><span>שטח <b>${u.area}</b> מ״ר</span><span>${u.out}</span></div>
      ${(sel.b === 0 || sel.b === 1) ? `<div class="ex">כיווני אוויר: ${EXP[u.ex]}</div>` : ''}
      <button class="cta" data-type="${u.type}">תכנית וסיור תלת ממדי ←</button></div>`;
  }
  if (f === 0 && b.kind === 'tower') h += `<div class="card"><div class="rm">לובי כניסה מעוצב</div><div class="meta">פונה לחצר הפנימית</div></div>`;
  h += `<button class="allp" id="allPlans">כל תכניות בניין ${b.id} ←</button><div class="note">הנתונים מתוך תכניות המכר (שטחים בקירוב). ההדמיה להמחשה בלבד ואינה מהווה חלק מהסכם המכר.</div>`;
  $('#cards').innerHTML = h;
  $('#cards').querySelectorAll('.cta').forEach((bt) => bt.addEventListener('click', () => {
    const pg = window.HELLO_APT?.pageFor(bt.dataset.type, b.id); if (pg) window.HELLO_APT.openApt(pg, { tour: true });
  }));
  $('#allPlans').onclick = () => window.HELLO_APT?.openGallery({ building: b.id });
  const btn = $('#floors').querySelector(`button[data-f="${f}"]`); if (btn && user) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (user) {
    const c = b.center;
    camT.t = [c[0], (lvl ? lvl.y0 : 10) + 2, -c[1]];
    camT.dist = sel.explode ? 105 : Math.max(80, Math.min(camT.dist, 140));
    if (sel.explode) { camT.pitch = Math.max(camT.pitch, 50 * D2R); camT.yaw = Math.atan2(c[0], -c[1]); unwrapYaw(); }
    lastInteract = performance.now();
  }
}
$('#bExplode').onclick = (e) => { sel.explode = !sel.explode; e.currentTarget.classList.toggle('on', sel.explode); };

/* ---------------------------------------------------------------- input */
let lastInteract = performance.now();
const ptrs = new Map(); let dragMode = 0, downX = 0, downY = 0, moved = false, pinch0 = 0;
const cursor = [0, 0, 0, 0]; let cursorT = 0;
const pulses = [[0, 0, -99, 0], [0, 0, -99, 0], [0, 0, -99, 0], [0, 0, -99, 0]]; let pulseI = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  dragMode = (e.button === 2 || e.shiftKey || ptrs.size === 3) ? 2 : 1; downX = e.clientX; downY = e.clientY; moved = false;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  stopTour(); lastInteract = performance.now();
});
canvas.addEventListener('pointermove', (e) => {
  const prev = ptrs.get(e.pointerId);
  updateCursor(e.clientX, e.clientY);
  if (!prev) { hoverTest(e.clientX, e.clientY); return; }
  const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch0 > 0) camT.dist = clampD(camT.dist * pinch0 / d); pinch0 = d; return;
  }
  if (dragMode === 1) {
    camT.yaw -= dx * 0.0055; camT.pitch = Math.min(1.45, Math.max(0.04, camT.pitch + dy * 0.004));
  } else {
    const B = basis(eyeOf(cam), cam.t); const k = cam.dist * 0.0016;
    const fwd = norm([B.f[0], 0, B.f[2]]), rt = norm([B.r[0], 0, B.r[2]]);
    camT.t[0] -= (rt[0] * dx - fwd[0] * dy) * k; camT.t[2] -= (rt[2] * dx - fwd[2] * dy) * k;
  }
  lastInteract = performance.now();
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (!moved && ptrs.size === 0 && e.type === 'pointerup') onTap(e.clientX, e.clientY);
  if (ptrs.size < 2) pinch0 = 0;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { cursorT = 0; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); camT.dist = clampD(camT.dist * Math.exp(e.deltaY * 0.0011)); stopTour(); lastInteract = performance.now(); }, { passive: false });
const clampD = (d) => Math.min(5200, Math.max(40, d));
function ray(cx, cy) {
  const eye = eyeOf(cam), B = basis(eye, cam.t);
  const nx = (cx / innerWidth) * 2 - 1, ny = 1 - (cy / innerHeight) * 2;
  const ty = Math.tan(FOV / 2), tx = ty * innerWidth / innerHeight;
  return { o: eye, d: norm([B.f[0] + B.r[0] * nx * tx + B.u[0] * ny * ty, B.f[1] + B.r[1] * nx * tx + B.u[1] * ny * ty, B.f[2] + B.r[2] * nx * tx + B.u[2] * ny * ty]) };
}
function ground(r, y = 0) { if (r.d[1] > -1e-4) return null; const t = (y - r.o[1]) / r.d[1]; return [r.o[0] + r.d[0] * t, y, r.o[2] + r.d[2] * t]; }
function pip(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function hitBuilding(r) {
  // march along ray through the plot volume
  const tmin = Math.max(1, Math.hypot(r.o[0], r.o[2]) - 120), tmax = Math.hypot(r.o[0], r.o[1], r.o[2]) + 120;
  for (let t = tmin; t < tmax; t += 0.45) {
    const x = r.o[0] + r.d[0] * t, y = r.o[1] + r.d[1] * t, z = r.o[2] + r.d[2] * t;
    if (y < 0) return null;
    if (Math.abs(x) > 60 || Math.abs(z) > 60) continue;
    for (let i = 0; i < META.buildings.length; i++) {
      const b = META.buildings[i];
      const lift = (sel.on && sel.b === i && sel.explode) ? 15 : 0;
      if (y < b.height + lift && pip(b.footprint, x, -z)) {
        let f = 0;
        for (const lv of b.levels) {
          const L = lv.floor > sel.f && sel.on && sel.b === i ? lift : 0;
          if (y >= lv.y0 + L) f = lv.floor;
        }
        return { i, f, p: [x, y, z] };
      }
    }
  }
  return null;
}
function updateCursor(cx, cy) {
  const g = ground(ray(cx, cy)); if (!g) { cursorT = 0; return; }
  cursor[0] = g[0]; cursor[1] = g[1]; cursor[2] = g[2]; cursorT = 1; lastMove = performance.now();
}
let lastMove = 0, hoverAt = 0;
function hoverTest(cx, cy) {
  if (performance.now() - hoverAt < 60 || cam.dist > 900) { if (cam.dist > 900) hoverB = -1; return; }
  hoverAt = performance.now();
  const h = hitBuilding(ray(cx, cy)); hoverB = h ? h.i : -1;
  canvas.style.cursor = h ? 'pointer' : 'crosshair';
}
function onTap(cx, cy) {
  const r = ray(cx, cy);
  const h = cam.dist < 1500 ? hitBuilding(r) : null;
  if (h) {
    if (CH[chapter]?.id !== 'proj') goChapter(CH.findIndex((c) => c.id === 'proj'));
    if (sel.b !== h.i) selectBuilding(h.i, false);
    selectFloor(h.f, true);
    window.HELLO_SHEET?.open('units');
    firePulse(h.p[0], h.p[2], 0.5);
    return;
  }
  const g = ground(r); if (g) firePulse(g[0], g[2], 1);
}
function firePulse(x, z, amp) { pulses[pulseI] = [x, z, now(), amp]; pulseI = (pulseI + 1) % 4; }

/* ---------------------------------------------------------------- tour, capture, replay */
let tour = false, tourAt = 0;
function stopTour() { tour = false; }
let shot = false;
$('#skip').onclick = () => { introStart = now() - 30; endIntro(); };

/* ---------------------------------------------------------------- intro */
const T0 = performance.now(); const now = () => (performance.now() - T0) / 1000;
let introStart = 0, introDone = false, altOff = false;
const logo = { c: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0] };
function startIntro() {
  document.body.classList.add('intro'); introDone = false;
  // opening frame faces west, into the sunset over the sea (same heading as the City chapter)
  Object.assign(cam, { yaw: 124 * D2R, pitch: 11 * D2R, dist: 640, t: [-20, 45, -20] });
  Object.assign(camT, { yaw: 127 * D2R, pitch: 14 * D2R, dist: 560, t: [-40, 34, -40] });
  // phones: aim at the phone framing of the City chapter (project centred, sun in frame) and start already
  // pointed there, so the camera only dollies in and the logo stays centred
  if (isPhone()) { const m = CH[0].camM; Object.assign(camT, { yaw: m.yaw * D2R, pitch: m.pitch * D2R, t: m.t.slice() }); Object.assign(cam, { yaw: camT.yaw, pitch: camT.pitch, t: camT.t.slice() }); }
  todV = todT = DUSK; todEl.value = Math.round(DUSK * 1000); ringsT = rings = 0; dimT = dim = 0; sel.on = false;
  $('#units').classList.remove('on');
  // logo plane in front of the opening camera
  const eye = eyeOf(cam), B = basis(eye, cam.t);
  const D = 300, half = Math.tan(FOV / 2) * D * Math.min(1.5, innerWidth / innerHeight) * 0.6;
  logo.c = [eye[0] + B.f[0] * D, eye[1] + B.f[1] * D + 28, eye[2] + B.f[2] * D];
  logo.r = B.r.map((v) => v * half); logo.u = B.u.map((v) => v * half);
  const alt = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) {
    const lx = logoXY[i * 2] / 16000, ly = logoXY[i * 2 + 1] / 16000;
    for (let k = 0; k < 3; k++) alt[i * 3 + k] = logo.c[k] + logo.r[k] * lx + logo.u[k] * ly;
  }
  worker.postMessage({ alt, useAlt: true }); altOff = false;
  introStart = now();
  $('#skip').classList.add('on');
  lastSortE = [1e9, 0, 0];
}
function endIntro() {
  if (introDone) return; introDone = true;
  worker.postMessage({ useAlt: false }); lastSortE = [1e9, 0, 0];
  document.body.classList.remove('intro'); $('#skip').classList.remove('on');
  goChapter(0);
  $('#hint').classList.add('on'); setTimeout(() => $('#hint').classList.remove('on'), 9000);
}

/* ---------------------------------------------------------------- frame */
let lastT = now(), fpsAcc = 0, fpsN = 0;
/* ---------------------------------------------------------------- walking routes */
const walkCv = document.createElement('canvas'); walkCv.id = 'walk2d'; canvas.after(walkCv); resize();
const wctx = walkCv.getContext('2d');
const WCOL = { park: '#9be08f', station: '#a9c8ff', azrieli: '#f2b48d', sarona: '#f0d9a8', beach: '#7fe0ea' };
const wk = { on: false, sel: -1, t0: 0 };
if (WALKS) for (const r of WALKS.routes) {
  let L = 0; r.cum = [0];
  for (let i = 1; i < r.path.length; i++) { L += Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]); r.cum.push(L); }
  r.len = L;
}
const gmEmbed = (r) => `https://maps.google.com/maps?saddr=${WALKS.home.lat},${WALKS.home.lon}&daddr=${encodeURIComponent(r.q)}&dirflg=w&hl=iw&output=embed`;
const gmDir = (r) => `https://www.google.com/maps/dir/?api=1&origin=${WALKS.home.lat},${WALKS.home.lon}&destination=${encodeURIComponent(r.q)}&travelmode=walking`;
const gmPano = (r) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${r.lat},${r.lon}`;
function buildWalkPanel() {
  if (!WALKS) return;
  $('#wkList').innerHTML = WALKS.routes.map((r, i) => `<button data-i="${i}" style="--c:${WCOL[r.id]}">
    <i></i><span class="t"><b>${r.name}</b><small>${r.sub}</small></span>
    <span class="m"><b>${r.min}</b><small>דק׳ הליכה</small><em><bdi>${r.dist >= 1000 ? (r.dist / 1000).toFixed(1) + ' ק״מ' : r.dist + ' מ׳'}</bdi></em></span></button>`).join('');
  $('#wkList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectWalk(+b.dataset.i)));
  $('#wkFull').onclick = () => { const r = WALKS.routes[wk.sel]; if (!r) return; $('#gmBig').src = gmEmbed(r); $('#gmTitle').textContent = `הליכה מהבית אל ${r.name}`; $('#gmOpen2').href = gmDir(r); $('#gmView').classList.add('on'); };
  $('#gmClose').onclick = () => { $('#gmView').classList.remove('on'); $('#gmBig').src = 'about:blank'; };
}
buildWalkPanel();
function walkPanel(on) {
  wk.on = on && !!WALKS; $('#walks').classList.toggle('on', wk.on);
  if (!wk.on) { wk.sel = -1; return; }
  wk.t0 = now(); if (wk.sel < 0) showWalkMap(-1);
}
function showWalkMap(i) {
  const r = WALKS.routes[i];
  $('#wkMap').classList.toggle('has', !!r);
  $('#wkList').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  if (!r) { $('#wkFrame').src = 'about:blank'; return; }
  $('#wkFrame').src = gmEmbed(r);
  $('#wkGo').href = gmDir(r); $('#wkSv').href = gmPano(r);
  $('#wkDest').innerHTML = `<b>${r.name}</b> · <bdi>${r.dist >= 1000 ? (r.dist / 1000).toFixed(1) + ' ק״מ' : r.dist + ' מ׳'}</bdi> · כ-${r.min} דק׳ הליכה`;
}
function selectWalk(i) {
  const r = WALKS.routes[i]; wk.sel = i; wk.t0 = now(); showWalkMap(i);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of r.path) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const L = Math.hypot(x1 - x0, z1 - z0), e = r.path[r.path.length - 1];
  camT.t = [(x0 + x1) / 2, 0, (z0 + z1) / 2];
  camT.dist = L * 1.5 + 650; camT.pitch = 50 * D2R;
  camT.t = [camT.t[0] * 0.85, 0, camT.t[2] * 0.85];
  camT.yaw = Math.atan2(0 - e[0], 0 - e[1]); unwrapYaw();
  lastInteract = performance.now();
}
function drawWalks(eye, B, fy, t) {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (MOB() && (Math.floor(w * DPR) !== W || Math.floor(h * DPR) !== H)) resize(); // iOS toolbar show/hide without a resize event
  if (walkCv.width !== Math.round(w * dpr) || walkCv.height !== Math.round(h * dpr)) { walkCv.width = Math.round(w * dpr); walkCv.height = Math.round(h * dpr); }
  wctx.setTransform(1, 0, 0, 1, 0, 0); wctx.clearRect(0, 0, walkCv.width, walkCv.height);
  if (!(wk.on && WALKS) && !rl.on) return;
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const P = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const cz = B.f[0] * dx + B.f[1] * dy + B.f[2] * dz; if (cz < 1) return null;
    return [((B.r[0] * dx + B.r[1] * dy + B.r[2] * dz) * fy / cz) / DPR + w / 2, ((B.d[0] * dx + B.d[1] * dy + B.d[2] * dz) * fy / cz) / DPR + h / 2];
  };
  if (rl.on) { drawRail(P, t); return; }
  const age = t - wk.t0;
  WALKS.routes.forEach((r, i) => {
    const sel = i === wk.sel, any = wk.sel >= 0;
    const prog = sel ? Math.min(1, age / 2.6) : 1;
    const lim = r.len * (prog < 1 ? 1 - Math.pow(1 - prog, 3) : 1);
    const pts = []; let tip = null;
    for (let k = 0; k < r.path.length; k++) {
      if (r.cum[k] > lim) { const a = r.path[k - 1], b2 = r.path[k], f = (lim - r.cum[k - 1]) / (r.cum[k] - r.cum[k - 1]); tip = [a[0] + (b2[0] - a[0]) * f, a[1] + (b2[1] - a[1]) * f]; const q = P(tip[0], 2, tip[1]); if (q) pts.push(q); break; }
      const q = P(r.path[k][0], 2, r.path[k][1]); if (q) pts.push(q);
    }
    if (pts.length < 2) return;
    const col = WCOL[r.id] || '#fff';
    wctx.lineJoin = 'round'; wctx.lineCap = 'round';
    wctx.globalAlpha = any && !sel ? 0.28 : 1;
    wctx.strokeStyle = col; wctx.shadowColor = col;
    wctx.shadowBlur = sel ? 22 : 10; wctx.lineWidth = sel ? 6 : 3.5;
    wctx.beginPath(); pts.forEach((q, k) => (k ? wctx.lineTo(q[0], q[1]) : wctx.moveTo(q[0], q[1]))); wctx.stroke();
    wctx.shadowBlur = 0; wctx.lineWidth = sel ? 2 : 1.2; wctx.strokeStyle = 'rgba(255,255,255,.85)'; wctx.stroke();
    if (sel) {
      // walker dots travelling along the route
      wctx.setLineDash([2, 22]); wctx.lineDashOffset = -t * 60; wctx.lineWidth = 7; wctx.strokeStyle = '#fff'; wctx.globalAlpha = 0.9; wctx.stroke(); wctx.setLineDash([]);
    }
    const end = P(r.path[r.path.length - 1][0], 2, r.path[r.path.length - 1][1]);
    if (end && prog >= 1) {
      wctx.globalAlpha = any && !sel ? 0.45 : 1;
      wctx.fillStyle = col; wctx.shadowColor = col; wctx.shadowBlur = 18;
      wctx.beginPath(); wctx.arc(end[0], end[1], sel ? 9 : 6, 0, Math.PI * 2); wctx.fill(); wctx.shadowBlur = 0;
      if (sel) { const rr = 9 + ((t * 18) % 26); wctx.strokeStyle = col; wctx.lineWidth = 2; wctx.globalAlpha = Math.max(0, 1 - (rr - 9) / 26); wctx.beginPath(); wctx.arc(end[0], end[1], rr, 0, Math.PI * 2); wctx.stroke(); wctx.globalAlpha = 1; }
      wctx.direction = 'rtl'; wctx.textAlign = 'center';
      wctx.font = `${sel ? 700 : 600} ${sel ? 20 : 15}px Almoni, sans-serif`;
      wctx.fillStyle = '#fff'; wctx.shadowColor = 'rgba(0,0,0,.8)'; wctx.shadowBlur = 8;
      wctx.fillText(r.name, end[0], end[1] - (sel ? 34 : 22));
      wctx.font = `500 ${sel ? 13 : 11.5}px Almoni, sans-serif`; wctx.fillStyle = col;
      wctx.fillText(`${r.min} דק׳ · ${r.dist >= 1000 ? (r.dist / 1000).toFixed(1) + ' ק״מ' : r.dist + ' מ׳'}`, end[0], end[1] - (sel ? 16 : 9));
      wctx.shadowBlur = 0;
    }
  });
  // home marker
  const hm = P(0, 4, 0);
  if (hm) {
    wctx.globalAlpha = 1; const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    wctx.fillStyle = '#ead3b6'; wctx.shadowColor = '#f2b48d'; wctx.shadowBlur = 20 + pulse * 10;
    wctx.beginPath(); wctx.arc(hm[0], hm[1], 8, 0, Math.PI * 2); wctx.fill(); wctx.shadowBlur = 0;
    wctx.direction = 'rtl'; wctx.textAlign = 'center'; wctx.font = '700 22px Almoni, sans-serif'; wctx.fillStyle = '#fff';
    wctx.shadowColor = 'rgba(0,0,0,.8)'; wctx.shadowBlur = 8; wctx.fillText('HELLO TLV · הבית', hm[0], hm[1] - 18); wctx.shadowBlur = 0;
  }
}

/* ---------------------------------------------------------------- light rail · Purple Line */
const rl = { on: false, t0: 0 };
const PURPLE = '#a06bff', PURPLE_HI = '#d9c2ff';
if (RAIL) {
  const w = RAIL.walk; let L = 0; w.cum = [0];
  for (let i = 1; i < w.path.length; i++) { L += Math.hypot(w.path[i][0] - w.path[i - 1][0], w.path[i][1] - w.path[i - 1][1]); w.cum.push(L); }
  w.len = L;
  const st = RAIL.stations.find((s) => s.kind === 'home');
  const home = WALKS?.home || { lat: 32.063556, lon: 34.803764 };
  $('#rlGo').href = `https://www.google.com/maps/dir/?api=1&origin=${home.lat},${home.lon}&destination=${st.lat},${st.lon}&travelmode=walking`;
  $('#rlSv').href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${st.lat},${st.lon}`;
}
function railPanel(on) { rl.on = on && !!RAIL; $('#rail').classList.toggle('on', rl.on); document.body.classList.toggle('rail-on', rl.on); if (rl.on) rl.t0 = now(); }
function pill(x, y, txt, sub, o = {}) {
  const c = wctx; c.save(); c.direction = 'rtl'; c.textAlign = 'center';
  if (MOB()) { c.translate(x, y); c.scale(0.7, 0.7); x = 0; y = 0; } // phones: signs 30% smaller
  const f1 = `700 ${o.big ? 24 : 17}px Almoni, sans-serif`, f2 = `600 ${o.big ? 13 : 11}px Almoni, sans-serif`;
  c.font = f1; const w1 = c.measureText(txt).width; c.font = f2; const w2 = sub ? c.measureText(sub).width : 0;
  const W = Math.max(w1, w2) + (o.big ? 34 : 22), H = (o.big ? 34 : 25) + (sub ? (o.big ? 17 : 14) : 0), r = 10, tip = 9;
  const bx = x - W / 2, by = y - H - tip - (o.lift || 0);
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
  c.fillStyle = o.fill || 'rgba(47,33,25,.94)'; c.strokeStyle = o.stroke || 'rgba(234,211,182,.55)'; c.lineWidth = o.big ? 2 : 1.2;
  c.beginPath(); c.moveTo(bx + r, by); c.arcTo(bx + W, by, bx + W, by + H, r); c.arcTo(bx + W, by + H, bx, by + H, r);
  c.lineTo(x + tip * 0.8, by + H); c.lineTo(x, by + H + tip); c.lineTo(x - tip * 0.8, by + H);
  c.arcTo(bx, by + H, bx, by, r); c.arcTo(bx, by, bx + W, by, r); c.closePath(); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0; c.stroke();
  c.fillStyle = o.color || '#fff'; c.font = f1; c.fillText(txt, x, by + (o.big ? 26 : 19));
  if (sub) { c.font = f2; c.fillStyle = o.subColor || '#ead3b6'; c.fillText(sub, x, by + (o.big ? 44 : 33)); }
  c.restore();
}
/* light-rail trams running along the Purple Line, stopping at each station (time-lapse speed) */
const TRAM = (() => {
  if (!RAIL) return null;
  const L = RAIL.purple.reduce((a, b) => (b.length > a.length ? b : a));
  const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
  const proj = (p) => { let best = 1e18, s = 0; for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1; const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)); const d = Math.hypot(a[0] + dx * f - p[0], a[1] + dz * f - p[1]); if (d < best) { best = d; s = cum[i - 1] + Math.sqrt(l2) * f; } } return [s, best]; };
  const stops = RAIL.stations.map((s) => proj(s.p)).filter(([, d]) => d < 120).map(([s]) => s).sort((a, b) => a - b);
  const at = (s) => { s = Math.max(0, Math.min(cum[cum.length - 1], s)); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = L[i - 1], b = L[i]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  // ping-pong timetable between first and last stop: travel with ease-in/out, dwell at each station
  const SPEED = 70, DWELL = 2.2, legs = []; let T = 0;
  const seq = [...stops, ...stops.slice(1, -1).reverse()];
  for (let k = 0; k < seq.length; k++) { const a = seq[k], b = seq[(k + 1) % seq.length], dur = Math.abs(b - a) / SPEED; legs.push({ a, b, t0: T, dur }); T += dur + DWELL; }
  const pos = (time) => { const tt = ((time % T) + T) % T; for (const g of legs) { if (tt < g.t0 + g.dur + DWELL) { const f = Math.min(1, Math.max(0, (tt - g.t0) / g.dur)), e = f * f * (3 - 2 * f); return { s: g.a + (g.b - g.a) * e, dir: Math.sign(g.b - g.a) || 1 }; } } return { s: stops[0], dir: 1 }; };
  return { at, pos, period: T, ok: stops.length > 1 };
})();
function drawTrams(P, t) {
  if (!TRAM?.ok) return;
  const c = wctx, CAR = 46, GAP = 5, N = 3, W = innerWidth, H = innerHeight;
  for (const off of [0, 0.34, 0.67]) {
    const { s, dir } = TRAM.pos(t + off * TRAM.period);
    const pt = (d) => { const w = TRAM.at(s - dir * d); return P(w[0], 7, w[1]); };
    const head = pt(0); if (!head || head[0] < -80 || head[0] > W + 80 || head[1] < -80 || head[1] > H + 80) continue;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    const cars = [];
    for (let k = 0; k < N; k++) { const q = []; for (let j = 0; j <= 4; j++) { const p = pt(k * (CAR + GAP) + CAR * (j / 4)); if (p) q.push(p); } if (q.length > 1) cars.push(q); }
    const ln = (q) => { c.beginPath(); q.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); };
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
    for (const q of cars) { ln(q); c.lineWidth = 21; c.strokeStyle = '#1d0b3d'; c.stroke(); }
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    for (const q of cars) {
      ln(q); c.lineWidth = 17; c.strokeStyle = '#f6f3fc'; c.stroke();                     // white car body
      ln(q); c.lineWidth = 7; c.strokeStyle = '#7a3fe0'; c.stroke();                       // purple livery band
      ln(q); c.lineCap = 'butt'; c.setLineDash([5, 3]); c.lineWidth = 3.4; c.strokeStyle = '#17112a'; c.stroke(); c.setLineDash([]); c.lineCap = 'round'; // windows
    }
    c.fillStyle = '#fff6d8'; c.shadowColor = '#ffe9a8'; c.shadowBlur = 18;                  // headlight
    c.beginPath(); c.arc(head[0], head[1], 4.5, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    c.restore();
    const mid = pt((N * (CAR + GAP)) / 2);
    if (mid) {
      c.save(); c.direction = 'rtl'; c.textAlign = 'center'; c.font = `700 ${MOB() ? 10 : 14}px Almoni, sans-serif`;
      c.fillStyle = '#fff'; c.shadowColor = 'rgba(30,10,60,.95)'; c.shadowBlur = 8; c.fillText('רכבת קלה', mid[0], mid[1] - (MOB() ? 13 : 18)); c.restore();
    }
  }
}
function drawRail(P, t) {
  const c = wctx, age = t - rl.t0;
  const poly = (pts, y) => { const out = []; for (const p of pts) { const q = P(p[0], y, p[1]); if (q) out.push(q); } return out; };
  const path = (q) => { c.beginPath(); q.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); };
  c.lineJoin = 'round'; c.lineCap = 'round';
  // red line (underground, operating) — context only
  for (const L of RAIL.red) {
    const q = poly(L, 2); if (q.length < 2) continue;
    path(q); c.globalAlpha = 0.6; c.strokeStyle = '#ff6f61'; c.lineWidth = 3; c.setLineDash([10, 9]); c.stroke(); c.setLineDash([]);
  }
  c.globalAlpha = 1;
  const reveal = Math.min(1, age / 1.8);
  // purple line: static transit-map style track (soft glow · dark casing · solid purple · thin rail highlight)
  for (const L of RAIL.purple) {
    let q = poly(L, 3); if (q.length < 2) continue;
    if (reveal < 1) q = q.slice(0, Math.max(2, Math.ceil(q.length * (1 - Math.pow(1 - reveal, 3)))));
    path(q);
    c.strokeStyle = PURPLE; c.shadowColor = PURPLE; c.shadowBlur = 18; c.lineWidth = 14; c.globalAlpha = 0.35; c.stroke();
    c.shadowBlur = 0; c.globalAlpha = 1;
    c.lineWidth = 10; c.strokeStyle = '#2e1260'; c.stroke();
    c.lineWidth = 7; c.strokeStyle = '#8a4fe8'; c.stroke();
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(235,222,255,.75)'; c.stroke();
  }
  // walking route home -> HaMaavak
  const w = RAIL.walk, wq = poly(w.path, 2.5);
  if (wq.length > 1 && age > 1.2) {
    path(wq);
    c.strokeStyle = '#f2b48d'; c.shadowColor = '#f2b48d'; c.shadowBlur = 16; c.lineWidth = 5; c.stroke(); c.shadowBlur = 0;
    c.setLineDash([2, 16]); c.lineDashOffset = -t * 40; c.lineWidth = 6; c.strokeStyle = '#fff'; c.stroke(); c.setLineDash([]);
    const mid = wq[Math.floor(wq.length * 0.5)];
    pill(mid[0], mid[1], `${w.min} דק׳ ברגל`, `900 מ׳ · ישר בדרך השלום`, { fill: 'rgba(242,180,141,.96)', stroke: '#fff', color: '#2a1d15', subColor: '#4a3426', lift: 6 });
  }
  // stations
  for (const s of RAIL.stations) {
    const q = P(s.p[0], 3, s.p[1]); if (!q) continue;
    const hm = s.kind === 'home';
    c.fillStyle = '#fff'; c.strokeStyle = hm ? '#f2b48d' : '#5b2bb8'; c.lineWidth = hm ? 4 : 3;
    c.beginPath(); c.arc(q[0], q[1], hm ? 10 : 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
    if (hm) {
      const rr = 10 + ((t * 20) % 34); c.globalAlpha = Math.max(0, 1 - (rr - 10) / 34); c.strokeStyle = '#f2b48d'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(q[0], q[1], rr, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      pill(q[0], q[1], 'תחנת המאבק', 'הקו הסגול · התחנה הקרובה לבית', { big: true, fill: 'rgba(91,43,184,.96)', stroke: PURPLE_HI, lift: 8 });
    } else {
      const k = MOB() ? 0.7 : 1;
      c.save(); c.direction = 'rtl'; c.textAlign = 'center'; c.font = `700 ${16 * k}px Almoni, sans-serif`;
      c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.85)'; c.shadowBlur = 7; c.fillText(s.name, q[0], q[1] - 13 * k);
      if (s.sub) { c.font = `600 ${11 * k}px Almoni, sans-serif`; c.fillStyle = '#d9c2ff'; c.fillText(s.sub, q[0], q[1] + 22 * k); }
      c.restore();
    }
  }
  // line name tags
  const tag = (p, txt, col) => { const q = P(p[0], 3, p[1]); if (q) pill(q[0], q[1], txt, '', { fill: col, stroke: 'rgba(255,255,255,.6)', lift: 4 }); };
  const s1 = RAIL.stations.find((s) => s.name === 'פארק וולפסון'), s2 = RAIL.stations.find((s) => s.name === 'משה דיין'); if (s1 && s2) tag([(s1.p[0] + s2.p[0]) / 2, (s1.p[1] + s2.p[1]) / 2 - 40], 'רכבת קלה · הקו הסגול', 'rgba(91,43,184,.95)');
  if (RAIL.red[0]) { const L = RAIL.red[0]; tag(L[Math.floor(L.length * 0.45)], 'הקו האדום · פועל', 'rgba(170,52,45,.92)'); }
  if (reveal >= 1) drawTrams(P, t);
  // home card
  const hq = P(0, 6, 0);
  if (hq) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    c.fillStyle = '#ead3b6'; c.shadowColor = '#f2b48d'; c.shadowBlur = 18 + pulse * 10; c.beginPath(); c.arc(hq[0], hq[1], 8, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    pill(hq[0], hq[1], 'HELLO TLV', 'אורון רובע השלום · הבית', { big: true, lift: 6 });
  }
}

let paused = false;
window.HELLO = {
  pause: (v) => { paused = v; if (v) stopTour(); },
  showUnit: (bi, f) => { goChapter(CH.findIndex((c) => c.id === 'proj')); setTimeout(() => { selectBuilding(bi, false); selectFloor(f, true); window.HELLO_SHEET?.open('units'); }, 60); },
};
function frame() {
  if (paused) { lastT = now(); requestAnimationFrame(frame); return; }
  const t = now(), dt = Math.min(0.1, t - lastT); lastT = t;
  const intro = t - introStart;
  if (!introDone) {
    if (intro > 6.8 && !altOff) { altOff = true; worker.postMessage({ useAlt: false }); }
    camT.dist = 560 + Math.max(0, 7 - intro) * 12;
    if (intro > 11.5) endIntro();
  }
  // auto tour + idle orbit
  if (tour && performance.now() - tourAt > 13000) { tourAt = performance.now(); let n = (chapter + 1) % CH.length; while (CH[n].action || CH[n].after) n = (n + 1) % CH.length; goChapter(n); }
  if (introDone && performance.now() - lastInteract > 4500) camT.yaw += orbit * dt * 6;
  const k = 1 - Math.exp(-dt * (introDone ? 2.4 : 1.2));
  cam.yaw += (camT.yaw - cam.yaw) * k; cam.pitch += (camT.pitch - cam.pitch) * k; cam.dist += (camT.dist - cam.dist) * k;
  for (let i = 0; i < 3; i++) cam.t[i] += (camT.t[i] - cam.t[i]) * k;
  todV += (todT - todV) * (1 - Math.exp(-dt * 1.3));
  if (Math.abs(todEl.value / 1000 - todV) > 0.002) todEl.value = Math.round(todV * 1000);
  $('#tLabel').textContent = todLabel(todV);
  rings += (ringsT - rings) * (1 - Math.exp(-dt * 2));
  dim += (dimT - dim) * (1 - Math.exp(-dt * 2));
  fogK += (fogKT - fogK) * (1 - Math.exp(-dt * 1.5));
  selZ += ((sel.on ? 1 : 0) - selZ) * (1 - Math.exp(-dt * 4));
  explodeV += ((sel.on && sel.explode ? 1 : 0) - explodeV) * (1 - Math.exp(-dt * 3));
  const cw = performance.now() - lastMove < 1800 ? cursorT : 0;
  cursor[3] += (cw - cursor[3]) * (1 - Math.exp(-dt * 5));

  const eye = eyeOf(cam), B = basis(eye, cam.t);
  const { view, proj, fx, fy } = matrices(eye, B);
  const L = tod(todV);

  // sorting
  if (pendingIdx) { gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, pendingIdx, gl.DYNAMIC_DRAW); pendingIdx = null; }
  const moveE = Math.hypot(eye[0] - lastSortE[0], eye[1] - lastSortE[1], eye[2] - lastSortE[2]);
  if (!sortBusy && (moveE > cam.dist * 0.004 || dot(B.f, lastSortF) < 0.99995 || (!introDone && intro < 9))) {
    sortBusy = true; lastSortE = eye; lastSortF = B.f;
    worker.postMessage({ f: B.f, e: eye });
  }

  gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(SK.p); gl.bindVertexArray(vaoK);
  gl.uniform3fv(SK.u.uR, B.r); gl.uniform3fv(SK.u.uU, B.u); gl.uniform3fv(SK.u.uF, B.f);
  gl.uniform2f(SK.u.uTan, Math.tan(FOV / 2) * W / H, Math.tan(FOV / 2));
  gl.uniform3fv(SK.u.uSunDir, L.dir); gl.uniform3fv(SK.u.uSunCol, L.sun); gl.uniform3fv(SK.u.uFogCol, L.fog); gl.uniform3fv(SK.u.uFog2, L.fog2); gl.uniform3fv(SK.u.uZenith, L.zen);
  gl.uniform1f(SK.u.uNight, L.night); gl.uniform1f(SK.u.uReveal, introDone ? 1 : Math.min(1, Math.max(0, (intro - 3.2) / 4.5)) ** 1.6); gl.uniform1f(SK.u.uTime, t); gl.uniform1f(SK.u.uExposure, L.exp);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(SP.p); gl.bindVertexArray(vaoS);
  const u = SP.u;
  gl.uniform1i(u.uA, 0); gl.uniform1i(u.uB, 1); gl.uniform1i(u.uC, 2);
  gl.uniformMatrix4fv(u.uView, false, view); gl.uniformMatrix4fv(u.uProj, false, proj);
  gl.uniform2f(u.uFocal, fx, fy); gl.uniform2f(u.uViewport, W, H); gl.uniform3fv(u.uCamPos, eye);
  gl.uniform1f(u.uTime, t); gl.uniform1f(u.uIntro, introDone ? 60 : intro);
  gl.uniform1f(u.uNight, L.night); gl.uniform1f(u.uFogDen, L.den * fogK); gl.uniform1f(u.uRings, rings); gl.uniform1f(u.uExplode, explodeV);
  gl.uniform1f(u.uDim, dim * (sel.on ? 1 : 0.6)); gl.uniform1f(u.uReveal, introDone ? 1 : Math.min(1, Math.max(0, (intro - 3.2) / 4.5)) ** 1.6); gl.uniform1f(u.uExposure, L.exp);
  gl.uniform3fv(u.uSunDir, L.dir); gl.uniform3fv(u.uSunCol, L.sun); gl.uniform3fv(u.uSkyCol, L.sky); gl.uniform3fv(u.uGndCol, L.gnd);
  gl.uniform3fv(u.uFogCol, L.fog); gl.uniform3fv(u.uFog2, L.fog2); gl.uniform3fv(u.uZenith, L.zen);
  gl.uniform4fv(u.uCursor, [cursor[0], cursor[1], cursor[2], cursor[3] * Math.min(1, cam.dist / 320)]); gl.uniform1f(u.uCurR, Math.min(50, Math.max(7, cam.dist * 0.08)));
  gl.uniform4fv(u.uPulse, new Float32Array(pulses.flat()));
  gl.uniform4f(u.uSel, sel.b >= 0 && (sel.on || CH[chapter]?.id === 'proj') ? sel.b : -1, sel.f, Math.max(selZ, CH[chapter]?.id === 'proj' ? 0.5 : 0), explodeV);
  gl.uniform1f(u.uHover, hoverB);
  { const b = META.buildings[sel.b]; const typical = b && sel.on && sel.f >= 1 && sel.f <= b.floors - 2; gl.uniform1f(u.uPlan, typical ? 1 : 0); gl.uniform1f(u.uPlanY, b && b.levels[sel.f] ? b.levels[sel.f].y0 : 0); }
  gl.uniform3fv(u.uLogoC, logo.c); gl.uniform3fv(u.uLogoR, logo.r); gl.uniform3fv(u.uLogoU, logo.u); gl.uniform1i(u.uNP, NP);
  gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, N);

  if (shot) {
    shot = false;
    canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `HELLO-TLV_${Date.now()}.png`; a.click(); }, 'image/png');
  }

  drawWalks(eye, B, fy, t);
  // labels
  const ch = CH[chapter]?.labels || 'none';
  const LSETS = { all: ['land', 'minor', 'park', 'hero', 'street'], land: ['land', 'park', 'hero'], park: ['park', 'hero'], bld: ['bld', 'street'] };
  for (const l of labels) {
    let vis = introDone && (LSETS[ch] || []).includes(l.kind);
    const pp = l.pos;
    const cz = B.f[0] * (pp[0] - eye[0]) + B.f[1] * (pp[1] - eye[1]) + B.f[2] * (pp[2] - eye[2]);
    if (cz < 1) vis = false;
    if (vis && l.kind === 'bld') {
      if (fpsN % 8 === 0) { const dv = [pp[0] - eye[0], pp[1] - eye[1], pp[2] - eye[2]]; const len = Math.hypot(...dv); const h = hitBuilding({ o: eye, d: dv.map((v) => v / len) }); l.occ = !!(h && h.i !== l.bi && Math.hypot(h.p[0] - eye[0], h.p[1] - eye[1], h.p[2] - eye[2]) < len - 2); }
      if (l.occ) vis = false;
    }
    if (vis) {
      const cx = B.r[0] * (pp[0] - eye[0]) + B.r[1] * (pp[1] - eye[1]) + B.r[2] * (pp[2] - eye[2]);
      const cy = B.d[0] * (pp[0] - eye[0]) + B.d[1] * (pp[1] - eye[1]) + B.d[2] * (pp[2] - eye[2]);
      const sx = (cx * fy / cz) / DPR + innerWidth / 2, sy = (cy * fy / cz) / DPR + innerHeight / 2;
      if (sx < -100 || sx > innerWidth + 100 || sy < -50 || sy > innerHeight + 200) vis = false;
      else { const sc = (l.kind === 'street' ? 1 : Math.max(0.72, Math.min(1, 900 / cz))) * (CH[chapter]?.id === 'loc' ? 1.3 : 1); l.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(3)})`; }
    }
    if (vis !== l.vis) { l.el.classList.toggle('on', vis); l.vis = vis; }
  }

  // adaptive resolution
  fpsAcc += dt; fpsN++;
  if (fpsN === 60) {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0;
    if (avg > 0.045 && DPR > 0.75) { DPR = Math.max(0.75, DPR - 0.25); resize(); }
    else if (avg < 0.02 && DPR < Math.min(window.devicePixelRatio || 1, 1.5)) { DPR = Math.min(DPR + 0.25, Math.min(window.devicePixelRatio || 1, 1.5)); resize(); }
  }
  requestAnimationFrame(frame);
}

// short finish of the loading line (was 5 s) — the line keeps filling right-to-left
await new Promise((res) => {
  const from = parseFloat($('#pgBar').style.width) || 35, t0 = performance.now(), HOLD = 1500;
  $('#pgBar').style.transition = 'none';
  (function tick() {
    const k = Math.min(1, (performance.now() - t0) / HOLD), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    $('#pgBar').style.width = (from + (100 - from) * e).toFixed(2) + '%';
    if (k < 1) requestAnimationFrame(tick); else setTimeout(res, 250);
  })();
});
$('#loader').classList.add('out');
document.body.classList.remove('boot'); // now let the page images load
startIntro();
requestAnimationFrame(frame);

/* ---------------------------------------------------------------- helpers */
async function fetchProgress(url, cb, rawBytes = 0) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  // progress against the real (uncompressed) size — content-length is the gzip size on GitHub Pages,
  // which made the bar sit frozen at 35% for most of the download
  const total = rawBytes || +r.headers.get('content-length') || 0;
  if (!r.body || !total) { const b = await r.arrayBuffer(); cb(1); return b; }
  // content-length may be the *compressed* size (gzip on GitHub Pages) — collect chunks, never pre-size the buffer.
  const rd = r.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; cb(Math.min(got / total, 1)); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  cb(1); return out.buffer;
}
function fail(msg) { const e = $('#err'); e.style.display = 'flex'; e.textContent = msg; }
})().catch((e) => { console.error(e); const el = document.querySelector('#err'); el.style.display = 'flex'; el.textContent = 'שגיאה בטעינת ההדמיה: ' + e.message; });

/* ---------------------------------------------------- keep caption clear of the chapter menu */
(() => {
  const cap = document.getElementById('caption'), menu = document.getElementById('chapters');
  const units = document.getElementById('units'), walks = document.getElementById('walks'), rail = document.getElementById('rail');
  function fit() {
    cap.style.right = ''; cap.style.maxWidth = '';
    if (isPhone()) return;                       // phone layout has its own placement
    if (!menu.classList.contains('open')) return;         // menu closed (hamburger)
    const m = menu.getBoundingClientRect();
    const capTop = innerHeight - 104 - cap.offsetHeight;  // caption is bottom-anchored (bottom:104px)
    if (capTop >= m.bottom + 18) return;                  // no overlap — keep the original design
    const right = innerWidth - m.left + 30;               // move the caption to the left of the menu
    let leftLimit = 26;
    for (const p of [units, walks, rail]) if (p && p.classList.contains('on')) leftLimit = Math.max(leftLimit, p.getBoundingClientRect().right + 24);
    cap.style.right = right + 'px';
    cap.style.maxWidth = Math.max(300, Math.min(760, innerWidth - right - leftLimit)) + 'px';
  }
  new ResizeObserver(fit).observe(cap);
  new ResizeObserver(fit).observe(menu);
  addEventListener('resize', fit);
  new MutationObserver(fit).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  fit();
})();

/* ---------------------------------------------------- hamburger menu */
(() => {
  const btn = document.getElementById('burger'), menu = document.getElementById('chapters');
  const set = (on) => { menu.classList.toggle('open', on); btn.classList.toggle('open', on); btn.setAttribute('aria-expanded', on); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(!menu.classList.contains('open')); });
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) set(false); });
  document.addEventListener('pointerdown', (e) => { if (menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
})();

/* ---------------------------------------------------- phone: info panels collapse behind a small button */
(() => {
  const SHEETS = {
    units: { panel: document.getElementById('units'), btn: document.getElementById('unitsBtn'), label: 'מצאו את הבית שלכם' },
    rail: { panel: document.getElementById('rail'), btn: document.getElementById('railBtn'), label: 'פרטים נוספים' },
  };
  const paint = (s) => {
    const open = s.panel.classList.contains('m-open');
    s.btn.classList.toggle('open', open); s.btn.setAttribute('aria-expanded', open);
    s.btn.querySelector('span').textContent = open ? 'סגירה' : s.label;
  };
  const set = (k, on) => { const s = SHEETS[k]; if (!s.panel || !s.btn) return; s.panel.classList.toggle('m-open', on); paint(s); };
  for (const [k, s] of Object.entries(SHEETS)) {
    if (!s.panel || !s.btn) continue;
    s.btn.addEventListener('click', () => set(k, !s.panel.classList.contains('m-open')));
    // leaving the chapter (panel loses .on) collapses it again
    new MutationObserver(() => { if (!s.panel.classList.contains('on') && s.panel.classList.contains('m-open')) set(k, false); })
      .observe(s.panel, { attributes: true, attributeFilter: ['class'] });
    paint(s);
  }
  window.HELLO_SHEET = { open: (k) => set(k, true), close: (k) => set(k, false) };
})();

/* ---------------------------------------------------- phone: long pages scroll the document — start at the top, leave it at the top */
(() => {
  const LONG = '#plansView,#spec,#about,#aptView';
  let listY = 0; // where the apartments list was when an apartment was opened from it (tracked while scrolling —
  // by the time the apartment page opens the list is already hidden and the browser has reset the scroll)
  const pv = () => document.getElementById('plansView'), av = () => document.getElementById('aptView');
  addEventListener('scroll', () => { if (pv()?.classList.contains('on') && !av()?.classList.contains('on')) listY = scrollY; }, { passive: true });
  new MutationObserver((muts) => {
    if (!isPhone()) return;
    for (const m of muts) {
      const el = m.target;
      if (!el.matches?.(LONG)) continue;
      const was = (m.oldValue || '').split(/\s+/).includes('on'), is = el.classList.contains('on');
      if (was === is) continue;
      if (el.id === 'aptView') {
        if (is) { if (!pv().classList.contains('on')) listY = 0; window.scrollTo(0, 0); }
        else requestAnimationFrame(() => window.scrollTo(0, document.getElementById('plansView').classList.contains('on') ? listY : 0));
      } else { if (el.id === 'plansView') listY = 0; window.scrollTo(0, 0); }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})();
