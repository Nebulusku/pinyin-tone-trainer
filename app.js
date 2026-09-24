/* UI: daily lesson, speech playback, recording and result drawing. */
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STORE = "pinyin-tone-trainer-v1";

let state = {};
try { state = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };
const dayStr = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
state.best = state.best || {};
state.startDate = state.startDate || dayStr();
state.settings = Object.assign({ rate: 0.8, showZh: false, voice: "", role: "B" }, state.settings);
const settings = state.settings;
save();

const todayIndex = () => Math.floor((new Date(dayStr()) - new Date(state.startDate)) / 864e5) % LESSONS.length;
let day = todayIndex();

/* ---------- Speech ---------- */
let zhVoices = [];
function refreshVoices() {
  zhVoices = speechSynthesis.getVoices().filter(v => /^zh/i.test(v.lang) && !/HK|TW|yue|Hant/i.test(v.lang));
  const pref = v => (/Tingting|婷婷/.test(v.name) ? 0 : /普通话|Mandarin/i.test(v.name) ? 1 : 2);
  zhVoices.sort((a, b) => pref(a) - pref(b));
  const sel = $("#voice");
  sel.innerHTML = zhVoices.length ? zhVoices.map(v => `<option>${v.name}</option>`).join("") : "<option>(no Chinese voice found)</option>";
  if (zhVoices.some(v => v.name === settings.voice)) sel.value = settings.voice;
}
const voiceFor = who => {
  const main = zhVoices.find(v => v.name === settings.voice) || zhVoices[0];
  if (who !== "B") return { voice: main, pitch: 1 };
  const other = zhVoices.find(v => v !== main);
  return other ? { voice: other, pitch: 1 } : { voice: main, pitch: 0.75 };
};
/* Pre-rendered clips (audio/manifest.js) are used when available; browser speech is the fallback. */
const CLIP_VOICE = { A: "Tingting", B: "Eddy" };
const player = new Audio();
player.preservesPitch = player.webkitPreservesPitch = true;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
/* iOS only lets audio play after a tap: start a silent clip synchronously inside the tap handler. */
const unlockAudio = () => { player.src = SILENCE; player.play().catch(() => {}); };
function stopSpeech() {
  player.pause();
  if (player.onended) player.onended();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function speak(text, { who, rate = settings.rate } = {}) {
  const file = window.AUDIO_FILES && AUDIO_FILES[`${CLIP_VOICE[who === "B" ? "B" : "A"]}|${text}`];
  if (file) {
    stopSpeech();
    return new Promise(res => {
      const fin = () => { player.onended = player.onerror = null; res(); };
      player.onended = player.onerror = fin;
      player.src = "audio/" + file;
      player.defaultPlaybackRate = player.playbackRate = rate;
      player.play().catch(fin);
    });
  }
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise(res => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text), v = voiceFor(who);
    u.lang = "zh-CN";
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch;
    u.rate = rate;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = u.onerror = fin;
    setTimeout(fin, 2000 + (text.length * 700) / rate);
    setTimeout(() => speechSynthesis.speak(u), 60);
  });
}
function beep() {
  const ctx = Mic.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.16);
  return sleep(250);
}

/* ---------- Practice card ---------- */
let activeRec = null;

function practiceCard(item, { id, who, isMe } = {}) {
  const parsed = parsePinyin(item.py);
  const chars = [...item.zh.replace(/[\p{P}\s]/gu, "")];
  if (chars.length !== parsed.syls.length) console.warn("Hanzi/pinyin mismatch:", item.zh, item.py);
  const el = document.createElement("div");
  el.className = "card";
  const pyHtml = parsed.words.map((w, wi) =>
    `<span class="p">${w.pre}</span><span class="w" data-w="${wi}">` +
    w.syls.map(s => `<span class="s t${s.tone}${s.sandhi ? " sandhi" : ""}"${s.sandhi ? ' title="3rd tone before another 3rd tone: say it as 2nd"' : ""}>${s.text}</span>`).join("") +
    `</span><span class="p">${w.post}</span>`).join(" ");
  el.innerHTML =
    (who ? `<span class="who${isMe ? " me" : ""}">${who === "A" ? "Person 1" : "Person 2"}${isMe ? " · you" : ""}</span>` : "") +
    `<div class="py">${pyHtml}</div><div class="zh">${item.zh}</div><div class="en">${item.en}</div>
     <div class="actions">
       <button class="play">🔊 Listen</button><button class="slow">🐢 Slow</button>
       <button class="rec">🎙 Record</button><span class="level"><i></i></span>
       <span class="best"></span>
     </div><div class="result"></div>`;
  const showBest = () => { const b = state.best[id]; $(".best", el).textContent = b != null ? `Best: ${b}%` : ""; };
  showBest();
  $(".play", el).onclick = () => speak(item.zh, { who });
  $(".slow", el).onclick = () => speak(item.zh, { who, rate: 0.5 });
  el.querySelectorAll(".w").forEach(wEl => {
    wEl.onclick = () => {
      const syls = parsed.words[+wEl.dataset.w].syls;
      if (!syls.length) return;
      const text = chars.length === parsed.syls.length ? chars.slice(syls[0].idx, syls[syls.length - 1].idx + 1).join("") : item.zh;
      speak(text, { who, rate: Math.min(settings.rate, 0.7) });
    };
  });
  const card = { el, item, parsed, id, record: () => recordCard(card), showBest };
  $(".rec", el).onclick = () => (activeRec && activeRec.card === card ? activeRec.stop() : card.record());
  return card;
}

async function recordCard(card, { onResult } = {}) {
  if (activeRec) activeRec.stop();
  stopSpeech();
  const box = $(".result", card.el), btn = $(".rec", card.el), lvl = $(".level i", card.el);
  try { await Mic.init(); } catch (e) { box.innerHTML = `<p class="err">${e.message || "Microphone permission was denied."}</p>`; return null; }
  const rec = Mic.record({ maxMs: 3000 + card.parsed.syls.length * 700, onLevel: v => (lvl.style.width = v * 100 + "%") });
  activeRec = { card, stop: rec.stop };
  btn.classList.add("on");
  btn.textContent = "⏹ Stop";
  card.el.classList.add("recording");
  box.innerHTML = `<p class="note">Listening… speak now (stops automatically when you finish).</p>`;
  const { samples, sr, heard } = await rec.done;
  Mic.releaseOnMobile();
  activeRec = null;
  btn.classList.remove("on");
  btn.textContent = "🎙 Record";
  card.el.classList.remove("recording");
  const res = heard ? analyzeUtterance(samples, sr, card.parsed, state.cal) : { error: "I didn't hear anything. Check the microphone and try again." };
  renderResult(box, card.parsed, res);
  if (!res.error && res.score != null && card.id) {
    state.best[card.id] = Math.max(state.best[card.id] || 0, res.score);
    card.showBest();
  }
  if (!res.error) bumpStreak();
  if (onResult) onResult(res);
  return res;
}

/* ---------- Results ---------- */
const TIPS = {
  1: "keep it high and flat, like holding one sung note",
  2: "rise from middle to high, like asking “huh?”",
  3: "drop your voice low (it only rises again at the end of a phrase)",
  4: "start high and drop sharply, like a firm “No!”",
};
const HEARD = { 1: "high & flat", 2: "rising", 3: "low / dipping", 4: "falling" };
const ORD = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

function renderResult(box, parsed, res) {
  if (res.error) { box.innerHTML = `<p class="err">${res.error}</p>`; return; }
  const cls = res.score >= 75 ? "good" : res.score < 50 ? "bad" : "";
  const wrong = res.results.filter(r => r.ok === false).slice(0, 4).map(r => {
    const target = r.syl.sandhi ? "2nd (tone change)" : ORD[r.syl.tone];
    const heard = r.heard ? `sounded ${HEARD[r.got]}` : "not heard clearly";
    const tip = TIPS[r.syl.sandhi ? 2 : r.syl.tone];
    return `<li><b class="s t${r.syl.tone}">${r.syl.text}</b> — should be ${target}; ${heard}. Tip: ${tip}.</li>`;
  }).join("");
  box.innerHTML = `<canvas></canvas><div class="score ${cls}">${res.correct} / ${res.total} tones correct (${res.score}%)${res.score === 100 ? " 🎉" : ""}</div>` +
    (wrong ? `<ul class="fb">${wrong}</ul>` : "");
  drawContours($("canvas", box), res);
}

function drawContours(cv, res) {
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 150;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const n = res.results.length, top = 22, bottom = H - 24, cw = W / n;
  const y = z => top + ((1.6 - Math.max(-1.6, Math.min(1.6, z))) / 3.2) * (bottom - top);
  g.strokeStyle = col("--line"); g.lineWidth = 1;
  [1, 0, -1].forEach(z => { g.beginPath(); g.moveTo(0, y(z)); g.lineTo(W, y(z)); g.stroke(); });
  g.textAlign = "center";
  res.results.forEach((r, k) => {
    const x0 = k * cw + cw * 0.12, x1 = (k + 1) * cw - cw * 0.12, X = t => x0 + t * (x1 - x0);
    const s = r.syl, tc = col(`--t${s.tone}`);
    const key = s.tone === 5 ? null : s.sandhi ? 2 : s.tone === 3 ? (k === n - 1 ? 3 : "3h") : s.tone;
    if (key != null) {
      const t = TEMPLATES[key];
      g.setLineDash([5, 4]); g.strokeStyle = tc; g.globalAlpha = 0.55; g.lineWidth = 3;
      g.beginPath(); t.forEach((z, i) => (i ? g.lineTo : g.moveTo).call(g, X(i / 4), y(z))); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    if (r.pts.length) {
      g.strokeStyle = col("--ink"); g.lineWidth = 2.5; g.beginPath();
      r.pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, X(p.x), y(p.z))); g.stroke();
    }
    g.font = "600 14px -apple-system, sans-serif";
    g.fillStyle = r.ok === true ? col("--good") : r.ok === false ? col("--bad") : col("--t5");
    g.fillText(r.ok === true ? "✓" : r.ok === false ? "✗" : "·", (x0 + x1) / 2, 14);
    g.fillStyle = tc;
    g.fillText(s.text, (x0 + x1) / 2, H - 6);
  });
}

function bumpStreak() {
  const today = dayStr(), yest = dayStr(new Date(Date.now() - 864e5));
  if (state.lastPractice !== today) {
    state.streak = state.lastPractice === yest ? (state.streak || 0) + 1 : 1;
    state.lastPractice = today;
    save();
    showStreak();
  } else save();
}
const showStreak = () => ($("#streak").textContent = state.streak && state.lastPractice >= dayStr(new Date(Date.now() - 864e5)) ? `🔥 ${state.streak}-day streak` : "");

/* ---------- Lesson rendering ---------- */
let lineCards = [];

function renderDay() {
  stopDialog();
  if (day > (state.maxDay || 0)) { state.maxDay = day; save(); }
  const L = LESSONS[day];
  $("#dayLabel").textContent = `Day ${day + 1} of ${LESSONS.length}${day === todayIndex() ? " · today" : ""}`;
  $("#dayTitle").textContent = L.title;
  const ph = $("#phrases");
  ph.innerHTML = "";
  L.phrases.forEach((p, i) => ph.appendChild(practiceCard(p, { id: `d${day}-p${i}` }).el));
  $("#scene").textContent = `Scene: ${L.dialog.scene}`;
  renderLines();
}

function renderLines() {
  const L = LESSONS[day], box = $("#lines");
  box.innerHTML = "";
  lineCards = L.dialog.lines.map((ln, i) => {
    const c = practiceCard(ln, { id: `d${day}-l${i}`, who: ln.who, isMe: ln.who === settings.role });
    box.appendChild(c.el);
    return c;
  });
  document.querySelectorAll("#roleSeg button").forEach(b => b.classList.toggle("sel", b.dataset.role === settings.role));
  $("#runDialog").textContent = settings.role === "listen" ? "▶ Play dialogue" : "▶ Start dialogue";
}

/* ---------- Dialogue runner ---------- */
let dialogRun = null;

function stopDialog() {
  if (!dialogRun) return;
  dialogRun.abort = true;
  stopSpeech();
  if (activeRec) activeRec.stop();
}

async function runDialog() {
  if (dialogRun) return stopDialog();
  unlockAudio();
  const run = (dialogRun = { abort: false }), btn = $("#runDialog"), role = settings.role;
  if (role !== "listen") {
    try { await Mic.init(); } catch (e) { alert(e.message || "Microphone permission was denied."); dialogRun = null; return; }
  }
  btn.textContent = "⏹ Stop";
  const lines = LESSONS[day].dialog.lines;
  for (let i = 0; i < lines.length && !run.abort; i++) {
    const c = lineCards[i];
    lineCards.forEach(x => x.el.classList.toggle("active", x === c));
    c.el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (role === "listen" || lines[i].who !== role) {
      await speak(lines[i].zh, { who: lines[i].who });
      await sleep(400);
    } else {
      await sleep(300);
      if (run.abort) break;
      await beep();
      await recordCard(c);
      await sleep(900);
    }
  }
  lineCards.forEach(x => x.el.classList.remove("active"));
  dialogRun = null;
  btn.textContent = role === "listen" ? "▶ Play dialogue" : "▶ Start dialogue";
}

/* ---------- Calibration ---------- */
function setupCalibration() {
  const item = { zh: "妈麻马骂", py: "mā má mǎ mà", en: "mother · hemp · horse · to scold — say each one slowly, with a pause" };
  const card = practiceCard(item, {});
  $("#calSlot").appendChild(card.el);
  const status = () => ($("#calStatus").textContent = state.cal
    ? `Calibrated ✓ — your speaking range is about ${Math.round(state.cal.loHz)}–${Math.round(state.cal.hiHz)} Hz. Record again any time to redo it.`
    : "Not calibrated yet — results use each recording's own pitch range.");
  status();
  $(".rec", card.el).onclick = async () => {
    if (activeRec) return activeRec.stop();
    const box = $(".result", card.el);
    try { await Mic.init(); } catch (e) { box.innerHTML = `<p class="err">${e.message}</p>`; return; }
    const lvl = $(".level i", card.el), btn = $(".rec", card.el);
    const rec = Mic.record({ maxMs: 9000, silenceMs: 1600, onLevel: v => (lvl.style.width = v * 100 + "%") });
    activeRec = { card, stop: rec.stop };
    btn.classList.add("on"); btn.textContent = "⏹ Stop"; card.el.classList.add("recording");
    box.innerHTML = `<p class="note">Listening… mā — má — mǎ — mà</p>`;
    const { samples, sr } = await rec.done;
    Mic.releaseOnMobile();
    activeRec = null;
    btn.classList.remove("on"); btn.textContent = "🎙 Record"; card.el.classList.remove("recording");
    const cal = calibrate(samples, sr);
    if (!cal) { box.innerHTML = `<p class="err">Not enough voice heard — try again a bit louder.</p>`; return; }
    state.cal = cal;
    save();
    status();
    renderResult(box, card.parsed, analyzeUtterance(samples, sr, card.parsed, cal));
  };
}

/* ---------- Wiring ---------- */
$("#prevDay").onclick = () => { day = (day - 1 + LESSONS.length) % LESSONS.length; renderDay(); };
$("#nextDay").onclick = () => { day = (day + 1) % LESSONS.length; renderDay(); };
$("#rate").value = settings.rate;
$("#rate").oninput = e => { settings.rate = +e.target.value; save(); };
$("#showZh").checked = settings.showZh;
document.body.classList.toggle("show-zh", settings.showZh);
$("#showZh").onchange = e => { settings.showZh = e.target.checked; document.body.classList.toggle("show-zh", settings.showZh); save(); };
$("#voice").onchange = e => { settings.voice = e.target.value; save(); };
$("#calBtn").onclick = () => $("#calPanel").classList.toggle("open");
document.querySelectorAll("#roleSeg button").forEach(b => (b.onclick = () => { stopDialog(); settings.role = b.dataset.role; save(); renderLines(); }));
$("#runDialog").onclick = runDialog;
let fcStarted = false;
document.querySelectorAll(".tabs [data-tab]").forEach(b => (b.onclick = () => {
  stopDialog();
  stopSpeech();
  document.querySelectorAll(".tabs [data-tab]").forEach(x => x.classList.toggle("sel", x === b));
  $("#tab-lesson").hidden = b.dataset.tab !== "lesson";
  $("#tab-cards").hidden = b.dataset.tab !== "cards";
  if (b.dataset.tab === "cards") $("#calPanel").classList.remove("open");
  if (b.dataset.tab === "cards" && !fcStarted) { fcStarted = true; fcInit(); }
}));
if (window.AUDIO_FILES) $("#voice").parentElement.style.display = "none";
else if ("speechSynthesis" in window) { refreshVoices(); speechSynthesis.onvoiceschanged = refreshVoices; }
setupCalibration();
if (!state.cal) $("#calPanel").classList.add("open");
showStreak();
renderDay();
