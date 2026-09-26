/* Learns the tone model from native audio and writes tone-model.js.
   Run from the app folder after build_audio.js and build_training_audio.js:  node tools/train_tones.js
   Data: the lesson clips + extra renders (isolated characters, phrases at other speeds).
   Reports a held-out check (train on split 0 = even lessons, test on split 1 = odd lessons):
   correct tones should pass, deliberately wrong tones should fail. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const ctx = { console, navigator: {} };
vm.createContext(ctx);
const src = ["lessons.js", "lessons-hsk1.js", "tone-engine.js", "audio/manifest.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
vm.runInContext(src + "\nthis.LESSONS = LESSONS; this.AUDIO_FILES = AUDIO_FILES; this.FEATS = FEATS; this.pct = pct;", ctx);

const SR = 16000, cache = new Map();
function decode(file) {
  if (!cache.has(file)) {
    const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"]);
    cache.set(file, new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)));
  }
  return cache.get(file);
}

const items = []; // { it: {zh, py}, f: audio path, split: 0 train / 1 test, lesson: true for the app's own clips }
ctx.LESSONS.forEach((L, li) => [...(L.words || []), ...L.phrases, ...L.dialog.lines].forEach(it => {
  const f = ctx.AUDIO_FILES[`Tingting|${it.zh}`];
  if (f) items.push({ it, f: path.join(root, "audio", f), split: li % 2, lesson: true });
}));
const extraDir = path.join(__dirname, ".train-audio");
if (fs.existsSync(path.join(extraDir, "index.json")))
  for (const x of JSON.parse(fs.readFileSync(path.join(extraDir, "index.json"), "utf8")))
    items.push({ it: { zh: x.zh, py: x.py }, f: path.join(extraDir, x.file), split: x.split, lesson: false });
else console.warn("No extra training audio — run tools/build_training_audio.js for a better model.");

/* The native voice's own calibration (mā má mǎ mà), so isolated words also learn pitch-level features. */
const CAL = ctx.calibrate(decode(path.join(root, "audio", ctx.AUDIO_FILES["Tingting|妈麻马骂"])), SR);
const calLvl = x => Math.max(-1.6, Math.min(1.6, (x - CAL.center) / CAL.unit));

/* Starting point: rough per-tone shapes (semitones / level units), refined by training. */
const G = (mu, sd) => ({ mu, sd });
const SEED = {
  iso: null,
  mid: { 1: G([0, 0, .5, 0, .7, .8, .6, 1], [2, 1, .4, 1, .4, .4, .4, 3]), 2: G([-2, 2.5, .2, -.3, -.1, -.4, .2, -1], [2, 1.5, .4, 1, .5, .5, .5, 3]),
         3: G([1, .5, .6, -.3, -.3, 0, -.5, -1], [2, 1, .4, 1, .5, .5, .5, 3]), 4: G([4.5, .3, .9, .3, .3, .8, -.3, 2], [2, 1, .3, 1, .5, .5, .5, 3]) },
};
SEED.final = SEED.iso = SEED.mid;

function extract(model, subset) {
  ctx.TONE_MODEL = model;
  const rows = [];
  for (const { it, f } of subset) {
    const p = ctx.parsePinyin(it.py), fr = ctx.cleanFrames(ctx.yinTrack(decode(f), SR)), st = ctx.voicedSemitones(fr);
    if (st.length < 12) continue;
    const lo = ctx.pct(st, 0.1), hi = ctx.pct(st, 0.9), c = (lo + hi) / 2, u = Math.max(3, (hi - lo) / 2);
    const lvl = p.syls.length >= 3 ? x => Math.max(-1.6, Math.min(1.6, (x - c) / u)) : p.syls.length === 1 ? calLvl : null;
    const segs = ctx.alignSyllables(fr, p.syls, lvl);
    if (!segs) continue;
    let prevE = null;
    p.syls.forEach((s, k) => {
      const v = [];
      for (let i = segs[k][0]; i < segs[k][1]; i++) if (fr[i].voiced) v.push(fr[i].st);
      if (v.length < 3) return;
      const F = ctx.features(v), ds = prevE == null ? null : F.S - prevE;
      prevE = F.E;
      if (!s.expect) return;
      const x = ctx.featureVector(F, lvl, ds);
      const group = p.syls.length === 1 ? "iso" : k === p.syls.length - 1 ? "final" : "mid";
      rows.push({ tone: s.sandhi ? 2 : s.tone, group, x: ctx.FEATS.map(n => x[n]) });
    });
  }
  return rows;
}

/* Robust fit: median and IQR-based spread, with floors so no feature becomes over-confident. */
const FLOOR = [1.2, 0.8, 0.2, 0.6, 0.25, 0.25, 0.25, 1.2];
function fit(rows) {
  const model = {};
  for (const grp of ["iso", "mid", "final"]) {
    model[grp] = {};
    for (const t of [1, 2, 3, 4]) {
      let R = rows.filter(r => r.tone === t && r.group === grp);
      if (R.length < 15) R = rows.filter(r => r.tone === t); // too few final examples: pool
      model[grp][t] = { mu: [], sd: [] };
      for (let i = 0; i < FLOOR.length; i++) {
        const v = R.map(r => r.x[i]).filter(x => x != null).sort((a, b) => a - b);
        if (!v.length) { model[grp][t].mu.push(0); model[grp][t].sd.push(9); continue; } // feature never seen here (e.g. level in isolated words)
        const q = p => v[Math.floor(p * (v.length - 1))];
        model[grp][t].mu.push(+q(0.5).toFixed(3));
        model[grp][t].sd.push(+Math.max(FLOOR[i], (q(0.75) - q(0.25)) / 1.35).toFixed(3));
      }
    }
  }
  return model;
}

function train(subset) {
  let model = SEED;
  for (let round = 0; round < 3; round++) model = fit(extract(model, subset)); // re-align with each improved model
  return model;
}

/* Full pipeline check. rot > 0 replaces every expected tone with a wrong one. */
function evaluate(model, subset, rot, cal = null) {
  ctx.TONE_MODEL = model;
  let ok = 0, tot = 0;
  for (const { it, f } of subset) {
    const p = ctx.parsePinyin(it.py);
    if (rot) p.syls.forEach(s => {
      if (!s.expect) return;
      const t = s.sandhi ? 3 : s.tone;
      s.expect = s.sandhi ? [[1, 4][rot % 2]] : [((t - 1 + rot) % 4) + 1];
    });
    const r = ctx.analyzeUtterance(decode(f), SR, p, cal);
    if (r.error || !r.total) continue;
    ok += r.correct; tot += r.total;
  }
  return (100 * ok) / tot;
}

const trainSet = items.filter(x => x.split === 0);
const held = train(trainSet);
for (const [name, test] of [["words on their own", items.filter(x => x.split === 1 && x.lesson && ctx.parsePinyin(x.it.py).syls.length === 1)],
                            ["phrases & sentences", items.filter(x => x.split === 1 && x.lesson && ctx.parsePinyin(x.it.py).syls.length > 1)]]) {
  for (const cal of [null, CAL]) {
    const good = evaluate(held, test, 0, cal), bad = [1, 2, 3].map(r => evaluate(held, test, r, cal));
    console.log(`Held-out ${name}${cal ? " (calibrated)" : ""}: correct tones pass ${good.toFixed(1)}%, wrong tones pass ${(bad.reduce((a, b) => a + b) / 3).toFixed(1)}%`);
  }
}

const model = train(items);
fs.writeFileSync(path.join(root, "tone-model.js"),
  `/* Generated by tools/train_tones.js from the native lesson audio — per-tone feature means (mu) and spreads (sd).\n   Features: ${ctx.FEATS.join(", ")}. */\nvar TONE_MODEL = ${JSON.stringify(model)};\n`);
console.log("Saved tone-model.js");
