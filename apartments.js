'use strict';
/* HELLO TLV — apartments: plan gallery, 3D dollhouse with room tour, cinematic renderings. */
(function () {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let PLANS = [];
const ready = fetch('assets/plans/plans.json').then((r) => r.json()).then((d) => { PLANS = d; buildGallery(); return d; });

const ROOMS_TXT = { 3: '3 חדרים', 4: '4 חדרים', 5: '5 חדרים' };
const KIND_TXT = (p) => p.type.startsWith('GR') ? 'דירת גן' : p.type.startsWith('PH') ? 'פנטהאוז' : 'דירה';
const BLD_TXT = (b) => (b === 1 || b === 4) ? `בניין ${b} · מגדל` : `בניין ${b}`;
const RENDER_FOR = { livkit: ['liv2', 'liv1', 'liv3'], living: ['liv1', 'liv3'], kitchen: ['liv2'], master: ['bed1'], bed: ['bed1'], safe: ['bed1'],
  balcony: ['bal1', 'bal2'], roof: ['ph1', 'bal4'], garden: ['gar1', 'gar2'] };
const ROOM_ICON = { livkit: '◐', living: '◐', kitchen: '◒', master: '◆', bed: '◇', safe: '◇', bath: '◌', wc: '◌', laundry: '◌', screen: '·', balcony: '◠', roof: '◠', garden: '❀', hall: '·' };

/* ------------------------------------------------------------------ overlays */
function overlay(id) { const el = $('#' + id); return { el, open() { el.classList.add('on'); document.body.classList.add('ovl-open'); window.HELLO?.pause(true); }, close() { el.classList.remove('on'); if (!$$('.ovl.on').length) { document.body.classList.remove('ovl-open'); window.HELLO?.pause(false); } } }; }
const OV = { plans: overlay('plansView'), apt: overlay('aptView'), cinema: overlay('cinema') };
$$('[data-close]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.close; if (k === 'apt') stopTour(); if (k === 'cinema') cinemaStop(); OV[k].close(); }));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (OV.cinema.el.classList.contains('on')) { cinemaStop(); OV.cinema.close(); }
    else if (OV.apt.el.classList.contains('on')) { stopTour(); OV.apt.close(); }
    else if (OV.plans.el.classList.contains('on')) OV.plans.close();
  }
  if (OV.cinema.el.classList.contains('on')) { if (e.key === 'ArrowLeft') cinemaStep(1); if (e.key === 'ArrowRight') cinemaStep(-1); }
});

/* ------------------------------------------------------------------ gallery */
const filt = { b: 0, r: 0, k: '' };
function buildGallery() {
  const counts = { 3: 0, 4: 0, 5: 0 };
  for (const p of PLANS) counts[p.rooms] += p.units.length;
  $('#pvStats').innerHTML = `<div><b>172</b><span>בתים</span></div>` + [3, 4, 5].map((r) => `<div><b>${counts[r]}</b><span>${ROOMS_TXT[r]}</span></div>`).join('') +
    `<div><b>${PLANS.filter((p) => p.type.startsWith('PH')).reduce((a, p) => a + p.units.length, 0)}</b><span>פנטהאוזים</span></div><div><b>${PLANS.filter((p) => p.type.startsWith('GR')).reduce((a, p) => a + p.units.length, 0)}</b><span>דירות גן</span></div>`;
  renderGrid();
}
function renderGrid() {
  const list = PLANS.filter((p) => (!filt.b || p.building === filt.b) && (!filt.r || p.rooms === filt.r) &&
    (!filt.k || (filt.k === 'ph' ? p.type.startsWith('PH') : filt.k === 'gr' ? p.type.startsWith('GR') : !/^(PH|GR)/.test(p.type))));
  $('#pvCount').textContent = `${list.length} תכניות · ${list.reduce((a, p) => a + p.units.length, 0)} דירות`;
  $('#pvGrid').innerHTML = list.map((p, i) => `
    <button class="pcard" data-page="${p.page}" style="--d:${Math.min(i, 16) * 40}ms">
      <div class="im"><img loading="lazy" src="assets/plans/thumb/p${String(p.page).padStart(2, '0')}.jpg" alt="תכנית טיפוס ${p.type}"></div>
      <div class="tx">
        <div class="r1"><span class="ty">טיפוס <bdi>${p.type}</bdi></span><span class="bd">${BLD_TXT(p.building)}</span></div>
        <div class="rm">${ROOMS_TXT[p.rooms]} <small>${KIND_TXT(p)}</small></div>
        <div class="mt"><span><b>${p.area}</b> מ״ר</span><span>${p.outdoor}</span></div>
        <div class="mt"><span>קומות ${p.floors}</span><span>${p.units.length} דירות</span></div>
        <div class="go">סיור תלת ממדי ←</div>
      </div>
    </button>`).join('') || '<div class="empty">אין תכניות בסינון הזה</div>';
  $$('.pcard', $('#pvGrid')).forEach((c) => c.addEventListener('click', () => openApt(+c.dataset.page)));
}
$$('#pvFilters [data-f]').forEach((b) => b.addEventListener('click', () => {
  const [k, v] = b.dataset.f.split(':');
  filt[k] = isNaN(+v) ? v : +v;
  $$(`#pvFilters [data-f^="${k}:"]`).forEach((x) => x.classList.toggle('on', x === b));
  renderGrid();
}));

/* ------------------------------------------------------------------ apartment viewer */
let cur = null, tab = '3d';
async function openApt(page, opts = {}) {
  await ready;
  const p = PLANS.find((x) => x.page === page); if (!p) return;
  cur = p;
  OV.apt.open();
  $('#aptType').innerHTML = `טיפוס <bdi>${p.type}</bdi>`;
  $('#aptTitle').textContent = `${ROOMS_TXT[p.rooms]} · ${KIND_TXT(p)}`;
  $('#aptMeta').innerHTML = `
    <div><span>בניין</span><b>${p.building}${(p.building === 1 || p.building === 4) ? ' · מגדל' : ''}</b></div>
    <div><span>שטח דירה</span><b>כ-${p.area} מ״ר</b></div>
    <div><span>חוץ</span><b>${p.outdoor.replace(/ כ-/, '<br>כ-')}</b></div>
    <div><span>קומות</span><b>${p.floors}</b></div>
    <div class="w"><span>כיווני אוויר</span><b>${p.expo}</b></div>
    <div class="w"><span>מספרי דירות</span><b class="nums">${p.units.join(' · ')}</b></div>`;
  const sp = [...p.spaces].filter((s) => s.kind !== 'hall' && s.kind !== 'screen').sort((a, b) => a.tour - b.tour);
  $('#aptRooms').innerHTML = sp.map((s) => `<button data-id="${s.id}"><i>${ROOM_ICON[s.kind] || '·'}</i><span class="n">${s.name}</span><span class="d">${s.dims ? `<bdi>${s.dims}</bdi> מ׳` : `~${s.area} מ״ר`}</span></button>`).join('');
  $$('#aptRooms button').forEach((b) => b.addEventListener('click', () => { stopTour(); focusRoom(+b.dataset.id, true); }));
  $('#aptImg').src = `assets/plans/p${String(p.page).padStart(2, '0')}.jpg`;
  resetPan();
  setTab(opts.tab || '3d');
  await DH.load(p);
  if (opts.tour) startTour();
}
function setTab(t) {
  tab = t;
  $$('#aptTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $('#aptStage').dataset.tab = t;
  if (t !== '3d') stopTour();
}
$$('#aptTabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.t)));
$('#aptTour').addEventListener('click', () => (touring ? stopTour() : startTour()));
$('#aptLocate').addEventListener('click', () => {
  if (!cur) return;
  stopTour(); OV.apt.close(); OV.plans.close();
  const f = cur.type.startsWith('GR') ? 0 : cur.type === 'PHa' || cur.type === 'PHb' ? 14 : cur.type.startsWith('PH') ? 8 : cur.type.endsWith('1') ? 10 : cur.building === 1 || cur.building === 4 ? 6 : 4;
  window.HELLO?.showUnit(cur.building - 1, f);
});

// 2D plan pan/zoom
const pan = { s: 1, x: 0, y: 0 };
function resetPan() { pan.s = 1; pan.x = 0; pan.y = 0; applyPan(); }
function applyPan() { $('#aptImg').style.transform = `translate(${pan.x}px,${pan.y}px) scale(${pan.s})`; }
(function () {
  const box = $('#apt2d'); let drag = null;
  box.addEventListener('wheel', (e) => { e.preventDefault(); const k = Math.exp(-e.deltaY * 0.0015); pan.s = Math.min(6, Math.max(1, pan.s * k)); if (pan.s === 1) { pan.x = pan.y = 0; } applyPan(); }, { passive: false });
  box.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => { if (!drag) return; pan.x += e.clientX - drag[0]; pan.y += e.clientY - drag[1]; drag = [e.clientX, e.clientY]; applyPan(); });
  box.addEventListener('pointerup', () => { drag = null; });
  box.addEventListener('dblclick', () => { pan.s = pan.s > 1.5 ? 1 : 2.5; if (pan.s === 1) pan.x = pan.y = 0; applyPan(); });
})();

/* ------------------------------------------------------------------ dollhouse renderer */
const DH = (function () {
  const cv = $('#aptGl');
  const gl = cv.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) return { load() {}, };
  const VS = `#version 300 es
  precision highp float;
  in vec3 aP; in vec3 aN; in vec4 aI; in float aD;
  uniform mat4 uVP; uniform float uMode, uH, uRise, uT; uniform vec2 uSize;
  out vec3 vN; out vec3 vW; out vec2 vUV; out float vTop;
  void main(){
    vec3 p;
    if (uMode < 0.5) { p = vec3((aP.x - 0.5) * uSize.x, 0.0, (aP.z - 0.5) * uSize.y); vUV = vec2(aP.x, aP.z); vN = vec3(0,1,0); vTop = 0.0; }
    else {
      float r = clamp((uRise - aD) / 0.55, 0.0, 1.0); r = 1.0 - pow(1.0 - r, 3.0);
      p = vec3(aI.x + aP.x * aI.z, aP.y * uH * r, aI.y + aP.z * aI.w);
      p.xz -= uSize * 0.5;
      vN = aN; vUV = vec2(0.0); vTop = aP.y * step(0.5, aN.y);
    }
    vW = p; gl_Position = uVP * vec4(p, 1.0);
  }`;
  const FS = `#version 300 es
  precision highp float; precision highp usampler2D;
  in vec3 vN; in vec3 vW; in vec2 vUV; in float vTop;
  uniform sampler2D uTex; uniform usampler2D uId; uniform float uMode, uSel, uDimO, uT, uH; uniform vec3 uSun, uEye;
  out vec4 o;
  void main(){
    vec3 N = normalize(vN);
    float dif = max(dot(N, uSun), 0.0);
    vec3 c;
    if (uMode < 0.5) {
      c = texture(uTex, vUV).rgb;
      c = pow(c, vec3(2.2));
      uint id = texture(uId, vUV).r;
      float on = (uSel > 0.5 && float(id) == uSel) ? 1.0 : 0.0;
      float pulse = 0.5 + 0.5 * sin(uT * 3.0);
      c *= mix(1.0, mix(0.42, 1.0, on), uDimO);
      c += vec3(1.0, 0.62, 0.3) * on * (0.05 + 0.05 * pulse) * uDimO;
      c *= 0.82 + 0.3 * dif;
    } else {
      vec3 wall = vec3(0.95, 0.92, 0.87);
      vec3 cap = vec3(0.13, 0.12, 0.115);
      float ao = mix(0.55, 1.0, smoothstep(0.0, uH * 0.7, vW.y));
      vec3 hemi = mix(vec3(0.32, 0.28, 0.25), vec3(0.55, 0.58, 0.66), N.y * 0.5 + 0.5);
      c = (vTop > 0.5) ? cap : wall * (hemi + vec3(1.0, 0.86, 0.7) * dif * 0.75) * ao;
      c = pow(c, vec3(2.2)) * 1.25;
    }
    float d = length(vW - uEye);
    c = c / (1.0 + c * 0.15);
    o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
  }`;
  function sh(t, s) { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; }
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  const U = {}; ['uVP', 'uMode', 'uH', 'uRise', 'uT', 'uSize', 'uTex', 'uId', 'uSel', 'uDimO', 'uSun', 'uEye'].forEach((n) => (U[n] = gl.getUniformLocation(pr, n)));
  const A = { aP: gl.getAttribLocation(pr, 'aP'), aN: gl.getAttribLocation(pr, 'aN'), aI: gl.getAttribLocation(pr, 'aI'), aD: gl.getAttribLocation(pr, 'aD') };
  // cube (unit, y 0..1) with normals
  const F = [[[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]]];
  const cube = [];
  for (const f of F) { const n = f[4]; for (const k of [0, 1, 2, 0, 2, 3]) cube.push(...f[k], ...n); }
  const vaoW = gl.createVertexArray(); gl.bindVertexArray(vaoW);
  let b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(A.aN); gl.vertexAttribPointer(A.aN, 3, gl.FLOAT, false, 24, 12);
  const ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
  gl.enableVertexAttribArray(A.aI); gl.vertexAttribPointer(A.aI, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(A.aI, 1);
  gl.enableVertexAttribArray(A.aD); gl.vertexAttribPointer(A.aD, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(A.aD, 1);
  const vaoF = gl.createVertexArray(); gl.bindVertexArray(vaoF);
  b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const tex = gl.createTexture(), idt = gl.createTexture();
  let nW = 0, size = [10, 10], loaded = false, rise = 0, riseT0 = 0, plan = null;
  const cam = { yaw: 0.5, pitch: 1.35, dist: 30, t: [0, 0, 0] }, camT = { yaw: 0.5, pitch: 0.95, dist: 22, t: [0, 0, 0] };
  let sel = 0, dimO = 0, dimT = 0, lastUser = 0, hV = 2.75;
  const WALL_H = 2.75;

  function img(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  async function load(p) {
    plan = p; loaded = false;
    const pid = String(p.page).padStart(2, '0');
    const [im, idImg] = await Promise.all([img(`assets/plans/3d/p${pid}.jpg`), img(`assets/plans/3d/p${pid}_id.png`)]);
    if (plan !== p) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    // id map -> R8UI
    const c = document.createElement('canvas'); c.width = idImg.width; c.height = idImg.height;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(idImg, 0, 0);
    const px = cx.getImageData(0, 0, c.width, c.height).data; const ids = new Uint8Array(c.width * c.height);
    for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4];
    gl.bindTexture(gl.TEXTURE_2D, idt); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, c.width, c.height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, ids);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const m = p.mpp, ds = p.ds;
    size = [p.w * m, p.h * m];
    const cxp = (p.bounds[0] + p.bounds[2] / 2) * m, czp = (p.bounds[1] + p.bounds[3] / 2) * m;
    const inst = new Float32Array(p.walls.length * 5);
    p.walls.forEach((r, i) => {
      const x = r[0] * ds * m, z = r[1] * ds * m, w = r[2] * ds * m, h = r[3] * ds * m;
      const d = Math.hypot(x + w / 2 - cxp, z + h / 2 - czp) / Math.hypot(p.bounds[2] * m, p.bounds[3] * m) * 2;
      inst.set([x, z, Math.max(w, 0.02), Math.max(h, 0.02), d * 0.9], i * 5);
    });
    nW = p.walls.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    // camera framing
    const span = Math.hypot(p.bounds[2], p.bounds[3]) * m;
    const ctr = [cxp - size[0] / 2, 0, czp - size[1] / 2];
    Object.assign(cam, { yaw: -0.25, pitch: 1.5, dist: span * 1.6, t: [...ctr] });
    Object.assign(camT, { yaw: -0.55, pitch: 0.98, dist: span * 1.05, t: [...ctr] });
    home = { ...camT, t: [...ctr] };
    sel = 0; dimT = 0; rise = 0; riseT0 = performance.now(); loaded = true; lastUser = performance.now();
    buildLabels(p);
  }
  let home = null;
  function goHome() { if (home) Object.assign(camT, { ...home, t: [...home.t] }); sel = 0; dimT = 0; markRoom(0); }

  // labels
  const lbBox = $('#aptLabels'); let lbs = [];
  function buildLabels(p) {
    lbBox.innerHTML = ''; lbs = [];
    for (const s of p.spaces) {
      if (s.kind === 'hall' || s.kind === 'screen' || s.area < 2.5) continue;
      const el = document.createElement('div'); el.className = 'rl';
      el.innerHTML = `<b>${s.name}</b>${s.dims ? `<span><bdi>${s.dims}</bdi></span>` : ''}`;
      lbBox.appendChild(el);
      lbs.push({ el, s, p: [s.c[0] * p.mpp - size[0] / 2, WALL_H * 0.15, s.c[1] * p.mpp - size[1] / 2] });
    }
  }
  function markRoom(id) { $$('#aptRooms button').forEach((b) => b.classList.toggle('on', +b.dataset.id === id)); lbs.forEach((l) => l.el.classList.toggle('sel', l.s.id === id)); }
  function focus(id, user) {
    const s = plan?.spaces.find((x) => x.id === id); if (!s) return;
    sel = id; dimT = 1; markRoom(id);
    const m = plan.mpp;
    const r = Math.sqrt(Math.max(4, s.area));
    camT.t = [s.c[0] * m - size[0] / 2, 0, s.c[1] * m - size[1] / 2];
    camT.dist = r * 3.4 + 7; camT.pitch = 1.08;
    if (user) camT.yaw = cam.yaw + 0.35;
    lastUser = performance.now();
  }

  // input
  let drag = null, pinch = 0; const pts = new Map();
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; lastUser = performance.now(); stopTour(); if (pts.size === 2) { const [a, b2] = [...pts.values()]; pinch = Math.hypot(a[0] - b2[0], a[1] - b2[1]); } });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b2] = [...pts.values()]; const d = Math.hypot(a[0] - b2[0], a[1] - b2[1]); if (pinch) camT.dist = Math.min(80, Math.max(4, camT.dist * pinch / d)); pinch = d; return; }
    camT.yaw -= (e.clientX - drag[0]) * 0.006; camT.pitch = Math.min(1.52, Math.max(0.25, camT.pitch + (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; lastUser = performance.now();
  });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size) drag = null; pinch = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); camT.dist = Math.min(80, Math.max(4, camT.dist * Math.exp(e.deltaY * 0.0012))); lastUser = performance.now(); }, { passive: false });
  cv.addEventListener('dblclick', () => goHome());

  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a, b2) => [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
  const dot = (a, b2) => a[0] * b2[0] + a[1] * b2[1] + a[2] * b2[2];
  let lt = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    if (!OV.apt.el.classList.contains('on') || tab !== '3d' || !loaded) return;
    const now = performance.now(), dt = Math.min(0.1, (now - lt) / 1000); lt = now;
    const W = Math.floor(cv.clientWidth * Math.min(devicePixelRatio, 2)), H = Math.floor(cv.clientHeight * Math.min(devicePixelRatio, 2));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    if (now - lastUser > 5000 && !touring) camT.yaw += dt * 0.06;
    const k = 1 - Math.exp(-dt * 2.6);
    cam.yaw += (camT.yaw - cam.yaw) * k; cam.pitch += (camT.pitch - cam.pitch) * k; cam.dist += (camT.dist - cam.dist) * k;
    for (let i = 0; i < 3; i++) cam.t[i] += (camT.t[i] - cam.t[i]) * k;
    dimO += (dimT - dimO) * (1 - Math.exp(-dt * 4));
    hV += ((sel ? 1.05 : WALL_H) - hV) * (1 - Math.exp(-dt * 3));
    rise = (now - riseT0) / 1000 - 0.35;
    const cp = Math.cos(cam.pitch);
    const eye = [cam.t[0] + Math.sin(cam.yaw) * cp * cam.dist, cam.t[1] + Math.sin(cam.pitch) * cam.dist, cam.t[2] + Math.cos(cam.yaw) * cp * cam.dist];
    const f = norm([cam.t[0] - eye[0], cam.t[1] - eye[1], cam.t[2] - eye[2]]);
    const r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const fov = 38 * Math.PI / 180, asp = W / H, ty = Math.tan(fov / 2), zn = 0.1, zf = 400;
    const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
    const P = [1 / (ty * asp), 0, 0, 0, 0, 1 / ty, 0, 0, 0, 0, -(zf + zn) / (zf - zn), -1, 0, 0, -2 * zf * zn / (zf - zn), 0];
    const VP = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let q = 0; q < 4; q++) s += P[q * 4 + j] * V[i * 4 + q]; VP[i * 4 + j] = s; }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.93, 0.9, 0.86, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(pr);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform1f(U.uH, hV); gl.uniform1f(U.uRise, rise); gl.uniform1f(U.uT, now / 1000);
    gl.uniform2f(U.uSize, size[0], size[1]); gl.uniform1f(U.uSel, sel); gl.uniform1f(U.uDimO, dimO);
    gl.uniform3fv(U.uSun, norm([0.45, 0.8, 0.35])); gl.uniform3fv(U.uEye, eye);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, idt); gl.uniform1i(U.uId, 1);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(U.uMode, 0); gl.bindVertexArray(vaoF); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1f(U.uMode, 1); gl.bindVertexArray(vaoW); gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, nW);
    // labels
    const cw = cv.clientWidth, ch = cv.clientHeight;
    const showAll = cam.dist < 60 && rise > 1.2;
    for (const l of lbs) {
      const p = l.p; const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      const vis = w > 0 && showAll && (!sel || l.s.id === sel || dimO < 0.5);
      if (vis) l.el.style.transform = `translate(${((x / w) * 0.5 + 0.5) * cw}px,${((-y / w) * 0.5 + 0.5) * ch}px) translate(-50%,-50%)`;
      l.el.classList.toggle('on', vis);
    }
  }
  requestAnimationFrame(frame);
  return { load, focus, goHome };
})();
function focusRoom(id, user) { DH.focus(id, user); showRoomCard(id); }

/* ------------------------------------------------------------------ tour */
let touring = false, tourI = 0, tourTimer = 0;
function tourRooms() { return cur ? [...cur.spaces].filter((s) => !['hall', 'screen'].includes(s.kind) && s.area >= 2.5).sort((a, b) => a.tour - b.tour) : []; }
function startTour() {
  if (!cur) return; setTab('3d');
  touring = true; tourI = 0; $('#aptTour').classList.add('on'); $('#aptTour span').textContent = 'עצירת הסיור';
  step();
}
function step() {
  const rs = tourRooms(); if (!touring) return;
  if (tourI >= rs.length) { stopTour(); DH.goHome(); return; }
  focusRoom(rs[tourI].id, false);
  tourI++;
  tourTimer = setTimeout(step, RENDER_FOR[rs[tourI - 1].kind] ? 6200 : 3800);
}
function stopTour() {
  touring = false; clearTimeout(tourTimer);
  $('#aptTour')?.classList.remove('on'); const s = $('#aptTour span'); if (s) s.textContent = 'סיור בחדרים';
  $('#roomCard')?.classList.remove('on');
}
function showRoomCard(id) {
  const s = cur?.spaces.find((x) => x.id === id); const card = $('#roomCard'); if (!s) return;
  const rr = RENDER_FOR[s.kind];
  const pick = rr ? rr[(id + cur.page) % rr.length] : null;
  card.innerHTML = `${pick ? `<div class="ph"><img src="assets/renders/${pick}.jpg" alt=""></div>` : ''}
    <div class="tx"><div class="k">${tourRooms().findIndex((x) => x.id === id) + 1} / ${tourRooms().length}</div><div class="n">${s.name}</div>
    <div class="d">${s.dims ? `<bdi>${s.dims}</bdi> מ׳ · ` : ''}כ-${s.area} מ״ר</div>${pick ? '<div class="note">הדמיה להמחשה</div>' : ''}</div>`;
  card.classList.toggle('img', !!pick);
  card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
}

/* ------------------------------------------------------------------ cinema */
const SCENES = [
  { id: 'ext', k: 'הבניין', t: 'רובע חדש בדרך השלום', s: 'ארבעה בניינים בעיצוב מעודן — אבן נסורה, אלומיניום וזכוכית', imgs: ['ext1', 'ext2', 'ext4'] },
  { id: 'lobby', k: 'הלובי', t: 'הבית מתחיל בכניסה', s: 'לובי מעוצב בגובה כפול, שיש, עץ ואור רך', imgs: ['lobby1', 'lobby2'] },
  { id: 'living', k: 'הסלון', t: 'עיצוב מתחיל באור', s: 'חללים פתוחים, ויטרינות מלאות ומבט אל העיר', imgs: ['liv1', 'liv2', 'liv3'] },
  { id: 'bed', k: 'חדר השינה', t: 'השקט של הבית', s: 'פרקט תלת שכבתי בחדר ההורים ותריסים חשמליים בכל החדרים', imgs: ['bed1', 'win1'] },
  { id: 'balcony', k: 'המרפסות', t: 'השקיעה התל אביבית — שלכם', s: 'מרפסות שמש עם נקודת מים ותאורה, אל קו הרקיע של העיר', imgs: ['bal1', 'bal2', 'bal3', 'bal4'] },
  { id: 'ph', k: 'הפנטהאוזים', t: 'הקומה הכי גבוהה של החלום', s: 'מרפסות גג של 42–50 מ״ר מעל דרך השלום', imgs: ['ph1'] },
  { id: 'garden', k: 'החצר', t: 'ירוק בין הבניינים', s: 'פיתוח סביבתי עשיר, שבילים ופינות ישיבה', imgs: ['gar1', 'gar2', 'park1'] },
  { id: 'night', k: 'הלילה', t: 'תגידו Hello לבית התל אביבי החדש', s: 'אורון רובע השלום · דרך השלום 87', imgs: ['ext3', 'ext5', 'city1'] },
  { id: 'video', k: 'הסרט', t: 'סיור בפרויקט', s: '', video: 'assets/video/project-tour.mp4' },
];
const SLIDES = []; SCENES.forEach((sc, si) => (sc.video ? [null] : sc.imgs).forEach((im, ii) => SLIDES.push({ sc, si, im, ii })));
let cIdx = 0, cTimer = 0, cPlaying = true;
const KB = [['1.04', '1.16', '-2%,1%', '2%,-1%'], ['1.18', '1.05', '2%,-1.5%', '-1%,1%'], ['1.06', '1.2', '0,2%', '-2%,-1%'], ['1.2', '1.06', '-1.5%,-1%', '1.5%,1.5%']];
(function buildCinema() {
  $('#cnNav').innerHTML = SCENES.map((s, i) => `<button data-i="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${s.k}</button>`).join('');
  $$('#cnNav button').forEach((b) => b.addEventListener('click', () => cinemaGo(SLIDES.findIndex((x) => x.si === +b.dataset.i))));
  $('#cnPrev').addEventListener('click', () => cinemaStep(-1));
  $('#cnNext').addEventListener('click', () => cinemaStep(1));
  $('#cnPlay').addEventListener('click', () => { cPlaying = !cPlaying; $('#cnPlay').classList.toggle('paused', !cPlaying); if (cPlaying) cinemaGo(cIdx); else clearTimeout(cTimer); });
})();
let layerA = true;
function cinemaGo(i) {
  clearTimeout(cTimer);
  cIdx = (i + SLIDES.length) % SLIDES.length;
  const sl = SLIDES[cIdx];
  const L = layerA ? $('#cnA') : $('#cnB'), O = layerA ? $('#cnB') : $('#cnA'); layerA = !layerA;
  const vid = $('#cnVideo');
  if (sl.sc.video) {
    vid.src = sl.sc.video; vid.classList.add('on'); vid.currentTime = 0; vid.play().catch(() => {});
    L.classList.remove('on'); O.classList.remove('on');
    vid.onended = () => cPlaying && cinemaStep(1);
  } else {
    vid.classList.remove('on'); vid.pause();
    const kb = KB[(cIdx * 7 + sl.ii) % KB.length];
    L.style.setProperty('--s0', kb[0]); L.style.setProperty('--s1', kb[1]); L.style.setProperty('--p0', kb[2]); L.style.setProperty('--p1', kb[3]);
    L.style.backgroundImage = `url(assets/renders/${sl.im}.jpg)`;
    L.classList.remove('on', 'run'); void L.offsetWidth; L.classList.add('on', 'run');
    O.classList.remove('on');
    if (cPlaying) cTimer = setTimeout(() => cinemaStep(1), 6500);
  }
  const cap = $('#cnCap');
  if (sl.ii === 0 || sl.sc.video) {
    cap.classList.remove('show');
    setTimeout(() => { cap.innerHTML = `<div class="k">${sl.sc.k}</div><h2>${sl.sc.t}</h2><p>${sl.sc.s}</p>`; cap.classList.add('show'); }, 450);
  }
  $$('#cnNav button').forEach((b) => b.classList.toggle('on', +b.dataset.i === sl.si));
  $('#cnBar').style.width = ((cIdx + 1) / SLIDES.length * 100) + '%';
}
function cinemaStep(d) { cinemaGo(cIdx + d); }
function cinemaStop() { clearTimeout(cTimer); const v = $('#cnVideo'); v.pause(); }
function openCinema(sceneId) { OV.cinema.open(); cPlaying = true; $('#cnPlay').classList.remove('paused'); cinemaGo(Math.max(0, SLIDES.findIndex((x) => x.sc.id === (sceneId || 'ext')))); }

window.HELLO_APT = {
  openGallery: async (o = {}) => { await ready; if (o.building) { filt.b = o.building; $$('#pvFilters [data-f^="b:"]').forEach((x) => x.classList.toggle('on', x.dataset.f === 'b:' + o.building)); renderGrid(); } OV.plans.open(); },
  openApt, openCinema,
  pageFor: (type, building) => PLANS.find((p) => p.type === type && p.building === building)?.page,
  ready,
};
})();
