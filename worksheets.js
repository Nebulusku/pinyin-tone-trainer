/* Printable A4 worksheets: 汉字 in practice boxes with pinyin, English and a picture. Tap a word to hear it. */
const WORKSHEETS = [
  {
    lesson: 0, // extra sheet shown with this lesson
    title: "Greetings", zh: "问候", py: "wèn hòu", footer: "Lesson 1 · Greetings",
    sections: [
      ["Saying hello", "打招呼", [
        ["👋", "你好", "nǐ hǎo", "hello"],
        ["🙇", "您好", "nín hǎo", "hello (polite)"],
        ["👨‍👩‍👧‍👦", "大家好", "dà jiā hǎo", "hello everyone"],
        ["👩‍🏫", "老师好", "lǎo shī hǎo", "hello, teacher"],
        ["🤗", "欢迎", "huān yíng", "welcome"],
      ]],
      ["Times of the day", "时间", [
        ["🌅", "早上好", "zǎo shang hǎo", "good morning"],
        ["🌤️", "上午好", "shàng wǔ hǎo", "good morning (late)"],
        ["☀️", "中午好", "zhōng wǔ hǎo", "good noon"],
        ["☕", "下午好", "xià wǔ hǎo", "good afternoon"],
        ["🌆", "晚上好", "wǎn shang hǎo", "good evening"],
      ]],
      ["Saying goodbye", "告别", [
        ["👋", "再见", "zài jiàn", "goodbye"],
        ["🙋", "拜拜", "bài bài", "bye-bye"],
        ["📅", "明天见", "míng tiān jiàn", "see you tomorrow"],
        ["⏳", "回头见", "huí tóu jiàn", "see you later"],
        ["😴", "晚安", "wǎn ān", "good night"],
      ]],
      ["Polite words", "礼貌用语", [
        ["👉", "请", "qǐng", "please"],
        ["🙏", "谢谢", "xiè xie", "thank you"],
        ["😊", "不客气", "bú kè qi", "you're welcome"],
        ["😔", "对不起", "duì bu qǐ", "sorry"],
        ["👌", "没关系", "méi guān xi", "it's okay"],
      ]],
      ["Small talk", "寒暄", [
        ["🤔", "你好吗", "nǐ hǎo ma", "how are you?"],
        ["👍", "我很好", "wǒ hěn hǎo", "I'm fine"],
        ["🫵", "你呢", "nǐ ne", "and you?"],
        ["🫂", "好久不见", "hǎo jiǔ bú jiàn", "long time no see"],
      ]],
    ],
    tip: ["好", `<b>hǎo = good.</b> 女 woman + 子 child = "good". Add <b>好</b> after almost anything to greet:
      你 + 好 = hello · 早上 + 好 = good morning · 老师 + 好 = hello teacher.`],
  },
];

const wsStrip = s => s.replace(/[，。？！、,.?!—…\s]/g, "");
const wsPy = py => py.replace(/'/g, "");

/* The sheet for lesson i, built from LESSONS: words (6–7 across), key phrases (2 across) and the dialogue. */
function wsLessonSheet(i) {
  const L = LESSONS[i], sections = [];
  const item = it => [WS_PICS[wsStrip(it.zh)] || "", it.zh, wsPy(it.py), it.en];
  if (L.words && L.words.length) {
    const short = L.words.every(w => wsStrip(w.zh).length <= 2); // 7 across only fits 1–2 character words
    sections.push(["Words", "生词", L.words.map(item), L.words.length > 12 && short ? 7 : 6]);
  }
  sections.push(["Key phrases", "句子", L.phrases.map(item), 2]);
  return { title: L.title, zh: lessonLabel(i), py: "", footer: `Lesson ${i + 1} · ${L.title}`, sections, dialog: L.dialog };
}
/* Sheets for the lesson chosen in the shared selector: its own sheet plus any extra sheets for it. */
const wsSheets = () => [wsLessonSheet(tabDay("sheets")), ...WORKSHEETS.filter(w => w.lesson === tabDay("sheets"))];
let wsWhich = 0, wsDay = -1;

const wsBoxes = zh => [...wsStrip(zh)].map(c => `<div class="ws-box"><span>${c}</span></div>`).join("");

function wsRender() {
  const all = wsSheets();
  if (wsDay !== tabDay("sheets") || wsWhich >= all.length) { wsWhich = 0; wsDay = tabDay("sheets"); }
  const W = all[wsWhich], seg = $("#wsWhich");
  seg.hidden = all.length < 2;
  seg.innerHTML = all.map((w, k) => `<button data-k="${k}" class="${k === wsWhich ? "sel" : ""}">${k ? w.title : "Lesson sheet"}</button>`).join("");
  seg.querySelectorAll("button").forEach(b => (b.onclick = () => { wsWhich = +b.dataset.k; wsRender(); }));
  $("#wsSheet").innerHTML = `
    <header class="ws-head">
      <div><h1>${W.title}</h1><span class="ws-hz">${W.zh} ${W.py}</span></div>
      <div class="ws-meta">Name: <span></span><br>Date: <span></span></div>
    </header>
    ${W.sections.map(([t, hz, words, cols]) => `
      <h2 class="ws-h2">${t} <b>${hz}</b></h2>
      <div class="ws-grid${cols === 2 ? " ws-phr" : cols >= 6 ? " ws-w6" : ""}" style="--cols:${cols || words.length}">
        ${words.map(([pic, zh, py, en]) => cols === 2 ? `
          <div class="ws-card" data-zh="${zh}" title="Tap to hear">
            <div class="ws-row"><div class="ws-pic">${pic}</div><div class="ws-chars">${wsBoxes(zh)}</div></div>
            <div class="ws-py">${py}</div>
            <div class="ws-en">${en}</div>
          </div>` : `
          <div class="ws-card" data-zh="${zh}" title="Tap to hear">
            <div class="ws-pic">${pic}</div>
            <div class="ws-chars">${wsBoxes(zh)}</div>
            <div class="ws-py">${py}</div>
            <div class="ws-en">${en}</div>
          </div>`).join("")}
      </div>`).join("")}
    ${W.dialog ? `
      <h2 class="ws-h2">Dialogue <b>对话</b></h2>
      <p class="ws-scene">🎬 ${W.dialog.scene}</p>
      <div class="ws-dlg">${W.dialog.lines.map(l => `
        <div class="ws-line" data-zh="${l.zh}"><span class="ws-who ws-${l.who}">${l.who}</span>
          <div><span class="ws-lzh">${l.zh}</span><span class="ws-lpy">${wsPy(l.py)}</span><span class="ws-len">${l.en}</span></div></div>`).join("")}
      </div>` : ""}
    ${W.tip ? `<div class="ws-tip"><div class="ws-big">${W.tip[0]}</div><div>${W.tip[1]}</div></div>` : ""}
    <footer class="ws-foot">拼音 Tone Trainer · ${W.footer}</footer>`;
  $("#wsSheet").querySelectorAll("[data-zh]").forEach(c => (c.onclick = () => { unlockAudio(); speak(c.dataset.zh); }));
  wsFit();
}

/* Scale the A4 sheet down to fit narrow screens. */
function wsFit() {
  const wrap = $("#wsWrap"), sheet = $("#wsSheet");
  if (!wrap.offsetWidth) return;
  const s = Math.min(1, wrap.offsetWidth / sheet.offsetWidth);
  sheet.style.transform = `scale(${s})`;
  wrap.style.height = sheet.offsetHeight * s + "px";
}

function wsInit() {
  $("#wsPrint").onclick = () => {
    document.body.classList.add("print-ws");
    window.print();
    document.body.classList.remove("print-ws");
  };
  window.addEventListener("resize", wsFit);
  wsRender();
}
