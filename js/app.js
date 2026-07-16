/* =====================================================================
   LyricAMV Studio — free, client-side AI lyrics video / AMV maker
   Everything runs in the browser: audio analysis, lyric sync, rendering
   and video export. No uploads, no server, no watermark.
   ===================================================================== */
'use strict';

/* ---------------- state ---------------- */
const state = {
  audioEl: null,        // HTMLAudioElement for playback
  audioURL: null,
  buffer: null,         // decoded AudioBuffer (analysis)
  duration: 0,
  beats: [],            // beat times (s)
  bpm: 0,
  energyCurve: [],      // {t, e} coarse energy envelope
  avgEnergy: 0,
  lyrics: [],           // {t, text}
  media: [],            // {img, kb}
  theme: null,
  playing: false,
  tapMode: false,
  tapIndex: 0,
  exporting: false,
  recorder: null,
  fileName: ''
};

/* ---------------- themes ---------------- */
const THEMES = [
  { id: 'sakura',   name: 'Sakura Dream',  bg: ['#2b1330', '#5b1f4d', '#12081c'], accent: '#ffb7d5', glow: '#ff6fae', particle: 'petal',  css: 'linear-gradient(135deg,#5b1f4d,#ffb7d5)' },
  { id: 'neon',     name: 'Neon Tokyo',    bg: ['#04041a', '#160a3a', '#000010'], accent: '#00f5ff', glow: '#ff2fd6', particle: 'spark',  css: 'linear-gradient(135deg,#12005e,#00f5ff)' },
  { id: 'midnight', name: 'Midnight Sky',  bg: ['#050716', '#0b1030', '#02030c'], accent: '#aebdff', glow: '#5c7cff', particle: 'star',   css: 'linear-gradient(135deg,#0b1030,#5c7cff)' },
  { id: 'sunset',   name: 'AMV Sunset',    bg: ['#3a0f2b', '#8a2a35', '#160617'], accent: '#ffd9a0', glow: '#ff8c42', particle: 'ember',  css: 'linear-gradient(135deg,#8a2a35,#ffd166)' },
  { id: 'rain',     name: 'Lo-fi Rain',    bg: ['#0e1720', '#18242f', '#080d13'], accent: '#bfe3d0', glow: '#6fc3a0', particle: 'rain',   css: 'linear-gradient(135deg,#18242f,#6fc3a0)' },
  { id: 'snow',     name: 'Winter Ballad', bg: ['#101828', '#1d2b45', '#0a0f1c'], accent: '#eaf4ff', glow: '#9fc9ff', particle: 'snow',   css: 'linear-gradient(135deg,#1d2b45,#9fc9ff)' },
  { id: 'crimson',  name: 'Battle AMV',    bg: ['#1a0505', '#3d0a0a', '#0d0202'], accent: '#ffe3e3', glow: '#ff3b3b', particle: 'ember',  css: 'linear-gradient(135deg,#3d0a0a,#ff3b3b)' },
  { id: 'vapor',    name: 'Vaporwave',     bg: ['#1c0b33', '#33104d', '#0d0620'], accent: '#8afff4', glow: '#c56bff', particle: 'bubble', css: 'linear-gradient(135deg,#33104d,#ff71ce)' }
];

/* ---------------- dom ---------------- */
const $ = id => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d');
const els = {
  audioFile: $('audioFile'), audioDrop: $('audioDrop'), audioName: $('audioName'),
  audioInfo: $('audioInfo'), waveform: $('waveform'),
  badgeBpm: $('badgeBpm'), badgeBeats: $('badgeBeats'), badgeEnergy: $('badgeEnergy'),
  lyricsInput: $('lyricsInput'), lyricTimeline: $('lyricTimeline'),
  btnAutoSync: $('btnAutoSync'), btnTapSync: $('btnTapSync'),
  lrcFile: $('lrcFile'), btnExportLrc: $('btnExportLrc'),
  mediaFiles: $('mediaFiles'), mediaDrop: $('mediaDrop'), mediaStrip: $('mediaStrip'),
  btnPlay: $('btnPlay'), seek: $('seek'), timeCur: $('timeCur'), timeDur: $('timeDur'),
  btnExport: $('btnExport'), btnAiStyle: $('btnAiStyle'), themeGrid: $('themeGrid'),
  videoTitle: $('videoTitle'), fontPick: $('fontPick'), animPick: $('animPick'), fontSize: $('fontSize'),
  fxParticles: $('fxParticles'), fxBeatPulse: $('fxBeatPulse'), fxBars: $('fxBars'),
  fxVignette: $('fxVignette'), fxGrain: $('fxGrain'), fxLetterbox: $('fxLetterbox'),
  stageOverlay: $('stageOverlay'), tapBanner: $('tapBanner'),
  exportBanner: $('exportBanner'), exportStatus: $('exportStatus'), btnCancelExport: $('btnCancelExport'),
  resolution: $('resolution')
};

/* ---------------- audio context / graph ---------------- */
let actx = null, analyser = null, sourceNode = null, freqData = null;
function ensureAudioGraph() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = actx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  sourceNode = actx.createMediaElementSource(state.audioEl);
  sourceNode.connect(analyser);
  analyser.connect(actx.destination);
}

/* =====================================================================
   1 · AUDIO LOADING + AI ANALYSIS (beats, bpm, energy)
   ===================================================================== */
async function loadAudio(file) {
  if (!file) return;
  state.fileName = file.name.replace(/\.[^.]+$/, '');
  els.audioName.textContent = file.name;
  if (!els.videoTitle.value) els.videoTitle.value = state.fileName.replace(/[_-]+/g, ' ');

  if (state.audioURL) URL.revokeObjectURL(state.audioURL);
  state.audioURL = URL.createObjectURL(file);

  if (!state.audioEl) {
    state.audioEl = new Audio();
    state.audioEl.crossOrigin = 'anonymous';
    state.audioEl.addEventListener('ended', () => { if (!state.exporting) pause(); });
  }
  state.audioEl.src = state.audioURL;

  const arr = await file.arrayBuffer();
  const decodeCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
  state.buffer = await decodeCtx.decodeAudioData(arr);
  state.duration = state.buffer.duration;

  analyzeAudio();
  drawWaveform();

  els.audioInfo.classList.remove('hidden');
  els.badgeBpm.textContent = `♩ BPM: ${state.bpm || '—'}`;
  els.badgeBeats.textContent = `⚡ Beats: ${state.beats.length}`;
  els.badgeEnergy.textContent = `🔥 Energy: ${state.avgEnergy > 0.14 ? 'High' : state.avgEnergy > 0.07 ? 'Medium' : 'Chill'}`;
  els.timeDur.textContent = fmt(state.duration);

  [els.btnPlay, els.btnAutoSync, els.btnTapSync, els.btnExport, els.btnAiStyle, els.seek]
    .forEach(b => b.disabled = false);
  els.btnExportLrc.disabled = state.lyrics.length === 0;
  els.stageOverlay.classList.add('hidden');
  renderFrame(0);
}

/* Energy envelope + onset-based beat picking + BPM estimate */
function analyzeAudio() {
  const data = state.buffer.getChannelData(0);
  const sr = state.buffer.sampleRate;
  const hop = Math.floor(sr * 0.023); // ~23 ms frames
  const energies = [];
  for (let i = 0; i + hop < data.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j += 4) s += data[j] * data[j];
    energies.push(Math.sqrt(s / (hop / 4)));
  }
  const frameDur = hop / sr;

  // coarse curve for autosync + waveform coloring
  state.energyCurve = energies.map((e, i) => ({ t: i * frameDur, e }));
  state.avgEnergy = energies.reduce((a, b) => a + b, 0) / (energies.length || 1);

  // onset detection: positive energy flux vs local average
  const beats = [];
  const win = 20; // ~0.46 s local window
  let lastBeat = -1;
  for (let i = 1; i < energies.length; i++) {
    let localAvg = 0, n = 0;
    for (let j = Math.max(0, i - win); j < Math.min(energies.length, i + win); j++) { localAvg += energies[j]; n++; }
    localAvg /= n;
    const flux = energies[i] - energies[i - 1];
    const t = i * frameDur;
    if (energies[i] > localAvg * 1.35 && flux > 0 && t - lastBeat > 0.28) {
      beats.push(t);
      lastBeat = t;
    }
  }
  state.beats = beats;

  // BPM: median inter-beat interval
  if (beats.length > 4) {
    const gaps = [];
    for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
    gaps.sort((a, b) => a - b);
    let iv = gaps[Math.floor(gaps.length / 2)];
    let bpm = 60 / iv;
    while (bpm > 190) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    state.bpm = Math.round(bpm);
  } else state.bpm = 0;
}

function drawWaveform() {
  const c = els.waveform, wctx = c.getContext('2d');
  const data = state.buffer.getChannelData(0);
  const step = Math.floor(data.length / c.width);
  wctx.clearRect(0, 0, c.width, c.height);
  const grad = wctx.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, '#7c5cff'); grad.addColorStop(1, '#ff4d8d');
  wctx.fillStyle = grad;
  const mid = c.height / 2;
  for (let x = 0; x < c.width; x++) {
    let max = 0;
    for (let j = 0; j < step; j += 16) max = Math.max(max, Math.abs(data[x * step + j] || 0));
    const h = Math.max(1, max * mid * 1.8);
    wctx.fillRect(x, mid - h / 2, 1, h);
  }
}

/* =====================================================================
   2 · LYRICS — parse, AI auto-sync, tap sync, LRC import/export
   ===================================================================== */
function parseLyricsText() {
  return els.lyricsInput.value.split('\n').map(s => s.trim());
}

/* AI auto-sync: place lines across the vocally-active region, weighting
   each line by its length and snapping starts to nearby detected beats. */
function autoSync() {
  const rawLines = parseLyricsText().filter((s, i, a) => s || (i > 0 && a[i - 1])); // collapse repeat blanks
  const lines = rawLines;
  if (!lines.filter(Boolean).length || !state.duration) return;

  // find active region: first / last time energy exceeds 35% of average
  const thr = state.avgEnergy * 0.35;
  let start = 0, end = state.duration;
  for (const p of state.energyCurve) { if (p.e > thr) { start = Math.max(0.5, p.t); break; } }
  for (let i = state.energyCurve.length - 1; i >= 0; i--) {
    if (state.energyCurve[i].e > thr) { end = state.energyCurve[i].t; break; }
  }
  // leave room for the intro title card
  start = Math.max(start, Math.min(3, state.duration * 0.05));
  const span = Math.max(1, end - start);

  // weights: characters + 6 (breathing room); blank lines = instrumental pause
  const weights = lines.map(s => (s ? s.length + 6 : 14));
  const total = weights.reduce((a, b) => a + b, 0);

  const out = [];
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    let t = start + (acc / total) * span;
    t = snapToBeat(t, 0.35);
    if (lines[i]) out.push({ t: +t.toFixed(2), text: lines[i] });
    acc += weights[i];
  }
  state.lyrics = out;
  renderTimeline();
  els.btnExportLrc.disabled = out.length === 0;
  flashBtn(els.btnAutoSync, '✅ Synced!');
}

function snapToBeat(t, maxDist) {
  let best = t, bd = maxDist;
  for (const b of state.beats) {
    const d = Math.abs(b - t);
    if (d < bd) { bd = d; best = b; }
    if (b > t + maxDist) break;
  }
  return best;
}

/* Tap sync */
function startTapSync() {
  const lines = parseLyricsText().filter(Boolean);
  if (!lines.length) { alert('Type or paste lyrics first.'); return; }
  state.lyrics = lines.map(text => ({ t: -1, text }));
  state.tapIndex = 0;
  state.tapMode = true;
  renderTimeline();
  els.tapBanner.classList.remove('hidden');
  els.btnTapSync.classList.add('active');
  state.audioEl.currentTime = 0;
  play();
}
function tapStamp() {
  if (state.tapIndex < state.lyrics.length) {
    state.lyrics[state.tapIndex].t = +state.audioEl.currentTime.toFixed(2);
    state.tapIndex++;
    renderTimeline();
  }
  if (state.tapIndex >= state.lyrics.length) endTapSync();
}
function endTapSync() {
  state.tapMode = false;
  state.lyrics = state.lyrics.filter(l => l.t >= 0);
  els.tapBanner.classList.add('hidden');
  els.btnTapSync.classList.remove('active');
  els.btnExportLrc.disabled = state.lyrics.length === 0;
  renderTimeline();
}

/* LRC */
function importLrc(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) {
      const t = parseInt(m[1]) * 60 + parseFloat(m[2]);
      const txt = m[3].trim();
      if (txt) out.push({ t, text: txt });
    }
  }
  if (out.length) {
    out.sort((a, b) => a.t - b.t);
    state.lyrics = out;
    els.lyricsInput.value = out.map(l => l.text).join('\n');
    renderTimeline();
    els.btnExportLrc.disabled = false;
  } else {
    els.lyricsInput.value = text; // plain text fallback
  }
}
function exportLrc() {
  const lrc = state.lyrics.map(l => {
    const m = Math.floor(l.t / 60), s = (l.t % 60).toFixed(2).padStart(5, '0');
    return `[${String(m).padStart(2, '0')}:${s}]${l.text}`;
  }).join('\n');
  download(new Blob([lrc], { type: 'text/plain' }), (state.fileName || 'lyrics') + '.lrc');
}

function renderTimeline() {
  els.lyricTimeline.innerHTML = '';
  state.lyrics.forEach((l, i) => {
    const li = document.createElement('li');
    li.dataset.i = i;
    const time = document.createElement('span');
    time.className = 'lt-time';
    time.textContent = l.t >= 0 ? fmt(l.t) : '--:--';
    time.title = 'Click: seek here · Shift+click: set to current time';
    time.addEventListener('click', e => {
      if (e.shiftKey && state.audioEl) {
        l.t = +state.audioEl.currentTime.toFixed(2);
        state.lyrics.sort((a, b) => a.t - b.t);
        renderTimeline();
      } else if (state.audioEl && l.t >= 0) {
        state.audioEl.currentTime = l.t;
        if (!state.playing) renderFrame(l.t);
      }
    });
    const text = document.createElement('span');
    text.className = 'lt-text';
    text.textContent = l.text;
    li.append(time, text);
    els.lyricTimeline.appendChild(li);
  });
}

/* =====================================================================
   3 · MEDIA (AMV visuals)
   ===================================================================== */
function addMedia(files) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const img = new Image();
    img.onload = () => {
      state.media.push({ img, kb: randomKenBurns() });
      renderMediaStrip();
      if (!state.playing) renderFrame(state.audioEl ? state.audioEl.currentTime : 0);
    };
    img.src = URL.createObjectURL(f);
  }
}
function randomKenBurns() {
  const z0 = 1.05 + Math.random() * 0.1;
  const z1 = z0 + 0.08 + Math.random() * 0.12;
  return {
    zoomIn: Math.random() > 0.5, z0, z1,
    px: (Math.random() - 0.5) * 0.12,
    py: (Math.random() - 0.5) * 0.12
  };
}
function renderMediaStrip() {
  els.mediaStrip.innerHTML = '';
  state.media.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'media-thumb';
    const im = document.createElement('img');
    im.src = m.img.src;
    const x = document.createElement('button');
    x.textContent = '✕';
    x.addEventListener('click', () => { state.media.splice(i, 1); renderMediaStrip(); });
    d.append(im, x);
    els.mediaStrip.appendChild(d);
  });
}

/* =====================================================================
   4 · THEMES + AI STYLE SUGGESTION
   ===================================================================== */
function buildThemeGrid() {
  THEMES.forEach(t => {
    const tile = document.createElement('div');
    tile.className = 'theme-tile';
    tile.style.background = t.css;
    tile.textContent = t.name;
    tile.dataset.id = t.id;
    tile.addEventListener('click', () => setTheme(t.id));
    els.themeGrid.appendChild(tile);
  });
  setTheme('neon');
}
function setTheme(id) {
  state.theme = THEMES.find(t => t.id === id) || THEMES[0];
  document.querySelectorAll('.theme-tile').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id));
  particles.length = 0;
  if (!state.playing) renderFrame(state.audioEl ? state.audioEl.currentTime : 0);
}
/* pick theme from tempo + energy */
function aiSuggestStyle() {
  let id;
  if (state.bpm >= 150 && state.avgEnergy > 0.12) id = 'crimson';      // fast & loud → battle
  else if (state.bpm >= 128) id = 'neon';                              // fast → neon
  else if (state.bpm >= 105) id = state.avgEnergy > 0.1 ? 'sunset' : 'vapor';
  else if (state.bpm >= 85)  id = 'sakura';
  else if (state.avgEnergy < 0.06) id = 'rain';                        // quiet ballad
  else id = 'midnight';
  setTheme(id);
  // matching text style
  els.animPick.value = state.bpm >= 128 ? 'bounce' : state.bpm >= 100 ? 'rise' : 'fade';
  els.fontPick.value = state.bpm >= 128
    ? "Impact, 'Arial Black', sans-serif"
    : state.bpm >= 90 ? "'Segoe UI', system-ui, sans-serif" : "Georgia, 'Times New Roman', serif";
  flashBtn(els.btnAiStyle, `🤖 ${state.theme.name}!`);
}

/* =====================================================================
   5 · RENDERER
   ===================================================================== */
const particles = [];
let grainTiles = null;
let rafId = 0;

function beatIntensity(t) {
  // 0..1 pulse decaying after the nearest past beat
  let last = -10;
  for (const b of state.beats) { if (b <= t) last = b; else break; }
  const d = t - last;
  return d < 0.35 ? Math.pow(1 - d / 0.35, 2) : 0;
}
function currentLineIndex(t) {
  let idx = -1;
  for (let i = 0; i < state.lyrics.length; i++) {
    if (state.lyrics[i].t <= t) idx = i; else break;
  }
  return idx;
}

function renderFrame(t) {
  const W = canvas.width, H = canvas.height;
  const th = state.theme || THEMES[0];
  const beat = els.fxBeatPulse.checked ? beatIntensity(t) : 0;

  /* --- background --- */
  ctx.save();
  const zoom = 1 + beat * 0.03;
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);

  if (state.media.length) {
    drawMediaBackground(t, W, H, th);
  } else {
    drawGradientBackground(t, W, H, th);
  }
  ctx.restore();

  /* --- particles --- */
  if (els.fxParticles.checked) drawParticles(t, W, H, th, beat);

  /* --- spectrum bars --- */
  if (els.fxBars.checked && analyser && state.playing) drawSpectrum(W, H, th);

  /* --- lyric text --- */
  drawLyrics(t, W, H, th, beat);

  /* --- overlays --- */
  if (els.fxVignette.checked) drawVignette(W, H);
  if (els.fxGrain.checked) drawGrain(W, H);
  if (els.fxLetterbox.checked) {
    ctx.fillStyle = '#000';
    const bar = Math.round(H * 0.085);
    ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
  }
}

function drawGradientBackground(t, W, H, th) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, th.bg[0]); g.addColorStop(0.55, th.bg[1]); g.addColorStop(1, th.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // slow aurora blobs
  for (let i = 0; i < 3; i++) {
    const ang = t * 0.12 + i * 2.1;
    const x = W / 2 + Math.cos(ang) * W * 0.3;
    const y = H / 2 + Math.sin(ang * 0.8) * H * 0.25;
    const r = Math.max(1, W * (0.22 + 0.05 * Math.sin(t * 0.3 + i)));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(th.glow, 0.16));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawMediaBackground(t, W, H, th) {
  // slide length: 2 bars of music, else 6 s
  const slide = state.bpm ? Math.max(3.5, (60 / state.bpm) * 8) : 6;
  const n = state.media.length;
  const pos = t / slide;
  const idx = Math.floor(pos) % n;
  const next = (idx + 1) % n;
  const frac = pos - Math.floor(pos);
  const fade = 0.85; // crossfade begins at 85% of the slide

  drawKenBurns(state.media[idx], frac, W, H, 1);
  if (frac > fade && n > 1) {
    drawKenBurns(state.media[next], 0, W, H, (frac - fade) / (1 - fade));
  }
  // theme tint so text stays readable
  ctx.fillStyle = hexA(th.bg[2], 0.38);
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawKenBurns(m, frac, W, H, alpha) {
  const { img, kb } = m;
  const z = kb.zoomIn ? kb.z0 + (kb.z1 - kb.z0) * frac : kb.z1 - (kb.z1 - kb.z0) * frac;
  // cover-fit
  const s = Math.max(W / img.width, H / img.height) * z;
  const dw = img.width * s, dh = img.height * s;
  const dx = (W - dw) / 2 + kb.px * W * (frac - 0.5) * 2;
  const dy = (H - dh) / 2 + kb.py * H * (frac - 0.5) * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/* particles */
function spawnParticle(W, H, th) {
  const type = th.particle;
  const p = { type, x: Math.random() * W, y: -20, life: 1 };
  switch (type) {
    case 'petal':  Object.assign(p, { vx: 0.4 + Math.random(), vy: 0.7 + Math.random() * 0.9, r: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 0.06 }); break;
    case 'snow':   Object.assign(p, { vx: (Math.random() - .5) * 0.5, vy: 0.4 + Math.random() * 0.7, r: 1.5 + Math.random() * 3 }); break;
    case 'rain':   Object.assign(p, { vx: -1.2, vy: 9 + Math.random() * 5, r: 1, len: 12 + Math.random() * 10 }); break;
    case 'star':   Object.assign(p, { x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, r: 0.6 + Math.random() * 1.6, tw: Math.random() * 6.28 }); break;
    case 'ember':  Object.assign(p, { y: H + 10, vx: (Math.random() - .5) * 0.8, vy: -(0.8 + Math.random() * 1.6), r: 1.5 + Math.random() * 2.5 }); break;
    case 'spark':  Object.assign(p, { y: H + 10, vx: (Math.random() - .5) * 0.6, vy: -(1.2 + Math.random() * 2), r: 1 + Math.random() * 2 }); break;
    case 'bubble': Object.assign(p, { y: H + 10, vx: (Math.random() - .5) * 0.4, vy: -(0.5 + Math.random()), r: 3 + Math.random() * 8 }); break;
  }
  particles.push(p);
}
function drawParticles(t, W, H, th, beat) {
  const target = th.particle === 'rain' ? 90 : th.particle === 'star' ? 70 : 45;
  const burst = beat > 0.7 ? 3 : 1;
  for (let i = 0; i < burst && particles.length < target; i++) spawnParticle(W, H, th);

  ctx.save();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.type === 'petal') { p.rot += p.vr; p.x += Math.sin(t * 2 + p.y * 0.01) * 0.6; }
    if (p.type === 'snow') p.x += Math.sin(t + p.y * 0.02) * 0.4;

    const off = p.y > H + 30 || p.y < -40 || p.x < -40 || p.x > W + 40;
    if (off && p.type !== 'star') { particles.splice(i, 1); continue; }

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = th.accent;
    switch (p.type) {
      case 'petal':
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.283); ctx.fill();
        ctx.restore(); break;
      case 'rain':
        ctx.strokeStyle = hexA(th.accent, 0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx, p.y + p.len); ctx.stroke(); break;
      case 'star': {
        const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + p.tw));
        ctx.globalAlpha = a * (0.6 + beat * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + beat, 0, 6.283); ctx.fill(); break;
      }
      case 'ember': case 'spark': {
        ctx.fillStyle = th.glow;
        ctx.globalAlpha = 0.5 + beat * 0.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); break;
      }
      case 'bubble':
        ctx.strokeStyle = hexA(th.accent, 0.5); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.stroke(); break;
      default:
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
  }
  ctx.restore();
}

function drawSpectrum(W, H, th) {
  analyser.getByteFrequencyData(freqData);
  const n = 48, bw = W / n;
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < n; i++) {
    const v = freqData[Math.floor(i * freqData.length / n * 0.75)] / 255;
    const h = v * H * 0.16;
    const g = ctx.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, th.glow); g.addColorStop(1, hexA(th.glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(i * bw + 1, H - h, bw - 2, h);
  }
  ctx.restore();
}

/* lyric text */
function drawLyrics(t, W, H, th, beat) {
  const size = +els.fontSize.value * (W / 1280);
  const font = els.fontPick.value;
  const anim = els.animPick.value;
  const idx = currentLineIndex(t);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* intro title card before the first line */
  const firstT = state.lyrics.length ? state.lyrics[0].t : 3;
  const title = els.videoTitle.value.trim();
  if (title && t < firstT) {
    const a = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (firstT - t) / 0.8));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 ${size * 1.15}px ${font}`;
    ctx.shadowColor = th.glow; ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    wrapText(title, W / 2, H / 2, W * 0.82, size * 1.3);
    ctx.restore();
  }

  if (idx < 0 || !state.lyrics.length) return;
  const line = state.lyrics[idx];
  const nextT = idx + 1 < state.lyrics.length ? state.lyrics[idx + 1].t : state.duration;
  const el = t - line.t;                       // time since line start
  const lineDur = Math.max(0.1, nextT - line.t);
  const prog = Math.min(1, el / lineDur);
  const inA = Math.min(1, el / 0.45);          // entrance 0..1
  const outA = Math.min(1, Math.max(0, (nextT - t) / 0.35));

  const cx = W / 2;
  const cy = els.fxLetterbox.checked ? H * 0.78 : H * 0.72;

  ctx.save();
  ctx.font = `700 ${size}px ${font}`;
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;

  switch (anim) {
    case 'fade':
      ctx.globalAlpha = inA * outA;
      ctx.fillStyle = '#fff';
      wrapText(line.text, cx, cy, W * 0.86, size * 1.15);
      break;

    case 'rise': {
      const ease = 1 - Math.pow(1 - inA, 3);
      ctx.globalAlpha = inA * outA;
      ctx.shadowColor = th.glow; ctx.shadowBlur = 18 + beat * 22;
      ctx.fillStyle = '#fff';
      wrapText(line.text, cx, cy + (1 - ease) * 40, W * 0.86, size * 1.15);
      break;
    }
    case 'karaoke': {
      ctx.globalAlpha = inA * outA;
      const rows = wrapLines(line.text, W * 0.86);
      const totalChars = line.text.length || 1;
      let done = Math.floor(prog * totalChars);
      let y = cy - (rows.length - 1) * size * 0.6;
      for (const row of rows) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillText(row, cx, y);
        const fill = Math.max(0, Math.min(row.length, done));
        if (fill > 0) {
          const sub = row.slice(0, fill);
          const fullW = ctx.measureText(row).width;
          const subW = ctx.measureText(sub).width;
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - fullW / 2, y - size, subW, size * 2);
          ctx.clip();
          ctx.fillStyle = th.accent;
          ctx.shadowColor = th.glow; ctx.shadowBlur = 16;
          ctx.fillText(row, cx, y);
          ctx.restore();
        }
        done -= row.length;
        y += size * 1.2;
      }
      break;
    }
    case 'typewriter': {
      ctx.globalAlpha = outA;
      const chars = Math.floor(Math.min(1, el / Math.min(1.4, lineDur * 0.55)) * line.text.length);
      ctx.fillStyle = '#fff';
      const shown = line.text.slice(0, chars) + (chars < line.text.length && Math.floor(t * 3) % 2 ? '▌' : '');
      wrapText(shown, cx, cy, W * 0.86, size * 1.15);
      break;
    }
    case 'bounce': {
      const s = 1 + beat * 0.12 + (1 - inA) * 0.25;
      ctx.globalAlpha = inA * outA;
      ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      ctx.shadowColor = th.glow; ctx.shadowBlur = 14 + beat * 30;
      ctx.fillStyle = '#fff';
      wrapText(line.text, cx, cy, W * 0.86, size * 1.15);
      break;
    }
  }
  ctx.restore();

  /* next-line preview */
  if (idx + 1 < state.lyrics.length && anim !== 'typewriter') {
    ctx.save();
    ctx.globalAlpha = 0.35 * outA;
    ctx.font = `400 ${size * 0.55}px ${font}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(truncate(state.lyrics[idx + 1].text, 60), cx, cy + size * 1.6);
    ctx.restore();
  }
}

function wrapLines(text, maxW) {
  const words = text.split(' ');
  const rows = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { rows.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) rows.push(cur);
  return rows;
}
function wrapText(text, x, y, maxW, lh) {
  const rows = wrapLines(text, maxW);
  let yy = y - (rows.length - 1) * lh / 2;
  for (const r of rows) { ctx.fillText(r, x, yy); yy += lh; }
}

function drawVignette(W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function drawGrain(W, H) {
  if (!grainTiles) {
    grainTiles = [];
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      const d = g.createImageData(128, 128);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 18;
      }
      g.putImageData(d, 0, 0);
      grainTiles.push(c);
    }
  }
  const tile = grainTiles[Math.floor(Math.random() * grainTiles.length)];
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let y = 0; y < H; y += 128)
    for (let x = 0; x < W; x += 128)
      ctx.drawImage(tile, x, y);
  ctx.restore();
}

/* =====================================================================
   6 · PLAYBACK LOOP
   ===================================================================== */
function loop() {
  if (!state.playing) return;
  const t = state.audioEl.currentTime;
  renderFrame(t);
  els.seek.value = Math.round(t / state.duration * 1000);
  els.timeCur.textContent = fmt(t);
  highlightTimeline(t);
  rafId = requestAnimationFrame(loop);
}
function highlightTimeline(t) {
  const idx = currentLineIndex(t);
  els.lyricTimeline.querySelectorAll('li').forEach((li, i) => {
    const cur = i === idx;
    if (cur && !li.classList.contains('current')) li.scrollIntoView({ block: 'nearest' });
    li.classList.toggle('current', cur);
  });
}
function play() {
  if (!state.audioEl) return;
  ensureAudioGraph();
  actx.resume();
  state.audioEl.play();
  state.playing = true;
  els.btnPlay.textContent = '❚❚';
  els.stageOverlay.classList.add('hidden');
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}
function pause() {
  if (state.audioEl) state.audioEl.pause();
  state.playing = false;
  els.btnPlay.textContent = '▶';
  cancelAnimationFrame(rafId);
}

/* =====================================================================
   7 · EXPORT (canvas + audio → WebM via MediaRecorder)
   ===================================================================== */
async function exportVideo() {
  if (state.exporting || !state.audioEl) return;
  ensureAudioGraph();
  await actx.resume();

  pause();
  state.audioEl.currentTime = 0;
  particles.length = 0;

  const fps = 30;
  const videoStream = canvas.captureStream(fps);
  const audioDest = actx.createMediaStreamDestination();
  sourceNode.connect(audioDest);

  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks()
  ]);

  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  const cleanup = () => {
    state.exporting = false;
    state.recorder = null;
    try { sourceNode.disconnect(audioDest); } catch (e) { /* already gone */ }
    els.exportBanner.classList.add('hidden');
    els.btnExport.disabled = false;
    pause();
  };

  rec.onstop = () => {
    if (chunks.length && !rec._cancelled) {
      const blob = new Blob(chunks, { type: 'video/webm' });
      download(blob, (state.fileName || 'lyric-video') + '.webm');
    }
    cleanup();
  };

  state.exporting = true;
  state.recorder = rec;
  els.btnExport.disabled = true;
  els.exportBanner.classList.remove('hidden');

  rec.start(500);
  play();

  const tick = setInterval(() => {
    if (!state.exporting) { clearInterval(tick); return; }
    const t = state.audioEl.currentTime;
    els.exportStatus.textContent = `Rendering… ${fmt(t)} / ${fmt(state.duration)} (real-time)`;
    if (state.audioEl.ended || t >= state.duration - 0.05) {
      clearInterval(tick);
      rec.stop();
    }
  }, 250);
}
function cancelExport() {
  if (state.recorder) {
    state.recorder._cancelled = true;
    state.recorder.stop();
  }
}

/* =====================================================================
   helpers + wiring
   ===================================================================== */
function fmt(s) {
  s = Math.max(0, s | 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
function flashBtn(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => btn.textContent = old, 1600);
}
function bindDrop(zone, input, handler) {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    handler(e.dataTransfer.files);
  });
  input.addEventListener('change', () => handler(input.files));
}

/* wiring */
bindDrop(els.audioDrop, els.audioFile, files => loadAudio(files[0]));
bindDrop(els.mediaDrop, els.mediaFiles, files => addMedia(files));

els.btnPlay.addEventListener('click', () => state.playing ? pause() : play());
els.seek.addEventListener('input', () => {
  if (!state.audioEl) return;
  const t = els.seek.value / 1000 * state.duration;
  state.audioEl.currentTime = t;
  els.timeCur.textContent = fmt(t);
  if (!state.playing) renderFrame(t);
});

els.btnAutoSync.addEventListener('click', autoSync);
els.btnTapSync.addEventListener('click', () => state.tapMode ? endTapSync() : startTapSync());
els.lrcFile.addEventListener('change', async () => {
  const f = els.lrcFile.files[0];
  if (f) importLrc(await f.text());
});
els.btnExportLrc.addEventListener('click', exportLrc);
els.btnAiStyle.addEventListener('click', aiSuggestStyle);
els.btnExport.addEventListener('click', exportVideo);
els.btnCancelExport.addEventListener('click', cancelExport);

els.resolution.addEventListener('change', () => {
  const [w, h] = els.resolution.value.split('x').map(Number);
  canvas.width = w; canvas.height = h;
  if (!state.playing) renderFrame(state.audioEl ? state.audioEl.currentTime : 0);
});

document.addEventListener('keydown', e => {
  if (state.tapMode && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault(); tapStamp();
  } else if (state.tapMode && e.code === 'Escape') {
    endTapSync();
  } else if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA'
             && document.activeElement.tagName !== 'INPUT' && state.audioEl) {
    e.preventDefault();
    state.playing ? pause() : play();
  }
});

// live re-render when style controls change while paused
[els.fontPick, els.animPick, els.fontSize, els.videoTitle,
 els.fxParticles, els.fxBeatPulse, els.fxBars, els.fxVignette, els.fxGrain, els.fxLetterbox]
  .forEach(el => el.addEventListener('input', () => {
    if (!state.playing) renderFrame(state.audioEl ? state.audioEl.currentTime : 0);
  }));

buildThemeGrid();
renderFrame(0);
