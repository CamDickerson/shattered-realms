'use strict';
/* SHATTERED REALMS - vanilla JS canvas platformer.
   Sections: setup | input | audio | levels | physics | update | render | UI/flow.
   Everything (art, sound, levels) is generated in code. */
(() => {
/* ================= SETUP ================= */
const W = 320, H = 192, T = 16, ROWS = 12;
const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d'), wrap = $('wrap'), fade = $('fade');
cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const S = Object.assign({ vol: .6, mute: false, shake: true, scan: true }, store.get('sr_settings', {}));
let state = 'menu', cur = 'title', prevScr = 'title', menuT = 0;
let L, G, P, cam = 0, CX = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const hs = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return h & 255; };

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H), k = s >= 2 ? Math.floor(s) : s;
  wrap.style.width = W * k + 'px'; wrap.style.height = H * k + 'px'; wrap.style.setProperty('--u', k + 'px');
}
addEventListener('resize', resize); resize();
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

/* ---- palettes ---- */
const TH = [
  { s1: '#223a4c', s2: '#8cc79a', far: '#3a6b5c', mid: '#2b5444', near: '#1d3a30', tile: '#6d7260', dark: '#474c3c', top: '#6fc04a', acc: '#e8d86a', glow: '#7ff0ff', wk: '#7c8a6a' },
  { s1: '#08081c', s2: '#241454', far: '#1c2152', mid: '#262d70', near: '#323a8c', tile: '#3b4264', dark: '#232842', top: '#35e0e0', acc: '#ff4fd8', glow: '#35ffe8', wk: '#8b95b8' },
  { s1: '#16081f', s2: '#5a1236', far: '#3d1243', mid: '#561a52', near: '#6f2259', tile: '#5c3b5c', dark: '#3a2342', top: '#ff7a3a', acc: '#ffd23a', glow: '#ff5fa0', wk: '#a05a7a' }
];
const hx = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const mix = (a, b, t) => { const p = hx(a), q = hx(b); return 'rgb(' + p.map((v, i) => v + (q[i] - v) * t | 0).join() + ')'; };
TH.forEach(t => t.sky = [...Array(8)].map((_, i) => mix(t.s1, t.s2, i / 7)));

/* ---- draw helpers (world space uses camera CX, RS is screen space) ---- */
const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x - CX), Math.round(y), w, h); };
const RS = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const disc = (cx, cy, r, c) => { ctx.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.sqrt(r * r - y * y) | 0; ctx.fillRect(cx - w, cy + y, w * 2, 1); } };
const txt = (s, x, y, c, al) => { ctx.font = 'bold 8px monospace'; ctx.textAlign = al || 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = c || '#fff'; ctx.fillText(s, x, y); };

/* ================= INPUT ================= */
const K = {}, TC = {}; let jPrev = false, aPrev = false, pressE = false;
const GK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  if (GK.includes(e.code) && e.target.tagName !== 'INPUT') e.preventDefault();
  if (!K[e.code] && e.code === 'KeyE') pressE = true;
  K[e.code] = true; audioInit();
  if (e.repeat) return;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') { S.mute = !S.mute; syncSet(); }
});
addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'Space' && e.target.tagName !== 'INPUT') e.preventDefault(); });
addEventListener('blur', () => { for (const k in K) K[k] = false; if (state === 'play') togglePause(); });
addEventListener('pointerdown', audioInit);
const inp = () => ({ l: K.KeyA || K.ArrowLeft || TC.l, r: K.KeyD || K.ArrowRight || TC.r, j: K.Space || K.KeyW || K.ArrowUp || TC.j, a: K.KeyJ || K.KeyX || TC.a });
[['tL', 'l'], ['tR', 'r'], ['tJ', 'j'], ['tA', 'a']].forEach(([id, k]) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); TC[k] = true; audioInit(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => b.addEventListener(n, e => { e.preventDefault(); TC[k] = false; }));
});
$('tP').addEventListener('pointerdown', e => { e.preventDefault(); togglePause(); });

/* ================= AUDIO (Web Audio, no files) ================= */
let AC = null, master, musicG, sfxG, mStep = 0, mTheme = 0, mFast = false;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); musicG = AC.createGain(); sfxG = AC.createGain();
    musicG.connect(master); sfxG.connect(master); master.connect(AC.destination);
    musicG.gain.value = .35; sfxG.gain.value = .8; applyVol(); musicTick();
  } catch (e) { AC = null; }
}
function applyVol() { if (AC) master.gain.value = S.mute ? 0 : S.vol; }
function tone(f, d, type, v, slide, dest, when) {
  if (!AC) return; const t = AC.currentTime + (when || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(v || .15, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + d + .02);
}
function sfx(n) {
  if (!AC) return; const t = (f, d, ty, v, sl, w) => tone(f, d, ty, v, sl, sfxG, w);
  switch (n) {
    case 'jump': t(300, .15, 'square', .12, 500); break;
    case 'atk': t(220, .1, 'sawtooth', .1, -120); break;
    case 'hit': t(160, .12, 'square', .2, -80); break;
    case 'hurt': t(240, .3, 'sawtooth', .25, -180); break;
    case 'coin': t(880, .08, 'square', .1); t(1320, .12, 'square', .1, 0, .06); break;
    case 'chest': [523, 659, 784, 1047].forEach((f, i) => t(f, .15, 'triangle', .18, 0, i * .08)); break;
    case 'check': t(440, .1, 'triangle', .2); t(660, .2, 'triangle', .2, 0, .1); break;
    case 'die': t(400, .6, 'sawtooth', .25, -350); break;
    case 'boom': t(90, .5, 'sawtooth', .3, -60); t(60, .6, 'square', .2, -30); break;
    case 'shoot': t(500, .12, 'square', .08, -300); break;
    case 'click': t(600, .05, 'square', .08); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => t(f, .3, 'triangle', .2, 0, i * .12)); break;
  }
}
const SC = [[220, 261.6, 293.7, 329.6, 392], [196, 233.1, 261.6, 311.1, 349.2], [164.8, 196, 220, 246.9, 293.7]];
const ARP = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 4, 2];
function musicTick() { // one self-rescheduling loop, created once
  if (AC && state !== 'pause' && !S.mute) {
    const sc = SC[mTheme], i = mStep++ % 16;
    tone(sc[ARP[i]] * 2, .14, 'square', .05, 0, musicG);
    if (i % 4 === 0) tone(sc[0] / 2, .5, 'triangle', .18, 0, musicG);
    if (i % 8 === 4 && mTheme > 0) tone(sc[2], .1, 'sawtooth', .04, -50, musicG);
  }
  setTimeout(musicTick, mFast ? 105 : 160);
}

/* ================= LEVELS (generated, deterministic per seed) ================= */
const LV = [
  { name: 'OVERGROWN RUINS', theme: 0, seed: 7, len: 150, tail: 12, gap: 36, pGap: .2, pMove: 0, pSpike: .25, spk: 2, pEn: .6, ens: ['w', 'w', 'b'], maxChest: 3 },
  { name: 'NEON DEPTHS', theme: 1, seed: 21, len: 190, tail: 12, gap: 38, pGap: .2, pMove: .12, pSpike: .35, spk: 3, pEn: .7, ens: ['w', 'b', 't', 't'], maxChest: 3 },
  { name: 'THE SHATTERED CORE', theme: 2, seed: 99, len: 210, tail: 30, gap: 34, pGap: .22, pMove: .16, pSpike: .4, spk: 3, pEn: .8, ens: ['w', 'b', 't', 'w'], maxChest: 3 }
];
const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

function build(n) {
  const C = LV[n], rnd = rng(C.seed), cols = C.len;
  const g = [...Array(ROWS)].map(() => new Uint8Array(cols)); // 0 air, 1 solid, 2 spike
  const o = { n, C, cols, g, en: [], cr: [], ck: [], mv: [], ch: [], exit: null, arena: 0 };
  const cr = (x, y) => ({ x, y, got: 0 });
  const ground = (a, b, top) => { for (let c = a; c < Math.min(b, cols); c++) for (let r = top; r < ROWS; r++) g[r][c] = 1; };
  let gh = 9, x = 8, next = C.gap, pg = false; const end = cols - C.tail;
  ground(0, 8, gh); o.spawn = { x: 2 * T, y: gh * T - 14 };
  while (x < end) {
    const r = rnd();
    if (x >= next) { ground(x, x + 5, gh); o.ck.push({ x: (x + 2) * T, y: gh * T, on: false }); x += 5; next = x + C.gap; pg = false; continue; }
    if (!pg && x < end - 12 && r < C.pMove) { // moving platform over a wide gap
      const w = 6; o.mv.push({ x: x * T, y: gh * T, w: 32, x0: x * T, rg: (w - 2) * T, sp: .02 + rnd() * .01, dx: 0 });
      for (let i = 0; i < w; i += 2) o.cr.push(cr((x + i) * T + 4, (gh - 3) * T));
      x += w; pg = true; continue;
    }
    if (!pg && x < end - 12 && r < C.pMove + C.pGap) { // plain gap (2-3 tiles)
      const w = 2 + (rnd() * 2 | 0);
      for (let i = 0; i < w; i++) o.cr.push(cr((x + i) * T + 4, (gh - 2 - (i === 1 ? 1 : 0)) * T));
      x += w; pg = true; continue;
    }
    let len = 5 + (rnd() * 6 | 0);
    if (!pg && rnd() < .3) gh = clamp(gh + [-2, -1, 1, 2][rnd() * 4 | 0], 6, 10);
    const sec = !pg && o.ch.length < C.maxChest && x > 20 && rnd() < .3;
    if (sec) len = 11;
    ground(x, x + len, gh);
    if (sec) { // secret staircase to a treasure chest
      for (let c = x + 2; c <= x + 3; c++) g[gh - 2][c] = 1;
      for (let c = x + 6; c <= x + 8; c++) g[gh - 4][c] = 1;
      o.ch.push({ x: (x + 7) * T + 1, y: (gh - 4) * T - 12, w: 14, h: 12, open: false });
      o.cr.push(cr((x + 2) * T + 8, (gh - 4) * T), cr((x + 6) * T + 4, (gh - 5) * T));
    } else {
      if (len >= 5 && x > 14 && rnd() < C.pSpike) {
        const n2 = 1 + (rnd() * C.spk | 0), s = x + 2;
        for (let i = 0; i < n2 && s + i < x + len - 1; i++) g[gh - 1][s + i] = 2;
        for (let i = 0; i <= n2; i++) o.cr.push(cr((s + i) * T + 4, (gh - 3) * T));
      }
      for (let i = 1; i <= 3 && i < len; i++) if (!g[gh - 1][x + i]) o.cr.push(cr((x + i) * T + 4, (gh - 2) * T));
      if (len >= 7 && rnd() < C.pEn) {
        const t = C.ens[rnd() * C.ens.length | 0], px = (x + 5 + (rnd() * (len - 6) | 0)) * T;
        if (t === 'w') o.en.push({ t, x: px, y: gh * T - 12, w: 12, h: 12, hp: 2, dir: -1, sp: .35 + n * .12, fl: 0 });
        else if (t === 'b') o.en.push({ t, hx: px, hy: (gh - 4) * T, x: px, y: (gh - 4) * T, w: 12, h: 8, hp: 1, ph: rnd() * 6, fl: 0 });
        else o.en.push({ t, x: px, y: gh * T - 14, w: 14, h: 14, hp: 3, cd: 60, d: 1, fl: 0 });
      }
    }
    x += len; pg = false;
  }
  if (n < 2) { ground(x, cols, gh); o.exit = { x: (cols - 5) * T, y: gh * T - 40, w: 20, h: 40 }; }
  else { o.arena = cols - 20; ground(Math.min(x, o.arena - 8), cols, 9); o.ck.push({ x: (o.arena - 3) * T, y: 9 * T, on: false }); }
  return o;
}
const mkBoss = () => ({ x: (L.cols - 6) * T, y: -40, w: 32, h: 32, hp: 30, max: 30, st: 'sleep', tm: 0, vy: 0, fl: 0, dir: -1, sw: 0, last: '' });

/* ================= PHYSICS ================= */
const solid = (c, r) => c < 0 || c >= L.cols ? true : (r < 0 || r >= ROWS ? false : L.g[r][c] === 1);
const tile = (px, py) => { const c = Math.floor(px / T), r = Math.floor(py / T); return c < 0 || c >= L.cols || r < 0 || r >= ROWS ? 0 : L.g[r][c]; };
function boxHit(x, y, w, h) {
  const c0 = Math.floor(x / T), c1 = Math.floor((x + w - .01) / T), r0 = Math.floor(y / T), r1 = Math.floor((y + h - .01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true;
  return false;
}
function move(o, dx, dy) { // axis-separated tile collision; returns [hitX, hitY]
  let hx = false, hy = false;
  o.x += dx;
  if (dx && boxHit(o.x, o.y, o.w, o.h)) { o.x = dx > 0 ? Math.floor((o.x + o.w) / T) * T - o.w : (Math.floor(o.x / T) + 1) * T; hx = true; }
  o.y += dy;
  if (dy && boxHit(o.x, o.y, o.w, o.h)) { o.y = dy > 0 ? Math.floor((o.y + o.h) / T) * T - o.h : (Math.floor(o.y / T) + 1) * T; hy = true; }
  return [hx, hy];
}

/* ================= GAME LOGIC ================= */
function burst(x, y, n, c, sp) {
  sp = sp || 2;
  for (let i = 0; i < n && G.pt.length < 260; i++) { const a = Math.random() * 6.28, s = Math.random() * sp; G.pt.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - .5, l: 20 + Math.random() * 20 | 0, c }); }
}
const snap = () => ({ cr: G.cr, sec: G.sec, kills: G.kills, deaths: G.deaths, time: G.time });

function hurtP(d, fx) {
  if (P.inv > 0 || P.dead) return;
  P.hp -= d; P.inv = 100; P.hurt = 14; P.vx = P.x + 5 < fx ? -2.6 : 2.6; P.vy = -3.2; P.gr = false; P.on = null;
  G.shk = Math.max(G.shk, 5); burst(P.x + 5, P.y + 7, 10, '#ff5a5a'); sfx('hurt');
  if (P.hp <= 0) killP();
}
function killP() { P.hp = 0; P.dead = 1; P.vy = -4; P.vx = 0; sfx('die'); burst(P.x + 5, P.y + 7, 20, '#ffd23a', 3); }
function respawn() {
  if (G.lives <= 0) { $('oCr').textContent = G.cr; state = 'over'; document.body.classList.remove('playing'); show('over'); return; }
  G.lives--; G.deaths++; P.hp = 5; P.dead = 0; P.x = G.sp.x; P.y = G.sp.y; P.vx = P.vy = 0; P.inv = 120; P.on = null; P.hurt = 0;
  if (G.boss && G.boss.st !== 'dead') resetBoss();
  snapCam();
}
function resetBoss() { G.boss = mkBoss(); G.wall = false; for (let r = 0; r < 9; r++) L.g[r][L.arena] = 0; G.pr = []; mFast = false; }
function snapCam() { cam = clamp(P.x - W / 2, 0, L.cols * T - W); }

function hitE(e, d) {
  e.hp -= d; e.fl = 6; sfx('hit'); burst(e.x + e.w / 2, e.y + e.h / 2, 6, '#fff');
  if (e.hp <= 0) { e.dead = true; G.kills++; burst(e.x + e.w / 2, e.y + e.h / 2, 14, TH[L.C.theme].glow, 3); L.cr.push({ x: e.x + 2, y: e.y, got: 0 }); sfx('boom'); G.shk = Math.max(G.shk, 2); }
}
function hitB(b, d) {
  if (b.st === 'sleep' || b.st === 'enter' || b.st === 'dead') return;
  b.hp -= d; b.fl = 8; sfx('hit'); burst(b.x + 16, b.y + 16, 8, '#ff9ad0', 3); G.shk = Math.max(G.shk, 3);
  if (b.hp <= 0) { b.st = 'dead'; b.tm = 0; P.inv = 9999; G.pr = []; sfx('boom'); G.shk = 12; }
}
function openChest(c) { if (c.open) return; c.open = true; G.sec++; G.cr += 15; sfx('chest'); burst(c.x + 7, c.y + 4, 18, '#ffd23a', 3); G.msg = { s: 'SECRET FOUND! +15', t: 110 }; }

function updPlatforms() { for (const m of L.mv) { const nx = m.x0 + (Math.sin(G.t * m.sp - 1.5708) + 1) / 2 * m.rg; m.dx = nx - m.x; m.x = nx; } }

function updPlayer() {
  const i = inp(), eP = pressE; pressE = false;
  if (boxHit(P.x, P.y, P.w, P.h)) for (let k = 0; k < 20 && boxHit(P.x, P.y, P.w, P.h); k++) P.y -= 1; // anti-stuck
  if (P.on) { move(P, P.on.dx, 0); P.y = P.on.y - P.h; }
  const d = (i.r ? 1 : 0) - (i.l ? 1 : 0);
  if (P.hurt > 0) P.hurt--;
  else { if (d) { P.vx += d * (P.gr ? .32 : .22); P.f = d; } else P.vx *= P.gr ? .76 : .96; P.vx = clamp(P.vx, -1.7, 1.7); }
  if (i.j && !jPrev) P.buf = 7; else if (P.buf > 0) P.buf--; // jump buffer
  jPrev = !!i.j;
  if (P.gr) P.coy = 6; else if (P.coy > 0) P.coy--;        // coyote time
  if (P.buf > 0 && P.coy > 0) { P.vy = -5.7; P.buf = 0; P.coy = 0; P.gr = false; P.on = null; sfx('jump'); burst(P.x + 5, P.y + 14, 4, '#bbb', 1); }
  if (!i.j && P.vy < -2) P.vy *= .82;                       // variable jump height
  P.vy = Math.min(P.vy + .3, 6.5);
  const ob = P.y + P.h, pv = P.vy, was = P.gr, [hx_, hy] = move(P, P.vx, P.vy);
  if (hx_) P.vx = 0;
  P.on = null;
  if (hy) { P.gr = pv > 0; P.vy = 0; if (P.gr && !was && pv > 3.5) { burst(P.x + 5, P.y + 14, 5, '#bbb', 1.2); } } else P.gr = false;
  if (!P.gr && pv >= 0) for (const m of L.mv) if (P.x + P.w > m.x && P.x < m.x + m.w && ob <= m.y + 3 && P.y + P.h >= m.y) { P.y = m.y - P.h; P.vy = 0; P.gr = true; P.on = m; }
  if (P.y > ROWS * T + 24) { killP(); return; }
  if (P.inv > 0) P.inv--;
  // attack
  const a = inp().a;
  if (a && !aPrev && P.acd <= 0) { P.atk = 14; P.acd = 20; G.sw++; sfx('atk'); }
  aPrev = !!a; if (P.atk > 0) P.atk--; if (P.acd > 0) P.acd--;
  const sl = { x: P.f > 0 ? P.x + 8 : P.x - 14, y: P.y - 2, w: 16, h: 18 };
  if (P.atk > 3 && P.atk < 12) {
    for (const e of L.en) if (!e.dead && e.sw !== G.sw && ov(sl, e)) { e.sw = G.sw; hitE(e, 1); }
    const b = G.boss; if (b && b.sw !== G.sw && ov(sl, b)) { b.sw = G.sw; hitB(b, 1); }
    for (let k = G.pr.length - 1; k >= 0; k--) if (!G.pr[k].wave && ov(sl, G.pr[k])) { burst(G.pr[k].x, G.pr[k].y, 5, '#fff'); G.pr.splice(k, 1); sfx('hit'); }
    for (const c of L.ch) if (ov(sl, c)) openChest(c);
  }
  if (eP) for (const c of L.ch) if (!c.open && Math.abs(c.x + 7 - (P.x + 5)) < 24 && Math.abs(c.y - P.y) < 24) openChest(c);
  // spikes
  const c0 = Math.floor(P.x / T), c1 = Math.floor((P.x + P.w) / T), r0 = Math.floor(P.y / T), r1 = Math.floor((P.y + P.h - 1) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (L.g[r] && L.g[r][c] === 2 && ov(P, { x: c * T + 2, y: r * T + 7, w: 12, h: 9 })) hurtP(1, c * T + 8);
}

function updEnemies() {
  for (const e of L.en) {
    if (e.dead || Math.abs(e.x - P.x) > 300) continue;
    if (e.fl > 0) e.fl--;
    if (e.t === 'w') {
      const ah = e.x + (e.dir > 0 ? e.w + 1 : -1);
      if (solid(Math.floor(ah / T), Math.floor((e.y + 6) / T)) || !solid(Math.floor(ah / T), Math.floor((e.y + e.h + 2) / T)) || tile(ah, e.y + 6) === 2) e.dir *= -1;
      else e.x += e.dir * e.sp;
    } else if (e.t === 'b') {
      e.x = e.hx + Math.sin(G.t * .02 + e.ph) * 44; e.y = e.hy + Math.sin(G.t * .07 + e.ph) * 12;
    } else {
      e.cd--; e.d = Math.sign(P.x - e.x) || 1;
      if (e.cd <= 0 && Math.abs(P.x - e.x) < 180 && Math.abs(P.y - e.y) < 60) { e.cd = 120; G.pr.push({ x: e.x + 5, y: e.y + 4, vx: e.d * 1.5, vy: 0, w: 5, h: 5, life: 220 }); sfx('shoot'); }
    }
    if (!P.dead && ov(P, e)) {
      if (P.vy > 1 && P.y + P.h < e.y + e.h * .7 && e.t !== 't') { hitE(e, 1); P.vy = -4.5; P.gr = false; }
      else hurtP(1, e.x + e.w / 2);
    }
  }
}

function updBoss() {
  const b = G.boss; if (!b) return;
  const ar = L.arena * T;
  if (b.st === 'sleep') {
    if (P.x > ar + 40 && !P.dead) { b.st = 'enter'; b.tm = 0; G.wall = true; for (let r = 0; r < 9; r++) L.g[r][L.arena] = 1; sfx('boom'); G.shk = 8; mFast = true; G.msg = { s: 'CORE GUARDIAN', t: 120 }; }
    return;
  }
  b.tm++; if (b.fl > 0) b.fl--;
  const ph = b.hp < b.max * .5 ? 1 : 0, fx = b.x + 16, tx = P.x + 5;
  const nxt = () => { const o = ['shoot', 'dash', 'slam'].filter(s => s !== b.last); b.last = b.st = o[Math.random() * o.length | 0]; b.tm = 0; };
  const hover = () => { b.st = 'hover'; b.tm = 0; };
  switch (b.st) {
    case 'enter': b.y += (92 - b.y) * .04; if (b.tm > 90) hover(); break;
    case 'hover':
      b.y = 92 + Math.sin(G.t * .06) * 8; b.x = clamp(b.x + Math.sign(tx - fx) * Math.min(Math.abs(tx - fx) * .03, 1 + ph * .6), ar + 4, L.cols * T - 36);
      if (b.tm > 70 - ph * 25) nxt(); break;
    case 'shoot':
      b.y = 84 + Math.sin(G.t * .1) * 4;
      if (b.tm % (26 - ph * 8) === 0 && b.tm <= 78) {
        const n = ph ? 5 : 3, an = Math.atan2(P.y + 7 - (b.y + 16), tx - fx);
        for (let k = 0; k < n; k++) { const q = an + (k - (n - 1) / 2) * .28; G.pr.push({ x: fx - 3, y: b.y + 13, vx: Math.cos(q) * 1.6, vy: Math.sin(q) * 1.6, w: 6, h: 6, life: 300 }); }
        sfx('shoot');
      }
      if (b.tm > 98) hover(); break;
    case 'dash':
      if (b.tm < 40) { b.y += (112 - b.y) * .1; if (b.tm === 39) b.dir = tx > fx ? 1 : -1; }
      else {
        b.x += b.dir * (3.6 + ph * 1.2);
        if (b.x < ar + 4 || b.x > L.cols * T - 36) { b.x = clamp(b.x, ar + 4, L.cols * T - 36); G.shk = 5; sfx('boom'); hover(); }
      } break;
    case 'slam':
      if (b.tm < 50) { b.y += (24 - b.y) * .1; b.x = clamp(b.x + (tx - 16 - b.x) * .05, ar + 4, L.cols * T - 36); b.vy = 0; }
      else if (b.tm >= 62) {
        b.vy += .7; b.y += b.vy;
        if (b.y >= 112) {
          b.y = 112; G.shk = 9; sfx('boom');
          for (const d of [-1, 1]) G.pr.push({ x: fx + d * 16 - 4, y: 136, vx: d * (1.8 + ph * .6), vy: 0, w: 8, h: 8, wave: 1, life: 200 });
          hover();
        }
      } break;
    case 'dead':
      if (b.tm % 6 === 0) burst(b.x + Math.random() * 32, b.y + Math.random() * 32, 8, Math.random() < .5 ? '#ffd23a' : '#ff5fa0', 3);
      G.shk = 4; if (b.tm > 160) winGame();
      return;
  }
  if (!P.dead && ov(P, b)) hurtP(1, fx);
}

function updProj() {
  for (let i = G.pr.length - 1; i >= 0; i--) {
    const p = G.pr[i]; p.x += p.vx; p.y += p.vy; p.life--; let dead = p.life <= 0;
    if (p.wave) { if (p.x < L.arena * T - 4 || p.x > L.cols * T) dead = true; }
    else if (solid(Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h / 2) / T))) dead = true;
    if (!dead && !P.dead && ov(P, p)) { hurtP(1, p.x); dead = true; }
    if (dead) G.pr.splice(i, 1);
  }
}

function updPickups() {
  if (P.dead) return;
  for (const k of L.cr) if (!k.got && ov(P, { x: k.x, y: k.y, w: 8, h: 8 })) { k.got = 1; G.cr++; sfx('coin'); burst(k.x + 4, k.y + 4, 5, TH[L.C.theme].glow, 1.5); }
  for (const c of L.ck) if (!c.on && ov(P, { x: c.x - 8, y: c.y - 32, w: 16, h: 32 })) {
    c.on = true; G.sp = { x: c.x - 5, y: c.y - 14 }; P.hp = Math.min(5, P.hp + 2); sfx('check'); burst(c.x, c.y - 24, 14, '#ffd23a', 2.5); G.msg = { s: 'CHECKPOINT', t: 80 };
  }
  if (L.exit && ov(P, L.exit)) levelDone();
}

function updFx() {
  for (let i = G.pt.length - 1; i >= 0; i--) { const p = G.pt[i]; p.x += p.vx; p.y += p.vy; p.vy += .08; if (--p.l <= 0) G.pt.splice(i, 1); }
  G.shk *= .88; if (G.shk < .3) G.shk = 0;
}
function updCam() {
  const target = P.x + 5 - W / 2 + P.f * 24, lo = G.wall ? L.arena * T : 0;
  cam = clamp(cam + (target - cam) * .1, lo, L.cols * T - W);
}

function update() {
  G.t++; G.time++; if (G.ban > 0) G.ban--; if (G.msg) G.msg.t--;
  updPlatforms();
  if (P.dead) { P.dead++; P.vy += .3; P.y += P.vy; if (P.dead > 85) respawn(); } else updPlayer();
  if (state !== 'play') return;
  updEnemies(); updBoss(); updProj(); updPickups(); updFx(); updCam();
}

/* ================= RENDER ================= */
function ridge(par, base, amp, f, col, sd) {
  ctx.fillStyle = col;
  for (let x = 0; x < W; x += 4) { const wx = x + CX * par, h = base + Math.sin(wx * f + sd) * amp + Math.sin(wx * f * 2.3 + sd * 2) * amp * .5; ctx.fillRect(x, H - h | 0, 4, h + 1); }
}
function drawBG(th, t) {
  const c = TH[th];
  for (let i = 0; i < 8; i++) RS(0, i * 24, W, 24, c.sky[i]);
  if (th === 0) {
    disc(236, 44, 16, '#f6edb0'); disc(236, 44, 12, '#fff8d0');
    ridge(.08, 80, 14, .012, c.far, 1); ridge(.2, 56, 12, .02, c.mid, 4);
    const s0 = Math.floor(CX * .4 / 44) - 1;
    for (let i = s0; i < s0 + 9; i++) { const x = i * 44 - CX * .4, h = 40 + hs(i, 3) % 30, sw = Math.sin(t * .03 + i);
      RS(x, H - h - 16, 6, h + 16, c.near); RS(x - 10 + sw, H - h - 26, 26, 12, c.near); RS(x - 16 + sw, H - h - 18, 38, 10, c.near); }
    const p0 = Math.floor(CX * .6 / 90) - 1;
    for (let i = p0; i < p0 + 6; i++) { const x = i * 90 + 30 - CX * .6, h = 30 + hs(i, 9) % 40; RS(x, H - h, 12, h, '#4a5646'); RS(x - 2, H - h - 4, 16, 4, '#5a6a54'); RS(x + 2, H - h + 4, 3, 10 + hs(i, 2) % 12, '#4f9a3c'); }
  } else if (th === 1) {
    ridge(.1, 50, 6, .03, c.far, 2);
    const s0 = Math.floor(CX * .3 / 50) - 1;
    for (let i = s0; i < s0 + 8; i++) { const x = i * 50 - CX * .3, h = hs(i, 5) % 60;
      RS(x, 0, 14, 30 + h, c.mid); RS(x + 14, 0, 3, 20 + h / 2, c.far); RS(x + 4, 26 + h, 6, 4, ((t >> 5) + i) % 3 === 0 ? c.glow : c.far); }
    const m0 = Math.floor(CX * .55 / 70) - 1;
    for (let i = m0; i < m0 + 6; i++) { const x = i * 70 - CX * .55, h = hs(i, 8) % 30;
      RS(x, H - 40 - h, 40, 70, c.near); RS(x + 4, H - 34 - h, 32, 3, c.dark);
      for (let k = 0; k < 3; k++) RS(x + 6 + k * 11, H - 26 - h, 4, 4, ((t >> 4) + k + i) & 1 ? c.acc : c.dark); }
  } else {
    const p = Math.sin(t * .03) * 3;
    disc(160, 76, 34 + p | 0, '#3b0f3a'); disc(160, 76, 24 + p | 0, '#7a1c4c'); disc(160, 76, 12, '#ff7aa0');
    for (let i = 0; i < 10; i++) { const x = ((i * 83 - CX * (.12 + .08 * (i % 3))) % (W + 40) + W + 40) % (W + 40) - 20, y = 20 + (i * 37) % 90 + Math.sin(t * .03 + i) * 4;
      RS(x - 1, y - 4, 4, 8, c.acc); RS(x, y - 6, 2, 12, c.glow); }
    ridge(.2, 48, 10, .05, c.far, 3); ridge(.4, 30, 8, .08, c.mid, 5);
  }
}
const MO = [...Array(28)].map(() => ({ x: Math.random() * W, y: Math.random() * H, s: .2 + Math.random() * .4, p: Math.random() * 6 }));
function drawMotes(th, t) {
  ctx.globalAlpha = .7;
  for (const m of MO) { m.y -= m.s * .3; m.x += Math.sin(t * .02 + m.p) * .2 - .1; if (m.y < 0) m.y = H; if (m.x < 0) m.x = W; if (m.x > W) m.x = 0; RS(m.x, m.y, 1, 1, th === 0 ? '#fff6b0' : TH[th].glow); }
  ctx.globalAlpha = 1;
}
const VG = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H);
VG.addColorStop(0, 'rgba(0,0,0,0)'); VG.addColorStop(1, 'rgba(0,0,0,.55)');
const vignette = () => { ctx.fillStyle = VG; ctx.fillRect(0, 0, W, H); };

function drawTiles(th, t) {
  const c = TH[th], c0 = Math.max(0, Math.floor(CX / T)), c1 = Math.min(L.cols - 1, c0 + W / T + 1);
  for (let r = 0; r < ROWS; r++) for (let cc = c0; cc <= c1; cc++) {
    const v = L.g[r][cc]; if (!v) continue; const x = cc * T, y = r * T;
    if (v === 2) { for (let k = 0; k < 3; k++) { const sx = x + k * 5 + 1; R(sx, y + 12, 5, 4, '#8a94a8'); R(sx + 1, y + 8, 3, 4, '#cfd8e8'); R(sx + 2, y + 4, 1, 4, '#fff'); } continue; }
    R(x, y, T, T, c.tile); R(x, y + T - 1, T, 1, c.dark); R(x + T - 1, y, 1, T, c.dark); R(x, y + 8, T, 1, c.dark); R(x + ((r + cc) % 2 ? 4 : 10), y, 1, 8, c.dark);
    const h = hs(cc, r); if (h < 40) R(x + h % 12, y + 3 + h % 9, 2, 2, c.dark);
    if (!(r > 0 && L.g[r - 1][cc] === 1)) {
      R(x, y, T, 3, c.top);
      if (th === 0) for (let k = 0; k < T; k += 4) R(x + k + Math.sin(t * .05 + cc + k) * 1.2, y - 2, 2, 2, c.top);
      else if (((t >> 4) + cc) % 7 === 0) R(x + 4, y, 8, 1, '#fff');
    }
  }
}
function drawWorld(th, t) {
  const c = TH[th];
  for (const m of L.mv) { R(m.x, m.y, m.w, 3, '#8896b8'); R(m.x, m.y + 3, m.w, 3, '#4a5578'); R(m.x + 4, m.y + 1, 3, 1, c.glow); R(m.x + m.w - 7, m.y + 1, 3, 1, c.glow); }
  for (const k of L.ck) { R(k.x - 3, k.y - 20, 6, 20, '#555d70'); if (k.on) { ctx.globalAlpha = .3 + Math.sin(t * .1) * .1; R(k.x - 8, k.y - 34, 16, 16, '#ffd23a'); ctx.globalAlpha = 1; } R(k.x - 3, k.y - 28, 6, 8, k.on ? '#ffd23a' : '#444a5a'); R(k.x - 1, k.y - 26, 2, 3, '#fff'); }
  if (L.exit) { const e = L.exit; R(e.x - 2, e.y - 2, 24, 44, '#2a2a3a'); R(e.x, e.y, 20, 40, '#0a0a1a'); for (let k = 0; k < 5; k++) { ctx.globalAlpha = .85; R(e.x + 2, e.y + 2 + ((t * 2 + k * 8) % 36), 16, 3, k % 2 ? c.acc : c.glow); } ctx.globalAlpha = 1; }
  for (const ch of L.ch) { R(ch.x, ch.y + 4, 14, 8, '#8a5a2a'); R(ch.x, ch.y, 14, 5, ch.open ? '#5a3a1a' : '#a8702e'); R(ch.x + 6, ch.y + 3, 2, 4, '#e8d86a'); if (ch.open) { ctx.globalAlpha = .5; R(ch.x + 3, ch.y - 5 - Math.sin(t * .1) * 2, 8, 6, '#ffd23a'); ctx.globalAlpha = 1; }
    else if (Math.abs(ch.x + 7 - (P.x + 5)) < 24 && Math.abs(ch.y - P.y) < 24) txt('E', ch.x + 4 - CX, ch.y - 11, '#fff'); }
  for (const k of L.cr) { if (k.got || k.x < CX - 16 || k.x > CX + W + 16) continue; const by = k.y + Math.sin(t * .08 + k.x) * 2;
    ctx.globalAlpha = .25; R(k.x - 2, by - 2, 12, 12, c.glow); ctx.globalAlpha = 1;
    R(k.x + 2, by, 4, 2, '#fff'); R(k.x + 1, by + 2, 6, 3, c.glow); R(k.x, by + 4, 8, 2, c.glow); R(k.x + 1, by + 6, 6, 2, '#3aa8d8'); R(k.x + 3, by + 8, 2, 1, '#3aa8d8'); }
  for (const e of L.en) {
    if (e.dead || e.x < CX - 30 || e.x > CX + W + 30) continue; const f = e.fl > 0;
    if (e.t === 'w') { const l = (e.x / 3 | 0) % 2; R(e.x, e.y + 2, 12, 8, f ? '#fff' : c.wk); R(e.x + 1, e.y, 10, 3, f ? '#fff' : c.dark); R(e.x + (e.dir > 0 ? 7 : 2), e.y + 4, 3, 2, '#ff4040'); R(e.x + 1 + l, e.y + 10, 3, 2, c.dark); R(e.x + 8 - l, e.y + 10, 3, 2, c.dark); }
    else if (e.t === 'b') { const w = Math.sin(t * .4 + e.ph) > 0 ? -3 : 2; R(e.x - 4, e.y + w, 5, 3, '#6a4a8a'); R(e.x + 11, e.y + w, 5, 3, '#6a4a8a'); R(e.x + 2, e.y, 8, 6, f ? '#fff' : '#4a3068'); R(e.x + 3, e.y + 2, 2, 2, '#ff0'); R(e.x + 7, e.y + 2, 2, 2, '#ff0'); }
    else { R(e.x, e.y + 6, 14, 8, f ? '#fff' : '#58607a'); R(e.x + 2, e.y + 2, 10, 6, f ? '#fff' : '#7a84a4'); R(e.x + (e.d > 0 ? 10 : -2), e.y + 4, 6, 3, '#2a2e3e'); R(e.x + 5, e.y + 4, 4, 3, e.cd < 20 ? '#fff' : '#ff4fd8'); }
  }
  const b = G.boss;
  if (b && b.st !== 'sleep' && !(b.st === 'dead' && b.tm % 4 < 2)) {
    const f = b.fl > 0 || (b.st === 'dash' && b.tm < 40 && (b.tm >> 2) % 2), body = f ? '#fff' : '#5a2a6e', md = f ? '#fff' : '#8a3aa8', core = f ? '#fff' : (t >> 3) % 2 ? '#ff7ac0' : '#ffb0d8';
    R(b.x + 6, b.y, 20, 32, body); R(b.x, b.y + 6, 32, 20, body); R(b.x + 3, b.y + 3, 26, 26, md); R(b.x + 10, b.y + 12, 12, 12, '#2a0f38'); R(b.x + 12, b.y + 14, 8, 8, core);
    R(b.x + 7, b.y + 6, 5, 3, '#fff'); R(b.x + 20, b.y + 6, 5, 3, '#fff'); R(b.x + 9, b.y + 7, 2, 2, '#f00'); R(b.x + 21, b.y + 7, 2, 2, '#f00');
    for (let k = 0; k < 4; k++) { const a = t * .05 + k * 1.5708; R(b.x + 14 + Math.cos(a) * 26, b.y + 14 + Math.sin(a) * 22, 4, 4, c.acc); }
  }
  for (const p of G.pr) { ctx.globalAlpha = .35; R(p.x - 2, p.y - 2, p.w + 4, p.h + 4, '#ff4fd8'); ctx.globalAlpha = 1; R(p.x, p.y, p.w, p.h, p.wave ? '#ff7ac0' : '#fff'); }
}
function drawPlayer(t) {
  if (P.inv > 0 && !P.dead && (P.inv >> 2) % 2) return;
  const f = P.f, x = Math.round(P.x - 1), y = Math.round(P.y - 2);
  const px = (dx, dy, w, h, c) => R(f > 0 ? x + dx : x + 12 - dx - w, y + dy, w, h, c);
  const run = P.gr && Math.abs(P.vx) > .4, fr = run ? (t >> 2) % 4 : 0, bob = P.gr && !run ? (t >> 4) % 2 : 0, hurt = P.hurt > 0 || P.dead;
  const sw = Math.sin(t * .3) * 1.5 | 0;
  px(-3, 5 + bob + sw, 4, 2, '#e8505a'); px(-5, 6 + bob - sw, 3, 2, '#c03a48');
  let l1 = 0, l2 = 0; if (!P.gr) { l1 = P.vy < 0 ? -1 : 1; l2 = -l1; } else if (run) { l1 = [0, 2, 0, -2][fr]; l2 = -l1; }
  px(3 + l1, 13, 3, 3, '#40305a'); px(6 + l2, 13, 3, 3, '#40305a');
  px(3, 6 + bob, 6, 7, hurt ? '#fff' : '#2fb8c9'); px(3, 10 + bob, 6, 1, '#1c6a78'); px(8, 7 + bob, 2, 4, hurt ? '#fff' : '#2398a8');
  px(3, bob, 6, 6, '#f0c8a0'); px(3, bob, 6, 2, '#3a2a20'); px(5, 2 + bob, 4, 2, '#ffd23a'); px(7, 3 + bob, 1, 1, '#222');
  if (P.atk > 0) { px(8, 6, 5, 2, '#ddd'); if (P.atk > 3 && P.atk < 12) { px(9, 4, 13, 2, '#aef'); px(11, 2, 10, 2, '#7ff0ff'); px(11, 6, 10, 2, '#7ff0ff'); px(15, 0, 5, 2, '#fff'); px(15, 8, 5, 2, '#fff'); } }
}
function drawHUD() {
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  for (let i = 0; i < 5; i++) { const full = P.hp > i, hx0 = 6 + i * 10; HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '1') RS(hx0 + x, 6 + y, 1, 1, full ? '#ff4a5a' : '#3a2030'); })); if (full) RS(hx0 + 1, 7, 2, 1, '#ffb0b8'); }
  txt('LIVES x' + G.lives, 6, 16, '#cfe4f0');
  RS(W - 52, 6, 6, 8, '#35ffe8'); RS(W - 51, 7, 2, 2, '#fff'); txt('x' + G.cr, W - 43, 6, '#fff');
  txt('SECRETS ' + G.sec, W - 6, 16, '#ffd23a', 'right');
  const b = G.boss;
  if (b && G.wall && b.st !== 'dead') { RS(60, H - 14, 200, 7, '#000'); RS(61, H - 13, 198, 5, '#3a1030'); RS(61, H - 13, 198 * Math.max(0, b.hp) / b.max, 5, '#ff4a8a'); txt('CORE GUARDIAN', W / 2, H - 24, '#ff9ad0', 'center'); }
  if (G.ban > 0) { ctx.globalAlpha = Math.min(1, G.ban / 40); txt('LEVEL ' + (G.n + 1), W / 2, 56, '#ffd23a', 'center'); txt(LV[G.n].name, W / 2, 68, '#fff', 'center'); ctx.globalAlpha = 1; }
  if (G.msg && G.msg.t > 0) { ctx.globalAlpha = Math.min(1, G.msg.t / 30); txt(G.msg.s, W / 2, 92, '#fff', 'center'); ctx.globalAlpha = 1; }
}
function render() {
  const t = state === 'menu' || state === 'intro' ? menuT : (G ? G.t : 0);
  if (state === 'menu' || state === 'intro' || !G) {
    const th = Math.floor(menuT / 700) % 3; CX = menuT * .9; drawBG(th, t); drawMotes(th, t); vignette(); return;
  }
  const th = L.C.theme, sx = S.shake && G.shk ? (Math.random() - .5) * G.shk : 0, sy = S.shake && G.shk ? (Math.random() - .5) * G.shk : 0;
  CX = Math.round(cam);
  ctx.save(); ctx.translate(Math.round(sx), Math.round(sy));
  drawBG(th, t); drawTiles(th, t); drawWorld(th, t); drawPlayer(t);
  for (const p of G.pt) { ctx.globalAlpha = Math.min(1, p.l / 15); R(p.x, p.y, 2, 2, p.c); } ctx.globalAlpha = 1;
  drawMotes(th, t);
  ctx.restore(); vignette(); drawHUD();
}

/* ================= UI / FLOW ================= */
const screens = [...document.querySelectorAll('.screen')];
function show(id) { cur = id; screens.forEach(s => s.classList.toggle('on', s.id === id)); }
function fadeTo(cb) { fade.classList.add('on'); setTimeout(() => { cb(); fade.classList.remove('on'); }, 350); }
const updCont = () => { $('btnCont').disabled = !store.get('sr_save', null); };

function startLevel(n, run) {
  fadeTo(() => {
    const r = Object.assign({ cr: 0, sec: 0, kills: 0, deaths: 0, time: 0 }, run);
    L = build(n);
    G = { n, r0: Object.assign({}, r), cr: r.cr, sec: r.sec, kills: r.kills, deaths: r.deaths, time: r.time, lives: 5, t: 0, ban: 150, shk: 0, pr: [], pt: [], msg: null,
      boss: n === 2 ? mkBoss() : null, wall: false, sp: { x: L.spawn.x, y: L.spawn.y }, sw: 0 };
    P = { x: L.spawn.x, y: L.spawn.y, w: 10, h: 14, vx: 0, vy: 0, f: 1, hp: 5, inv: 0, hurt: 0, gr: false, coy: 0, buf: 0, atk: 0, acd: 0, dead: 0, on: null };
    mTheme = LV[n].theme; mFast = false; snapCam(); show(''); state = 'play';
    document.body.classList.add('playing'); if (document.activeElement) document.activeElement.blur();
    store.set('sr_save', Object.assign({ level: n }, r));
  });
}
function levelDone() {
  if (state !== 'play') return;
  state = 'trans'; sfx('win'); G.msg = { s: 'LEVEL COMPLETE', t: 100 };
  const s = snap(), nx = G.n + 1; store.set('sr_save', Object.assign({ level: nx }, s));
  setTimeout(() => startLevel(nx, s), 1400);
}
function winGame() {
  if (state !== 'play') return;
  state = 'win'; sfx('win');
  const sc = Math.max(0, G.cr * 10 + G.sec * 100 + G.kills * 5 - G.deaths * 20), best = Math.max(sc, store.get('sr_best', 0));
  store.set('sr_best', best); store.del('sr_save');
  const m = Math.floor(G.time / 3600), s = Math.floor(G.time / 60) % 60;
  fadeTo(() => {
    $('wCr').textContent = G.cr; $('wSec').textContent = G.sec; $('wDe').textContent = G.deaths; $('wTi').textContent = m + ':' + String(s).padStart(2, '0');
    $('wSc').textContent = sc; $('wBe').textContent = best; document.body.classList.remove('playing'); show('win'); updCont();
  });
}
function toTitle() { fadeTo(() => { state = 'menu'; mTheme = 0; mFast = false; document.body.classList.remove('playing'); show('title'); updCont(); }); }
function togglePause() {
  if (state === 'play') { state = 'pause'; document.body.classList.remove('playing'); show('pause'); }
  else if (state === 'pause') { state = 'play'; document.body.classList.add('playing'); show(''); }
}
function act(a) {
  switch (a) {
    case 'start': state = 'intro'; show('intro'); break;
    case 'begin': store.del('sr_save'); startLevel(0, {}); break;
    case 'continue': { const s = store.get('sr_save', null); if (s) startLevel(clamp(s.level | 0, 0, 2), s); break; }
    case 'controls': case 'settings': case 'credits': prevScr = cur; show(a); break;
    case 'back': show(prevScr); break;
    case 'resume': togglePause(); break;
    case 'restart': startLevel(G.n, G.r0); break;
    case 'title': toTitle(); break;
    case 'again': store.del('sr_save'); startLevel(0, {}); break;
  }
}
$('ui').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; audioInit(); sfx('click'); act(b.dataset.a); });

/* ---- settings ---- */
function syncSet() { $('vol').value = Math.round(S.vol * 100); $('mute').checked = S.mute; $('shake').checked = S.shake; $('scanl').checked = S.scan; $('scan').classList.toggle('on', S.scan); applyVol(); store.set('sr_settings', S); }
$('vol').addEventListener('input', e => { S.vol = e.target.value / 100; syncSet(); });
$('mute').addEventListener('change', e => { S.mute = e.target.checked; syncSet(); });
$('shake').addEventListener('change', e => { S.shake = e.target.checked; syncSet(); });
$('scanl').addEventListener('change', e => { S.scan = e.target.checked; syncSet(); });

/* ---- main loop: fixed 60 Hz update, render every frame ---- */
let last = 0, acc = 0;
function tick() {
  if (state === 'play') update();
  else if (state === 'menu' || state === 'intro') menuT++;
  else if (state === 'trans' && G) { G.t++; if (G.msg) G.msg.t--; updFx(); }
}
function loop(ts) {
  acc += Math.min(100, ts - last); last = ts;
  for (let n = 0; acc >= 1000 / 60 && n < 5; n++) { tick(); acc -= 1000 / 60; }
  render(); requestAnimationFrame(loop);
}
syncSet(); show('title'); updCont(); requestAnimationFrame(loop);
})();
