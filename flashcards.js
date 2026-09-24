/* Flashcards with simple spaced repetition (Leitner boxes). Uses practiceCard() from app.js for the card itself. */
const FC_INTERVALS = [0, 1, 2, 4, 7, 14, 30]; // days until next review, per box
const FC_NEW_PER_SESSION = 10;
let fcSession = [], fcDone = 0;

const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return dayStr(x); };

/* All phrases + dialogue lines from lessons up to the furthest day reached, without duplicates. */
function fcDeck() {
  const upto = Math.max(state.maxDay || 0, todayIndex()), seen = new Set(), deck = [];
  LESSONS.slice(0, upto + 1).forEach(L => [...L.phrases, ...L.dialog.lines].forEach(it => {
    if (!seen.has(it.zh)) { seen.add(it.zh); deck.push(it); }
  }));
  return deck;
}

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function fcStart(extra) {
  state.cards = state.cards || {};
  const today = dayStr(), deck = fcDeck();
  const due = deck.filter(c => state.cards[c.zh] && state.cards[c.zh].due <= today);
  const fresh = deck.filter(c => !state.cards[c.zh]).slice(0, FC_NEW_PER_SESSION);
  fcSession = extra ? shuffle(deck.filter(c => !due.includes(c))).slice(0, 10) : [...shuffle(due), ...fresh];
  fcDone = 0;
  fcShow();
}

function fcStats() {
  const today = dayStr(), deck = fcDeck(), cards = state.cards || {};
  const learned = deck.filter(c => cards[c.zh] && cards[c.zh].box >= 3).length;
  return `${fcSession.length} left in this session · ${learned} of ${deck.length} learned`;
}

function fcShow() {
  const box = $("#fcCard");
  $("#fcCount").textContent = fcStats();
  box.innerHTML = "";
  if (!fcSession.length) {
    box.innerHTML = `<div class="card fc-done"><div class="py">🎉 All done for today</div>
      <p class="en">${fcDone} cards reviewed. Come back tomorrow — or practise a few more now.</p>
      <div class="actions"><button class="primary" id="fcMore">Practise 10 more</button></div></div>`;
    $("#fcMore").onclick = () => fcStart(true);
    return;
  }
  const item = fcSession[0], dir = settings.fcDir || "en";
  const card = practiceCard(item, {});
  card.el.classList.add("fc", dir === "en" ? "hide-py" : "hide-en");
  card.el.insertAdjacentHTML("afterbegin",
    `<p class="note fc-prompt">${dir === "en" ? "Say it in Chinese from memory — record your answer, then flip to check." : "What does it mean? Read it aloud (you can record it), then flip."}</p>`);
  const flip = document.createElement("div");
  flip.className = "actions fc-controls";
  flip.innerHTML = `<button class="fc-rec">🎙 Record my answer</button><span class="fc-status note"></span>
    <button class="primary fc-flip">Show answer</button>`;
  card.el.appendChild(flip);
  let answer = null, rec = null;
  const recBtn = $(".fc-rec", flip), status = $(".fc-status", flip);
  recBtn.onclick = async () => {
    if (rec) return rec.stop();
    stopSpeech();
    try { await Mic.init(); } catch (e) { status.textContent = e.message || "Microphone permission was denied."; return; }
    rec = Mic.record({ maxMs: 3000 + card.parsed.syls.length * 700 });
    recBtn.classList.add("on");
    recBtn.textContent = "⏹ Stop";
    status.textContent = "Listening…";
    const r = await rec.done;
    Mic.releaseOnMobile();
    rec = null;
    recBtn.classList.remove("on");
    answer = r.heard ? r : null;
    recBtn.textContent = answer ? "🎙 Record again" : "🎙 Record my answer";
    status.textContent = answer ? "✓ Answer recorded — flip to check it" : "Didn't hear anything — try again.";
  };
  $(".fc-flip", flip).onclick = async () => {
    if (rec) { const r = rec; r.stop(); await r.done; } // the record handler stores the answer first
    card.el.classList.remove("hide-py", "hide-en");
    $(".fc-prompt", card.el).textContent = answer ? "Here's how you did — compare, then rate yourself:" : "Listen, repeat, then rate yourself:";
    if (answer) {
      renderResult($(".result", card.el), card.parsed, analyzeUtterance(answer.samples, answer.sr, card.parsed, state.cal));
      $(".play", card.el).insertAdjacentHTML("afterend", `<button class="fc-mine">▶ My answer</button>`);
      $(".fc-mine", card.el).onclick = () => playRecording(answer);
    }
    speak(item.zh);
    flip.innerHTML = `<button class="fc-rate" data-r="again">😕 Again</button>
      <button class="fc-rate" data-r="good">🙂 Good</button><button class="fc-rate" data-r="easy">😎 Easy</button>`;
    flip.querySelectorAll(".fc-rate").forEach(b => (b.onclick = () => fcRate(item, b.dataset.r)));
  };
  box.appendChild(card.el);
}

/* Plays back a raw recording so you can compare it with the native audio. */
async function playRecording({ samples, sr }) {
  stopSpeech();
  if (!Mic.ctx) Mic.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (Mic.ctx.state === "suspended") await Mic.ctx.resume();
  const buf = Mic.ctx.createBuffer(1, samples.length, sr);
  buf.copyToChannel(samples, 0);
  const src = Mic.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(Mic.ctx.destination);
  src.start();
}

function fcRate(item, r) {
  const today = dayStr(), s = state.cards[item.zh] || { box: 0 };
  s.box = r === "again" ? 0 : Math.min(FC_INTERVALS.length - 1, s.box + (r === "easy" ? 2 : 1));
  s.due = addDays(today, FC_INTERVALS[s.box]);
  state.cards[item.zh] = s;
  fcSession.shift();
  if (r === "again") fcSession.splice(Math.min(3, fcSession.length), 0, item);
  else fcDone++;
  save();
  bumpStreak();
  fcShow();
}

function fcInit() {
  settings.fcDir = settings.fcDir || "en";
  document.querySelectorAll("#fcDir button").forEach(b => {
    b.classList.toggle("sel", b.dataset.dir === settings.fcDir);
    b.onclick = () => {
      settings.fcDir = b.dataset.dir;
      save();
      document.querySelectorAll("#fcDir button").forEach(x => x.classList.toggle("sel", x === b));
      fcShow();
    };
  });
  fcStart();
}
