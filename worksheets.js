/* Printable A4 worksheets: 汉字 in practice boxes with pinyin, English and a picture. Tap a word to hear it. */
const WORKSHEETS = [
  {
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

function wsRender() {
  const i = +(settings.ws || 0), W = WORKSHEETS[i] || WORKSHEETS[0];
  $("#wsSheet").innerHTML = `
    <header class="ws-head">
      <div><h1>${W.title}</h1><span class="ws-hz">${W.zh} ${W.py}</span></div>
      <div class="ws-meta">Name: <span></span><br>Date: <span></span></div>
    </header>
    ${W.sections.map(([t, hz, words]) => `
      <h2 class="ws-h2">${t} <b>${hz}</b></h2>
      <div class="ws-grid" style="--cols:${words.length}">
        ${words.map(([pic, zh, py, en]) => `
          <div class="ws-card" data-zh="${zh}" title="Tap to hear">
            <div class="ws-pic">${pic}</div>
            <div class="ws-chars">${[...zh].map(c => `<div class="ws-box"><span>${c}</span></div>`).join("")}</div>
            <div class="ws-py">${py}</div>
            <div class="ws-en">${en}</div>
          </div>`).join("")}
      </div>`).join("")}
    ${W.tip ? `<div class="ws-tip"><div class="ws-big">${W.tip[0]}</div><div>${W.tip[1]}</div></div>` : ""}
    <footer class="ws-foot">拼音 Tone Trainer · ${W.footer}</footer>`;
  $("#wsSheet").querySelectorAll(".ws-card").forEach(c => (c.onclick = () => { unlockAudio(); speak(c.dataset.zh); }));
  wsFit();
}

/* Scale the fixed-size A4 sheet down to fit narrow screens. */
function wsFit() {
  const wrap = $("#wsWrap"), sheet = $("#wsSheet");
  if (!wrap.offsetWidth) return;
  const s = Math.min(1, wrap.offsetWidth / sheet.offsetWidth);
  sheet.style.transform = `scale(${s})`;
  wrap.style.height = sheet.offsetHeight * s + "px";
}

function wsInit() {
  const pick = $("#wsPick");
  pick.innerHTML = WORKSHEETS.map((w, i) => `<option value="${i}">${w.title} ${w.zh}</option>`).join("");
  pick.value = settings.ws || 0;
  pick.onchange = () => { settings.ws = pick.value; save(); wsRender(); };
  $("#wsPrint").onclick = () => {
    document.body.classList.add("print-ws");
    window.print();
    document.body.classList.remove("print-ws");
  };
  window.addEventListener("resize", wsFit);
  wsRender();
}
