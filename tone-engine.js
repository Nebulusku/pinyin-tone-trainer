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

/* Splits hanzi into one string per syllable; an erhua syllable (nǎr) also takes the following 儿.
   Returns null when the characters don't line up with the pinyin. */
function syllableChars(zh, parsed) {
  const chars = [...zh.replace(/[\p{P}\s]/gu, "")], out = [];
  let i = 0;
  for (const s of parsed.syls) {
    if (i >= chars.length) return null;
    let c = chars[i++];
    const plain = s.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (plain.endsWith("r") && plain !== "er" && chars[i] === "儿") c += chars[i++];
    out.push(c);
  }
  return i === chars.length ? out : null;
}

/* ---------- Microphone ---------- */
const Mic = {
  ctx: null,
  stream: null,
  /* Call straight from a tap: iOS only lets the audio engine start inside the tap itself,
     so it is created/resumed before anything is awaited. */
  async init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw new Error("Microphone not available — open the app in Safari or Chrome.");
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const resuming = this.ctx.state !== "running" ? this.ctx.resume().catch(() => {}) : null;
    if (!this.stream)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    if (resuming) await resuming;
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => {});
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
    let elapsed = 0, heard = false, quiet = 0, floor = null, stopped = false, peak = 0, resolve;
    const done = new Promise(r => (resolve = r));
    const started = Date.now();
    // safety nets: stop on wall-clock time, and notice a microphone that delivers no audio at all
    const guard = setTimeout(() => stop(), maxMs + 1000);
    const deadCheck = setTimeout(() => { if (!chunks.length) stop(); }, 1500);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(guard);
      clearTimeout(deadCheck);
      proc.onaudioprocess = null;
      try { src.disconnect(); proc.disconnect(); } catch (e) {}
      const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
      let o = 0;
      chunks.forEach(c => { out.set(c, o); o += c.length; });
      resolve({ samples: out, sr: ctx.sampleRate, heard: heard || peak > 0.02, dead: !chunks.length, ms: Date.now() - started });
    };
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const r = Math.sqrt(s / d.length), ms = (1000 * d.length) / ctx.sampleRate;
      peak = Math.max(peak, r);
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

/* Marks voiced frames, converts to semitones (re 100 Hz), repairs octave errors and drops blips.
   Repairs work per voiced run, so a genuinely high tone isn't "corrected" against the whole utterance. */
function cleanFrames(frames) {
  if (!frames.length) return frames;
  const r = frames.map(f => f.rms).sort((a, b) => a - b);
  const thr = Math.max(pct(r, 0.1) * 3, r[r.length - 1] * 0.03, 0.002);
  frames.forEach(f => {
    f.voiced = f.f0 > 0 && f.rms > thr;
    f.st = f.voiced ? 12 * Math.log2(f.f0 / 100) : null;
  });
  const runs = [];
  for (let i = 0; i < frames.length; ) {
    if (!frames[i].voiced) { i++; continue; }
    let j = i;
    while (j < frames.length && frames[j].voiced) j++;
    if (j - i < 4) for (let k = i; k < j; k++) frames[k].voiced = false;
    else runs.push([i, j]);
    i = j;
  }
  for (const [a, b] of runs) {
    const m = median(frames.slice(a, b).map(f => f.st));
    for (let k = a; k < b; k++) { const f = frames[k]; while (f.st - m > 9) f.st -= 12; while (m - f.st > 9) f.st += 12; }
    const raw = frames.slice(a, b).map(f => f.st);
    for (let k = a; k < b; k++) {
      const lm = median(raw.slice(Math.max(0, k - a - 2), k - a + 3));
      if (Math.abs(frames[k].st - lm) > 3) frames[k].st = lm;
    }
  }
  const voiced = frames.filter(f => f.voiced).map(f => f.st);
  if (voiced.length) {
    const all = median(voiced);
    for (const [a, b] of runs) {
      const m = median(frames.slice(a, b).map(f => f.st)), shift = m - all > 10 ? -12 : all - m > 10 ? 12 : 0;
      if (shift) for (let k = a; k < b; k++) frames[k].st += shift;
    }
  }
  return frames;
}

/* ---------- Tone checking ----------
   1. Alignment: the known number of syllables is fitted to the pitch track with dynamic programming,
      choosing cut points on volume dips / pauses where each piece looks like *some* tone
      (never the expected one — otherwise any tone could be made to fit).
   2. Per-tone checks with tolerance, on semitone features (start, end, lowest point, level). */

/* Target shapes, only used to draw the dashed guide lines (+1 = top of your range, -1 = bottom). */
const TEMPLATES = {
  1: [0.9, 0.9, 0.9, 0.9, 0.9],
  2: [-0.2, -0.15, 0.15, 0.5, 0.9],
  3: [-0.5, -0.85, -1, -0.8, -0.2],
  "3h": [-0.45, -0.75, -0.95, -1.05, -1.1],
  4: [1, 0.7, 0.2, -0.35, -0.9],
};
/* Verdicts, chosen on held-out native recordings (tools/train_tones.js):
   ✓ "ok"     expected tone is the most likely one, or at least 30% likely
   ✗ "bad"    expected tone is under 5% likely — clearly another tone
   ? "unsure" anything in between (counts half in the score) */
const OK_P = 0.3, BAD_P = 0.05;

/* Pitch features of one syllable: semitone values of its voiced frames, ends trimmed. */
function features(st) {
  const t = Math.floor(st.length * 0.1), v = st.length - 2 * t >= 3 ? st.slice(t, st.length - t) : st;
  const q = Math.max(1, Math.round(v.length / 4));
  const S = mean(v.slice(0, q)), E = mean(v.slice(-q)), L = mean(v);
  let M = Infinity, pm = 0;
  for (let i = 0; i < v.length; i++) { const w = mean(v.slice(Math.max(0, i - 1), i + 2)); if (w < M) { M = w; pm = i / Math.max(1, v.length - 1); } }
  const mid = mean(v.slice(q, Math.max(q + 1, v.length - q)));
  return { S, E, L, M, pm, fall: S - E, rise: E - M, curv: mid - (S + E) / 2 };
}

/* Tone model: per tone, mean + spread of each pitch feature, learned from native recordings
   (tools/train_tones.js → tone-model.js), separately for words said on their own ("iso"),
   syllables inside a phrase ("mid") and the last syllable of a phrase ("final"). */
/* ds = start of this syllable minus end of the previous one (null for the first syllable / during alignment). */
const FEATS = ["fall", "rise", "pm", "curv", "l", "ls", "le", "ds"];
function featureVector(f, lvl, ds = null) {
  return { fall: f.fall, rise: f.rise, pm: f.pm, curv: f.curv, l: lvl ? lvl(f.L) : null, ls: lvl ? lvl(f.S) : null, le: lvl ? lvl(f.E) : null, ds };
}

/* Cost of each tone for one syllable = average negative log-likelihood under that tone's model
   (level features are skipped when the level is unknown: single word, no calibration). */
function toneCosts(f, lvl, group, ds = null) {
  const x = featureVector(f, lvl, ds), m = TONE_MODEL[group] || TONE_MODEL.final, out = {};
  for (const t of [1, 2, 3, 4]) {
    let nll = 0, k = 0;
    FEATS.forEach((name, i) => {
      if (x[name] == null) return;
      const z = (x[name] - m[t].mu[i]) / m[t].sd[i];
      nll += 0.5 * z * z + Math.log(m[t].sd[i]);
      k++;
    });
    out[t] = nll / k;
  }
  return out;
}

/* Probability of each tone (softmax of costs) — used for pass/fail. */
function toneProbs(tc) {
  const n = Object.keys(tc).length, best = Math.min(...Object.values(tc)), e = {};
  let sum = 0;
  for (const t in tc) { e[t] = Math.exp(-(tc[t] - best) * n); sum += e[t]; }
  for (const t in e) e[t] /= sum;
  return e;
}

/* Splits the voiced span into one segment per syllable (dynamic programming over cut points). */
function alignSyllables(frames, syls, lvl) {
  const vi = [];
  frames.forEach((f, i) => f.voiced && vi.push(i));
  const n = syls.length;
  if (vi.length < Math.max(4, n * 3)) return null;
  const a = vi[0], b = vi[vi.length - 1] + 1, span = b - a, avg = span / n, step = span > 300 ? 2 : 1;
  const maxR = Math.max(...vi.map(i => frames[i].rms));
  const energy = i => {
    let s = 0, c = 0;
    for (let k = i - 2; k <= i + 2; k++) if (frames[k]) { s += frames[k].voiced ? frames[k].rms : 0; c++; }
    return s / c / maxR;
  };
  const P = [];
  for (let p = a; p < b; p += step) P.push(p);
  P.push(b);
  const minLen = Math.max(3, Math.floor(avg * 0.25)), maxLen = Math.ceil(avg * 2.6) + 4;
  const memo = new Map();
  const costsOf = (i, j) => {
    const key = i * 100000 + j;
    if (!memo.has(key)) {
      const st = [];
      for (let k = i; k < j; k++) if (frames[k].voiced) st.push(frames[k].st);
      memo.set(key, st.length >= 3 ? toneCosts(features(st), lvl, n === 1 ? "iso" : j === b ? "final" : "mid") : null);
    }
    return memo.get(key);
  };
  const segCost = (k, i, j) => {
    const syl = syls[k], len = j - i, want = syl.expect ? avg * 1.1 : avg * 0.6;
    let c = 0.35 * ((len - want) / want) ** 2 + (k ? energy(i) * 0.8 : 0);
    if (syl.expect) {
      const tc = costsOf(i, j);
      c += tc ? Math.min(tc[1], tc[2], tc[3], tc[4]) : 3; // tone-agnostic: cuts must not depend on the expected tone
    }
    return c;
  };
  const INF = 1e9, D = Array.from({ length: n + 1 }, () => new Float64Array(P.length).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Int32Array(P.length).fill(-1));
  D[0][0] = 0;
  for (let k = 0; k < n; k++)
    for (let x = 0; x < P.length; x++) {
      if (D[k][x] >= INF) continue;
      for (let y = x + 1; y < P.length && P[y] - P[x] <= maxLen; y++) {
        if (P[y] - P[x] < minLen && y !== P.length - 1) continue;
        const c = D[k][x] + segCost(k, P[x], P[y]);
        if (c < D[k + 1][y]) { D[k + 1][y] = c; back[k + 1][y] = x; }
      }
    }
  let y = P.length - 1;
  if (D[n][y] >= INF) return null;
  const segs = [];
  for (let k = n; k > 0; k--) { const x = back[k][y]; segs.unshift([P[x], P[y]]); y = x; }
  return segs;
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
  const n = parsed.syls.length, st = voicedSemitones(frames);
  if (st.length < Math.max(4, n * 3)) return { error: "I couldn't hear enough voice. Speak a little louder or closer to the microphone." };
  let ref = cal, lvl = null;
  if (!ref) {
    const lo = pct(st, 0.1), hi = pct(st, 0.9);
    ref = { center: (lo + hi) / 2, unit: Math.max(3, (hi - lo) / 2) };
  }
  if (cal || n >= 3) lvl = x => Math.max(-1.6, Math.min(1.6, (x - ref.center) / ref.unit));
  const segs = alignSyllables(frames, parsed.syls, lvl);
  if (!segs) return { error: "I couldn't match your recording to the phrase. Try saying the whole phrase clearly." };
  let prevE = null;
  const results = parsed.syls.map((syl, k) => {
    const [s, e] = segs[k], pts = [], vals = [];
    for (let i = s; i < e; i++)
      if (frames[i].voiced) { pts.push({ x: (i - s) / Math.max(1, e - s - 1), z: (frames[i].st - ref.center) / ref.unit }); vals.push(frames[i].st); }
    if (vals.length < 3) return { syl, heard: false, pts, ok: syl.expect ? false : null, verdict: syl.expect ? "bad" : null };
    const group = n === 1 ? "iso" : k === n - 1 ? "final" : "mid";
    const f = features(vals), tc = toneCosts(f, lvl, group, prevE == null ? null : f.S - prevE);
    prevE = f.E;
    const got = +Object.keys(tc).sort((p, q) => tc[p] - tc[q])[0];
    const pr = toneProbs(tc), pe = syl.expect ? syl.expect.reduce((a, t) => a + pr[t], 0) : 0;
    const verdict = !syl.expect ? null : syl.expect.includes(got) || pe >= OK_P ? "ok" : pe < BAD_P ? "bad" : "unsure";
    return { syl, heard: true, pts, got, ok: verdict ? verdict === "ok" : null, verdict, p: pe };
  });
  const graded = results.filter(r => r.syl.expect), count = v => graded.filter(r => r.verdict === v).length;
  const correct = count("ok"), unsure = count("unsure"), wrong = count("bad");
  const score = graded.length ? Math.round((100 * (correct + unsure / 2)) / graded.length) : null;
  return { results, correct, unsure, wrong, total: graded.length, score };
}
