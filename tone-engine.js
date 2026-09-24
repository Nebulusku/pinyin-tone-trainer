/* Pinyin parsing, microphone capture, pitch tracking (YIN) and tone classification. */

const TONE_MAP = {};
[["āēīōūǖ", 1], ["áéíóúǘ", 2], ["ǎěǐǒǔǚ", 3], ["àèìòùǜ", 4]].forEach(([s, t]) => {
  for (const c of s) TONE_MAP[c] = t;
});

function toneOf(syl) {
  for (const c of syl.toLowerCase()) if (TONE_MAP[c]) return TONE_MAP[c];
  return 5;
}

/* Returns {words, syls}. Each syllable gets `expect`: accepted spoken tones (null = neutral, not graded).
   3rd-tone sandhi: in a run of 3rd tones, all but the last may be spoken as 2nd. */
function parsePinyin(py) {
  const words = [], syls = [];
  for (const tok of py.trim().split(/\s+/)) {
    const m = tok.match(/^([^\p{L}']*)([\p{L}']*)([^\p{L}']*)$/u) || ["", "", tok, ""];
    const w = { pre: m[1], post: m[3], syls: [], breakAfter: /[,.!?;:，。！？；：]/.test(m[3]) };
    for (const s of m[2].split("'").filter(Boolean)) {
      const syl = { text: s, tone: toneOf(s), idx: syls.length, word: words.length };
      w.syls.push(syl);
      syls.push(syl);
    }
    words.push(w);
  }
  let run = [];
  const flush = () => { run.slice(0, -1).forEach(s => (s.sandhi = true)); run = []; };
  for (const w of words) {
    for (const s of w.syls) s.tone === 3 ? run.push(s) : flush();
    if (w.breakAfter) flush();
  }
  flush();
  syls.forEach(s => { s.expect = s.tone === 5 ? null : s.sandhi ? [2, 3] : [s.tone]; });
  return { words, syls };
}

/* ---------- Microphone ---------- */
const Mic = {
  ctx: null,
  stream: null,
  async init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error("Microphone not available — open this file in Chrome or Safari.");
    if (!this.stream)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  },
  /* On phones an open mic switches audio to the quiet earpiece, so release it after each recording. */
  releaseOnMobile() {
    const mobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    if (!mobile || !this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  },
  /* Records until silence after speech, maxMs, or stop(). Returns {stop, done: Promise<{samples, sr, heard}>}. */
  record({ maxMs = 8000, silenceMs = 1200, onLevel } = {}) {
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(this.stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const chunks = [];
    let elapsed = 0, heard = false, quiet = 0, floor = null, stopped = false, resolve;
    const done = new Promise(r => (resolve = r));
    const stop = () => {
      if (stopped) return;
      stopped = true;
      proc.onaudioprocess = null;
      try { src.disconnect(); proc.disconnect(); } catch (e) {}
      const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
      let o = 0;
      chunks.forEach(c => { out.set(c, o); o += c.length; });
      resolve({ samples: out, sr: ctx.sampleRate, heard });
    };
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const r = Math.sqrt(s / d.length), ms = (1000 * d.length) / ctx.sampleRate;
      elapsed += ms;
      if (floor === null || elapsed < 300) floor = floor === null ? r : Math.min(floor, r);
      if (r > Math.max(0.012, floor * 4)) { heard = true; quiet = 0; } else if (heard) quiet += ms;
      if (onLevel) onLevel(Math.min(1, r * 8));
      if ((heard && quiet > silenceMs) || elapsed > maxMs) stop();
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    return { stop, done };
  },
};

/* ---------- Pitch tracking ---------- */
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
const median = a => pct([...a].sort((x, y) => x - y), 0.5);

function yinTrack(samples, sr) {
  const f = Math.max(1, Math.floor(sr / 16000)), fs = sr / f;
  const n = Math.floor(samples.length / f), x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = 0; k < f; k++) a += samples[i * f + k];
    x[i] = a / f;
  }
  const hop = Math.round(fs * 0.01), W = Math.round(fs * 0.03);
  const minLag = Math.floor(fs / 450), maxLag = Math.ceil(fs / 70);
  const d = new Float32Array(maxLag + 1), frames = [];
  for (let st = 0; st + W + maxLag < n; st += hop) {
    let e = 0;
    for (let j = 0; j < W; j++) e += x[st + j] * x[st + j];
    let run = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[st + j] - x[st + j + tau]; s += v * v; }
      run += s;
      d[tau] = run > 0 ? (s * tau) / run : 1;
    }
    let tau = -1;
    for (let t = minLag; t <= maxLag; t++) {
      if (d[t] < 0.15) { while (t < maxLag && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let m = minLag;
      for (let t = minLag; t <= maxLag; t++) if (d[t] < d[m]) m = t;
      if (d[m] < 0.3) tau = m;
    }
    let f0 = 0;
    if (tau > 0) {
      let t = tau;
      if (t > minLag && t < maxLag) {
        const a = d[t - 1], b = d[t], c = d[t + 1], den = a - 2 * b + c;
        const sh = den ? (0.5 * (a - c)) / den : 0;
        if (Math.abs(sh) < 1) t += sh;
      }
      f0 = fs / t;
    }
    frames.push({ rms: Math.sqrt(e / W), f0 });
  }
  return frames;
}

/* Marks voiced frames, converts to semitones (re 100 Hz), repairs octave jumps and drops blips. */
function cleanFrames(frames) {
  if (!frames.length) return frames;
  const r = frames.map(f => f.rms).sort((a, b) => a - b);
  const thr = Math.max(pct(r, 0.1) * 3, r[r.length - 1] * 0.05, 0.003);
  frames.forEach(f => {
    f.voiced = f.f0 > 0 && f.rms > thr;
    f.st = f.voiced ? 12 * Math.log2(f.f0 / 100) : null;
  });
  const v = frames.filter(f => f.voiced);
  if (!v.length) return frames;
  const med = median(v.map(f => f.st));
  v.forEach(f => { while (f.st - med > 8) f.st -= 12; while (med - f.st > 8) f.st += 12; });
  for (let i = 0; i < v.length; i++) {
    const win = v.slice(Math.max(0, i - 2), i + 3).map(f => f.st);
    const lm = median(win);
    if (Math.abs(v[i].st - lm) > 3) v[i].st = lm;
  }
  let i = 0;
  while (i < frames.length) {
    if (!frames[i].voiced) { i++; continue; }
    let j = i;
    while (j < frames.length && frames[j].voiced) j++;
    if (j - i < 4) for (let k = i; k < j; k++) frames[k].voiced = false;
    i = j;
  }
  return frames;
}

/* Splits the voiced span into n syllable segments at the deepest gaps / energy dips. */
function segment(frames, n) {
  const idx = [];
  frames.forEach((f, i) => f.voiced && idx.push(i));
  if (idx.length < n * 3) return null;
  const a = idx[0], b = idx[idx.length - 1] + 1;
  const maxR = Math.max(...idx.map(i => frames[i].rms));
  const sm = frames.map((_, i) => {
    let s = 0, c = 0;
    for (let k = i - 2; k <= i + 2; k++) if (frames[k]) { s += frames[k].rms; c++; }
    return s / c / maxR;
  });
  const cand = [];
  for (let i = a; i < b; ) {
    if (!frames[i].voiced) {
      let j = i;
      while (j < b && !frames[j].voiced) j++;
      cand.push({ at: Math.floor((i + j) / 2), score: -(j - i) });
      i = j;
    } else {
      if (i > a && i < b - 1 && frames[i - 1].voiced && frames[i + 1].voiced && sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1])
        cand.push({ at: i, score: sm[i] });
      i++;
    }
  }
  cand.sort((p, q) => p.score - q.score);
  const minDist = Math.max(4, (0.4 * (b - a)) / n), cuts = [];
  for (const c of cand) {
    if (cuts.length >= n - 1) break;
    if (c.at - a < minDist || b - c.at < minDist || cuts.some(x => Math.abs(x - c.at) < minDist)) continue;
    cuts.push(c.at);
  }
  while (cuts.length < n - 1) {
    const bd = [a, ...cuts.sort((x, y) => x - y), b];
    let k = 0;
    for (let m = 1; m < bd.length - 1; m++) if (bd[m + 1] - bd[m] > bd[k + 1] - bd[k]) k = m;
    cuts.push(Math.floor((bd[k] + bd[k + 1]) / 2));
  }
  const bd = [a, ...cuts.sort((x, y) => x - y), b];
  return bd.slice(0, -1).map((s, k) => [s, bd[k + 1]]);
}

/* ---------- Tone classification ---------- */
/* Target contours in normalised pitch units: +1 = top of your range, -1 = bottom. */
const TEMPLATES = {
  1: [0.9, 0.9, 0.9, 0.9, 0.9],
  2: [-0.2, -0.15, 0.15, 0.5, 0.9],
  3: [-0.5, -0.85, -1, -0.8, -0.2],
  "3h": [-0.45, -0.75, -0.95, -1.05, -1.1],
  4: [1, 0.7, 0.2, -0.35, -0.9],
};

function resample(vals, k = 5) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const s = Math.floor((i * vals.length) / k), e = Math.max(s + 1, Math.floor(((i + 1) * vals.length) / k));
    out.push(mean(vals.slice(s, e)));
  }
  return out;
}

/* Shape match (amplitude-tolerant) plus pitch-level match. Returns {tone: distance}. */
function matchTone(c, wLevel) {
  const cm = mean(c), cc = c.map(v => v - cm), scores = {};
  for (const key in TEMPLATES) {
    const t = TEMPLATES[key], tm = mean(t), tc = t.map(v => v - tm), tt = dot(tc, tc);
    const a = tt ? Math.min(1.6, Math.max(0.4, dot(cc, tc) / tt)) : 0;
    const shape = cc.reduce((s, v, i) => s + (v - a * tc[i]) ** 2, 0) / c.length;
    const dist = shape + wLevel * (cm - tm) ** 2;
    const tone = key === "3h" ? 3 : +key;
    if (!(tone in scores) || dist < scores[tone]) scores[tone] = dist;
  }
  return scores;
}

function voicedSemitones(frames) {
  return frames.filter(f => f.voiced).map(f => f.st).sort((x, y) => x - y);
}

/* Derives the speaker's pitch range from a calibration recording (mā má mǎ mà). */
function calibrate(samples, sr) {
  const st = voicedSemitones(cleanFrames(yinTrack(samples, sr)));
  if (st.length < 20) return null;
  const lo = pct(st, 0.1), hi = pct(st, 0.9);
  return { center: (lo + hi) / 2, unit: Math.min(8, Math.max(2.5, (hi - lo) / 2)), loHz: 100 * 2 ** (lo / 12), hiHz: 100 * 2 ** (hi / 12) };
}

function analyzeUtterance(samples, sr, parsed, cal) {
  const frames = cleanFrames(yinTrack(samples, sr));
  const n = parsed.syls.length, segs = segment(frames, n);
  if (!segs) return { error: "I couldn't hear enough voice. Speak a little louder or closer to the microphone." };
  let ref = cal;
  if (!ref) {
    const st = voicedSemitones(frames), lo = pct(st, 0.15), hi = pct(st, 0.85);
    ref = { center: (lo + hi) / 2, unit: Math.max(3, (hi - lo) / 2) };
  }
  const wLevel = !cal && n <= 1 ? 0.05 : 0.4;
  const results = parsed.syls.map((syl, k) => {
    const [s, e] = segs[k], pts = [];
    for (let i = s; i < e; i++)
      if (frames[i].voiced) pts.push({ x: (i - s) / Math.max(1, e - s - 1), z: (frames[i].st - ref.center) / ref.unit });
    if (pts.length < 3) return { syl, heard: false, pts, ok: syl.expect ? false : null };
    const trim = Math.floor(pts.length * 0.12);
    const core = pts.slice(trim, pts.length - trim).map(p => p.z);
    const scores = matchTone(resample(core.length >= 3 ? core : pts.map(p => p.z)), wLevel);
    const got = +Object.keys(scores).sort((p, q) => scores[p] - scores[q])[0];
    return { syl, heard: true, pts, got, ok: syl.expect ? syl.expect.includes(got) : null };
  });
  const graded = results.filter(r => r.syl.expect), correct = graded.filter(r => r.ok).length;
  return { results, correct, total: graded.length, score: graded.length ? Math.round((100 * correct) / graded.length) : null };
}
