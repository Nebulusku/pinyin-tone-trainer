/* Daily lessons. Pinyin: words separated by spaces, syllables inside a word by an apostrophe.
   Hanzi must have exactly one character per syllable (punctuation ignored) — used for speech. */
const LESSONS = [
  {
    title: "Hello & goodbye",
    phrases: [
      { zh: "你好", py: "nǐ hǎo", en: "Hello" },
      { zh: "您好", py: "nín hǎo", en: "Hello (polite)" },
      { zh: "早上好", py: "zǎo'shang hǎo", en: "Good morning" },
      { zh: "晚上好", py: "wǎn'shang hǎo", en: "Good evening" },
      { zh: "谢谢", py: "xiè'xie", en: "Thank you" },
      { zh: "不客气", py: "bú kè'qi", en: "You're welcome" },
      { zh: "再见", py: "zài'jiàn", en: "Goodbye" },
      { zh: "明天见", py: "míng'tiān jiàn", en: "See you tomorrow" },
    ],
    dialog: {
      scene: "Two neighbours meet in the morning",
      lines: [
        { who: "A", zh: "早上好！", py: "zǎo'shang hǎo!", en: "Good morning!" },
        { who: "B", zh: "早上好！你好吗？", py: "zǎo'shang hǎo! nǐ hǎo ma?", en: "Good morning! How are you?" },
        { who: "A", zh: "我很好，谢谢。你呢？", py: "wǒ hěn hǎo, xiè'xie. nǐ ne?", en: "I'm very well, thanks. And you?" },
        { who: "B", zh: "我也很好。", py: "wǒ yě hěn hǎo.", en: "I'm well too." },
        { who: "A", zh: "再见！", py: "zài'jiàn!", en: "Goodbye!" },
        { who: "B", zh: "明天见！", py: "míng'tiān jiàn!", en: "See you tomorrow!" },
      ],
    },
  },
  {
    title: "What's your name?",
    phrases: [
      { zh: "你叫什么名字？", py: "nǐ jiào shén'me míng'zi?", en: "What's your name?" },
      { zh: "我叫马克。", py: "wǒ jiào Mǎ'kè.", en: "My name is Mark." },
      { zh: "您贵姓？", py: "nín guì'xìng?", en: "What's your family name? (polite)" },
      { zh: "我姓王。", py: "wǒ xìng Wáng.", en: "My family name is Wang." },
      { zh: "很高兴认识你。", py: "hěn gāo'xìng rèn'shi nǐ.", en: "Nice to meet you." },
      { zh: "我也是。", py: "wǒ yě shì.", en: "Me too." },
    ],
    dialog: {
      scene: "Meeting someone at a party",
      lines: [
        { who: "A", zh: "你好！我叫王丽。", py: "nǐ hǎo! wǒ jiào Wáng Lì.", en: "Hello! My name is Wang Li." },
        { who: "B", zh: "你好！我叫马克。", py: "nǐ hǎo! wǒ jiào Mǎ'kè.", en: "Hello! My name is Mark." },
        { who: "A", zh: "很高兴认识你。", py: "hěn gāo'xìng rèn'shi nǐ.", en: "Nice to meet you." },
        { who: "B", zh: "我也很高兴认识你。", py: "wǒ yě hěn gāo'xìng rèn'shi nǐ.", en: "Nice to meet you too." },
        { who: "A", zh: "你姓什么？", py: "nǐ xìng shén'me?", en: "What's your family name?" },
        { who: "B", zh: "我姓米勒。", py: "wǒ xìng Mǐ'lè.", en: "My family name is Miller." },
      ],
    },
  },
  {
    title: "Where are you from?",
    phrases: [
      { zh: "你是哪国人？", py: "nǐ shì nǎ guó rén?", en: "Which country are you from?" },
      { zh: "我是瑞士人。", py: "wǒ shì Ruì'shì rén.", en: "I'm Swiss." },
      { zh: "我住在瑞士。", py: "wǒ zhù zài Ruì'shì.", en: "I live in Switzerland." },
      { zh: "我爱人是中国人。", py: "wǒ ài'ren shì Zhōng'guó rén.", en: "My spouse is Chinese." },
      { zh: "你会说中文吗？", py: "nǐ huì shuō Zhōng'wén ma?", en: "Can you speak Chinese?" },
      { zh: "我会说一点。", py: "wǒ huì shuō yì'diǎn.", en: "I can speak a little." },
    ],
    dialog: {
      scene: "Chatting on the train",
      lines: [
        { who: "A", zh: "你是哪国人？", py: "nǐ shì nǎ guó rén?", en: "Which country are you from?" },
        { who: "B", zh: "我是瑞士人。你呢？", py: "wǒ shì Ruì'shì rén. nǐ ne?", en: "I'm Swiss. And you?" },
        { who: "A", zh: "我是中国人。你会说中文吗？", py: "wǒ shì Zhōng'guó rén. nǐ huì shuō Zhōng'wén ma?", en: "I'm Chinese. Can you speak Chinese?" },
        { who: "B", zh: "我会说一点。我爱人是中国人。", py: "wǒ huì shuō yì'diǎn. wǒ ài'ren shì Zhōng'guó rén.", en: "A little. My spouse is Chinese." },
        { who: "A", zh: "真的吗？太好了！", py: "zhēn'de ma? tài hǎo le!", en: "Really? That's great!" },
      ],
    },
  },
  {
    title: "Visiting family",
    phrases: [
      { zh: "欢迎！", py: "huān'yíng!", en: "Welcome!" },
      { zh: "请进。", py: "qǐng jìn.", en: "Please come in." },
      { zh: "请坐。", py: "qǐng zuò.", en: "Please sit down." },
      { zh: "请喝茶。", py: "qǐng hē chá.", en: "Please have some tea." },
      { zh: "这是我爱人。", py: "zhè shì wǒ ài'ren.", en: "This is my spouse." },
      { zh: "我们结婚二十五年了。", py: "wǒ'men jié'hūn èr'shí'wǔ nián le.", en: "We've been married for 25 years." },
    ],
    dialog: {
      scene: "Arriving at the family's home",
      lines: [
        { who: "A", zh: "欢迎欢迎！请进！", py: "huān'yíng huān'yíng! qǐng jìn!", en: "Welcome, welcome! Come in!" },
        { who: "B", zh: "谢谢！这是给您的。", py: "xiè'xie! zhè shì gěi nín de.", en: "Thank you! This is for you." },
        { who: "A", zh: "你太客气了！请坐。", py: "nǐ tài kè'qi le! qǐng zuò.", en: "That's too kind of you! Please sit down." },
        { who: "B", zh: "谢谢。", py: "xiè'xie.", en: "Thank you." },
        { who: "A", zh: "请喝茶。", py: "qǐng hē chá.", en: "Please have some tea." },
        { who: "B", zh: "好的，谢谢！", py: "hǎo de, xiè'xie!", en: "OK, thank you!" },
      ],
    },
  },
  {
    title: "Small talk",
    phrases: [
      { zh: "好久不见！", py: "hǎo'jiǔ bú jiàn!", en: "Long time no see!" },
      { zh: "最近怎么样？", py: "zuì'jìn zěn'me'yàng?", en: "How have you been lately?" },
      { zh: "还不错。", py: "hái bú'cuò.", en: "Not bad." },
      { zh: "你忙吗？", py: "nǐ máng ma?", en: "Are you busy?" },
      { zh: "有点忙。", py: "yǒu'diǎn máng.", en: "A bit busy." },
      { zh: "你吃饭了吗？", py: "nǐ chī fàn le ma?", en: "Have you eaten? (a common greeting)" },
    ],
    dialog: {
      scene: "Bumping into an old friend",
      lines: [
        { who: "A", zh: "好久不见！", py: "hǎo'jiǔ bú jiàn!", en: "Long time no see!" },
        { who: "B", zh: "好久不见！最近怎么样？", py: "hǎo'jiǔ bú jiàn! zuì'jìn zěn'me'yàng?", en: "Long time no see! How have you been?" },
        { who: "A", zh: "还不错。你呢？", py: "hái bú'cuò. nǐ ne?", en: "Not bad. And you?" },
        { who: "B", zh: "有点忙，但是很好。", py: "yǒu'diǎn máng, dàn'shì hěn hǎo.", en: "A bit busy, but good." },
        { who: "A", zh: "你吃饭了吗？", py: "nǐ chī fàn le ma?", en: "Have you eaten?" },
        { who: "B", zh: "还没有。", py: "hái méi'yǒu.", en: "Not yet." },
        { who: "A", zh: "那我们一起去吃饭吧！", py: "nà wǒ'men yì'qǐ qù chī fàn ba!", en: "Then let's go and eat together!" },
      ],
    },
  },
  {
    title: "Saying goodbye",
    phrases: [
      { zh: "我该走了。", py: "wǒ gāi zǒu le.", en: "I should go." },
      { zh: "谢谢你的招待。", py: "xiè'xie nǐ de zhāo'dài.", en: "Thank you for your hospitality." },
      { zh: "下次见！", py: "xià cì jiàn!", en: "See you next time!" },
      { zh: "路上小心。", py: "lù'shang xiǎo'xīn.", en: "Take care on the way." },
      { zh: "慢走。", py: "màn zǒu.", en: "Take care! (said to a leaving guest)" },
      { zh: "晚安！", py: "wǎn'ān!", en: "Good night!" },
    ],
    dialog: {
      scene: "Leaving after dinner",
      lines: [
        { who: "A", zh: "时间不早了，我该走了。", py: "shí'jiān bù zǎo le, wǒ gāi zǒu le.", en: "It's getting late, I should go." },
        { who: "B", zh: "好的。谢谢你来！", py: "hǎo de. xiè'xie nǐ lái!", en: "OK. Thanks for coming!" },
        { who: "A", zh: "谢谢你的招待。下次见！", py: "xiè'xie nǐ de zhāo'dài. xià cì jiàn!", en: "Thank you for your hospitality. See you next time!" },
        { who: "B", zh: "路上小心，慢走！", py: "lù'shang xiǎo'xīn, màn zǒu!", en: "Take care on the way!" },
        { who: "A", zh: "晚安！", py: "wǎn'ān!", en: "Good night!" },
        { who: "B", zh: "晚安！再见！", py: "wǎn'ān! zài'jiàn!", en: "Good night! Goodbye!" },
      ],
    },
  },
  {
    title: "Introducing yourself",
    phrases: [
      { zh: "我来介绍一下。", py: "wǒ lái jiè'shào yí'xià.", en: "Let me introduce myself." },
      { zh: "我在学中文。", py: "wǒ zài xué Zhōng'wén.", en: "I'm learning Chinese." },
      { zh: "我刚开始学。", py: "wǒ gāng kāi'shǐ xué.", en: "I've only just started." },
      { zh: "请说慢一点。", py: "qǐng shuō màn yì'diǎn.", en: "Please speak a bit slower." },
      { zh: "哪里哪里！", py: "nǎ'lǐ nǎ'lǐ!", en: "Oh, not at all! (modest reply to a compliment)" },
    ],
    dialog: {
      scene: "Meeting a friend of your spouse",
      lines: [
        { who: "A", zh: "请你介绍一下你自己。", py: "qǐng nǐ jiè'shào yí'xià nǐ zì'jǐ.", en: "Please introduce yourself." },
        { who: "B", zh: "好的。我叫马克，我是瑞士人。", py: "hǎo de. wǒ jiào Mǎ'kè, wǒ shì Ruì'shì rén.", en: "Sure. My name is Mark, I'm Swiss." },
        { who: "A", zh: "你在学中文吗？", py: "nǐ zài xué Zhōng'wén ma?", en: "Are you learning Chinese?" },
        { who: "B", zh: "对，我刚开始学。", py: "duì, wǒ gāng kāi'shǐ xué.", en: "Yes, I've only just started." },
        { who: "A", zh: "你说得很好！", py: "nǐ shuō de hěn hǎo!", en: "You speak very well!" },
        { who: "B", zh: "哪里哪里，谢谢！", py: "nǎ'lǐ nǎ'lǐ, xiè'xie!", en: "Oh, not at all — thank you!" },
      ],
    },
  },
];
