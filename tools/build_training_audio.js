/* Renders extra native audio for training the tone model (not published; cached in tools/.train-audio/).
   - every character of the lessons spoken on its own ("iso"), at three speaking rates
   - every lesson word / phrase / dialogue line at a slower and a faster rate ("phrase")
   Run from the app folder:  node tools/build_training_audio.js   (then node tools/train_tones.js) */
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, ".train-audio");
fs.mkdirSync(out, { recursive: true });
const ctx = { console, navigator: {} };
vm.createContext(ctx);
vm.runInContext(["lessons.js", "lessons-hsk1.js", "tone-engine.js"].map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\nthis.LESSONS = LESSONS;", ctx);

const jobs = [];
const seenChar = new Set();
ctx.LESSONS.forEach((L, li) => [...(L.words || []), ...L.phrases, ...L.dialog.lines].forEach(it => {
  for (const rate of [150, 215]) jobs.push({ kind: "phrase", zh: it.zh, py: it.py, rate, split: li % 2 });
  const p = ctx.parsePinyin(it.py), chars = ctx.syllableChars(it.zh, p);
  if (!chars) return;
  p.syls.forEach((s, k) => {
    // skip neutral tones and characters whose reading changes with context (一 不 and tone-sandhi syllables)
    if (s.tone === 5 || s.sandhi || /[一不儿]/.test(chars[k])) return;
    const key = chars[k] + s.tone;
    if (seenChar.has(key)) return;
    seenChar.add(key);
    const split = parseInt(crypto.createHash("md5").update(chars[k]).digest("hex").slice(0, 2), 16) % 2;
    for (const rate of [140, 180, 220]) jobs.push({ kind: "iso", zh: chars[k], py: s.text.toLowerCase(), rate, split });
  });
}));

const tmp = path.join(out, "_tmp.aiff"), index = [];
let made = 0;
for (const j of jobs) {
  const file = crypto.createHash("sha1").update(`${j.kind}|${j.rate}|${j.zh}`).digest("hex").slice(0, 12) + ".wav";
  const dest = path.join(out, file);
  if (!fs.existsSync(dest)) {
    execFileSync("say", ["-v", "Tingting", "-r", String(j.rate), "-o", tmp, j.zh]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", "16000", dest]);
    made++;
  }
  index.push({ file, kind: j.kind, zh: j.zh, py: j.py, rate: j.rate, split: j.split });
}
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index));
console.log(`${index.length} training clips (${made} new): ${index.filter(x => x.kind === "iso").length} isolated characters, ${index.filter(x => x.kind === "phrase").length} phrases`);
