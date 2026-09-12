import { cleanVoiceText } from "@/lib/voice-text-cleaner";

export type VoiceNaturalizeOptions = {
  serviceType?: string | null;
};

const DIGIT = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 整数（可含千分位）：1,000 / 28,485 / 100000 */
const INT_NUM = String.raw`\d{1,3}(?:,\d{3})+|\d+`;
/** 小数金额：9.9 / 1,234.56 */
const DEC_NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;

/** 去掉千分位后解析数字 */
export function parseLocaleNumber(raw: string): number {
  const cleaned = String(raw).replace(/,/g, "").trim();
  return Number(cleaned);
}

/** 0–9999 → 中文 */
function sectionToChinese(n: number): string {
  if (n <= 0) return "";
  const qian = Math.floor(n / 1000);
  const bai = Math.floor((n % 1000) / 100);
  const shi = Math.floor((n % 100) / 10);
  const ge = n % 10;
  let s = "";

  if (qian) s += `${DIGIT[qian]}千`;
  if (bai) s += `${DIGIT[bai]}百`;
  else if (qian && (shi || ge)) s += "零";

  if (shi) {
    if (shi === 1 && !qian && !bai) s += "十";
    else s += `${DIGIT[shi]}十`;
  } else if ((qian || bai) && ge) {
    s += "零";
  }

  if (ge) s += DIGIT[ge];
  return s;
}

/** 非负整数 → 中文（支持到亿级） */
export function integerToChinese(num: number): string {
  if (!Number.isFinite(num) || num < 0) return String(num);
  const n = Math.floor(num);
  if (n === 0) return "零";
  if (n >= 1e12) return String(n);

  const yi = Math.floor(n / 1e8);
  const wan = Math.floor((n % 1e8) / 1e4);
  const rest = n % 1e4;

  let s = "";
  if (yi) {
    s += `${sectionToChinese(yi)}亿`;
    if (wan > 0 && wan < 1000) s += "零";
  }
  if (wan) {
    s += `${sectionToChinese(wan)}万`;
    if (rest > 0 && rest < 1000) s += "零";
  }
  if (rest) s += sectionToChinese(rest);
  return s;
}

/** 金额小数：9.9 → 九块九；39.90 → 三十九块九 */
export function moneyToChinese(amount: number): string {
  if (!Number.isFinite(amount)) return String(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const yuan = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - yuan) * 100);

  let s = integerToChinese(yuan) || "零";
  if (cents > 0) {
    const jiao = Math.floor(cents / 10);
    const fen = cents % 10;
    s += "块";
    if (jiao) s += DIGIT[jiao];
    if (fen) {
      if (!jiao) s += "零";
      s += DIGIT[fen];
    }
  } else {
    s += "块";
  }
  return negative ? `负${s}` : s;
}

function convertPercents(text: string): string {
  return text.replace(
    new RegExp(`(${DEC_NUM})\\s*%`, "g"),
    (full, raw: string) => {
      const n = parseLocaleNumber(raw);
      if (!Number.isFinite(n)) return full;
      if (Number.isInteger(n)) return `百分之${integerToChinese(n)}`;
      const plain = raw.replace(/,/g, "");
      const [a, b = ""] = plain.split(".");
      return `百分之${integerToChinese(Number(a))}点${[...b]
        .map((d) => DIGIT[Number(d)] ?? d)
        .join("")}`;
    },
  );
}

/** ¥9.9 / ￥9.9 / 9.9元 / 1,234.5元 */
function convertMoney(text: string): string {
  let t = text;
  t = t.replace(
    new RegExp(`[¥￥]\\s*(${DEC_NUM})`, "g"),
    (full, raw: string) => {
      const n = parseLocaleNumber(raw);
      if (!Number.isFinite(n)) return full;
      return moneyToChinese(n);
    },
  );
  t = t.replace(
    new RegExp(`(${DEC_NUM})\\s*元`, "g"),
    (full, raw: string) => {
      const n = parseLocaleNumber(raw);
      if (!Number.isFinite(n)) return full;
      return moneyToChinese(n);
    },
  );
  return t;
}

/** 28,485 Token / 10,000 Token / 65536 Token额度 → 中文 + 个 Token */
export function convertTokenUnit(text: string): string {
  let t = text;
  const cnNum = "零一二三四五六七八九十百千万亿两";

  t = t.replace(
    new RegExp(`(${INT_NUM})\\s*([Tt]okens?)(额度)?`, "g"),
    (full, num: string, _unit: string, quota?: string) => {
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return full;
      return `${integerToChinese(n)}个 Token${quota ?? ""}`;
    },
  );

  t = t.replace(
    new RegExp(`([${cnNum}]+)(?!个)\\s*([Tt]okens?)(额度)?`, "g"),
    (_full, cn: string, _unit: string, quota?: string) =>
      `${cn}个 Token${quota ?? ""}`,
  );

  return t;
}

/** 3次 / 12次购买 / 购买3次套餐 */
function convertTimes(text: string): string {
  return text.replace(
    new RegExp(`(${INT_NUM})\\s*次`, "g"),
    (full, num: string) => {
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return full;
      return `${integerToChinese(n)}次`;
    },
  );
}

const BILLING_UNIT_SPOKEN: Record<string, string> = {
  次: "每次",
  分钟: "每分钟",
  小时: "每小时",
  天: "每天",
  日: "每日",
  月: "每月",
  年: "每年",
};

/**
 * 计费单位口语化，避免 TTS 把 `/次` 读成「斜杠次」。
 * 5 Token/次 → 五个 Token 每次；九块九/月 → 九块九 每月
 */
export function convertBillingUnits(text: string): string {
  return text.replace(
    /\s*[\/／]\s*(分钟|小时|次|天|日|月|年)(?![\u4e00-\u9fffA-Za-z0-9])/g,
    (_full, unit: string) => {
      const spoken = BILLING_UNIT_SPOKEN[unit] ?? `每${unit}`;
      return ` ${spoken}`;
    },
  );
}

/**
 * 上下文数字：余额28485、剩余10000 Token、购买3次套餐
 * 先于通用数字规则执行，避免被拆碎。
 */
export function convertContextualNumbers(text: string): string {
  let t = text;

  // 余额28485 / 余额：28,485 / 当前余额是28485
  t = t.replace(
    new RegExp(
      `(当前余额|剩余余额|账户余额|余额)\\s*[：:是]?\\s*(${INT_NUM})(?!\\s*[Tt]okens?)`,
      "g",
    ),
    (_full, label: string, num: string) => {
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return _full;
      const name = label === "余额" ? "余额" : label;
      return `${name}${integerToChinese(n)}`;
    },
  );

  // 剩余10000 Token / 还剩 10,000 Token → 剩余一万个 Token
  t = t.replace(
    new RegExp(`(剩余|还剩|余下)\\s*(${INT_NUM})\\s*([Tt]okens?)`, "g"),
    (_full, lead: string, num: string) => {
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return _full;
      return `${lead}${integerToChinese(n)}个 Token`;
    },
  );

  // 购买3次套餐 / 已购买 3 次
  t = t.replace(
    new RegExp(`(购买|已购|下单|成交)\\s*(${INT_NUM})\\s*次\\s*(套餐)?`, "g"),
    (_full, verb: string, num: string, pack?: string) => {
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return _full;
      return `${verb}${integerToChinese(n)}次${pack ?? ""}`;
    },
  );

  return t;
}

/** 当前余额：xxx → 当前余额是xxx（无紧跟数字时） */
function convertBalancePhrasing(text: string): string {
  return text
    .replace(/当前余额\s*[：:]\s*(?=[零一二三四五六七八九十百千万亿])/g, "当前余额是")
    .replace(/当前余额\s*[：:]\s*/g, "当前余额是")
    .replace(/余额\s*[：:]\s*(?=[零一二三四五六七八九十百千万亿])/g, "余额是")
    .replace(/余额\s*[：:]\s*/g, "余额是");
}

/**
 * 模型名 / 通道名语音映射，避免英文缩写被生硬朗读。
 */
export function normalizeModelNames(text: string): string {
  let t = text;

  // 先长后短，避免重复叠加「模型/套餐」
  const rules: Array<[RegExp, string]> = [
    [/\bDeepSeek\s*Chat\b/gi, "DeepSeek模型"],
    [/\bDeepSeek模型\b/gi, "DeepSeek模型"],
    [/\bDeepSeek\b/gi, "DeepSeek模型"],
    [/\bPREMIUM\b/gi, "Gamma"],
    [/\bGammaGamma\b/g, "Gamma"],
    [/\bSTANDARD\b/gi, "Beta"],
    [/\bBetaBeta\b/g, "Beta"],
    [/\bLIGHT\b/gi, "Alpha"],
    [/\bAlphaAlpha\b/g, "Alpha"],
    [/\bSALES\b/gi, "Guide"],
    [/\bGuideGuide\b/g, "Guide"],
    [/\bNova\b/gi, "Alpha"],
    [/\bCore\b/gi, "Beta"],
    [/\bApex\b/gi, "Gamma"],
    [/\b高级套餐\b/g, "Gamma"],
    [/\b标准套餐\b/g, "Beta"],
    [/\b轻量套餐\b/g, "Alpha"],
    [/\b销售客服\b/g, "Guide"],
  ];

  for (const [pattern, replacement] of rules) {
    t = t.replace(pattern, replacement);
  }

  // 去重：DeepSeek模型模型
  t = t.replace(/(DeepSeek模型){2,}/g, "DeepSeek模型");
  t = t.replace(/(Gamma|Beta|Alpha|Guide){2,}/g, "$1");

  return t;
}

/** 剩余未带单位的整数（含千分位） */
function convertStandaloneNumbers(text: string): string {
  return text.replace(
    new RegExp(
      `(?<![A-Za-z0-9.零一二三四五六七八九十百千万亿])(${INT_NUM})(?![A-Za-z0-9.%]|\\s*(?:Token|tokens?|次|元|块|%|个))`,
      "gi",
    ),
    (full, num: string) => {
      if (!String(num).includes(",") && String(num).length === 1) return full;
      const n = parseLocaleNumber(num);
      if (!Number.isFinite(n)) return full;
      if (!String(num).includes(",") && n < 10) return full;
      return integerToChinese(n);
    },
  );
}

/** 列表 / 分点 → 逗号与句号，制造自然停顿 */
function naturalizePauses(text: string): string {
  let t = text;

  t = t.replace(
    /(第[一二三四五六七八九十百千零\d]+[点项条])\s*[：:]\s*/g,
    "$1，",
  );
  t = t.replace(/(第[一二三四五六七八九十百千零\d]+[点项条])\s+/g, "$1，");

  t = t.replace(/\b([A-Da-d])\s*套餐\s*[：:]\s*/g, "$1套餐，");
  t = t.replace(/(?:^|[。；\n])\s*([A-Da-d])\s*[：:]\s*/g, "。$1套餐，");

  t = t.replace(/([^\d])[：:]\s*/g, "$1，");

  t = t.replace(/\n+/g, "。");
  t = t.replace(/[。]{2,}/g, "。");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/，\s*$/g, "。");

  return t.trim();
}

/** SALES 专用：更像真人客服的推荐话术 */
function naturalizeSales(text: string): string {
  let t = text;

  t = t.replace(/以下\s*Token\s*套餐/gi, "几个 Token 套餐");
  t = t.replace(/提供以下/g, "提供几个");
  t = t.replace(/目前提供[：:]\s*/g, "目前我们提供几个 Token 套餐，");
  t = t.replace(/我们目前有(?!多个)/g, "我们目前有多个");
  t = t.replace(/套餐[：:]\s*(?=。|$)/g, "套餐可以选择。");
  t = t.replace(/套餐[：:]\s*/g, "套餐，");
  t = t.replace(/价格[是为]?\s*/g, "价格是");

  // 推荐 / 可选
  t = t.replace(/建议您?(?:选择|购买)?/g, "推荐您选择");
  t = t.replace(/可以考虑/g, "可以选择");
  t = t.replace(/供您选择/g, "可以选择");
  t = t.replace(/点击购买/g, "可以选择购买");

  t = t.replace(
    /(一[千百]?|二[千百]?|三[千百]?|四[千百]?|五[千百]?|六[千百]?|七[千百]?|八[千百]?|九[千百]?|十[万千百]?|[\u4e00-\u9fff]+)\s*Token\s*[，,]\s*(价格是)?([零一二三四五六七八九十百千万亿块点]+)/gi,
    (_m, count: string, _priceWord: string, price: string) => {
      const spoken = /个$/.test(count.trim()) ? count.trim() : `${count.trim()}个`;
      return `${spoken} Token，价格是${price}`;
    },
  );

  // 开场客服语气（仅对开场句，避免分段 TTS 每段都加「您好」）
  if (!/^(您好|你好|哈喽)/.test(t)) {
    t = t.replace(/^目前我们/, "您好，目前我们");
    t = t.replace(/^我们目前/, "您好，我们目前");
    t = t.replace(/^目前提供/, "您好，目前我们提供");
  }

  return t;
}

/**
 * 把清洗后的文字转成适合朗读的客服口语。
 * 不修改聊天展示，只影响 TTS。
 */
export function naturalizeVoiceText(
  text: string,
  options: VoiceNaturalizeOptions = {},
): string {
  if (!text) return "";

  let t = text.trim();
  if (!t) return "";

  // 1) 模型名映射
  t = normalizeModelNames(t);

  // 2) 金额 / 百分比 / 上下文数字 / Token / 次数
  t = convertMoney(t);
  t = convertPercents(t);
  t = convertContextualNumbers(t);
  t = convertTokenUnit(t);
  t = convertTimes(t);
  t = convertBalancePhrasing(t);
  t = convertStandaloneNumbers(t);

  // 3) 计费单位：/次 /月 → 每次 每月（数字、金额转换之后）
  t = convertBillingUnits(t);
  console.log("[VOICE NATURALIZER] 单位转换：", t.slice(0, 200));

  // 4) 停顿
  t = naturalizePauses(t);

  // 5) 销售客服专用
  if (options.serviceType === "SALES") {
    t = naturalizeSales(t);
  }

  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([，。！？；])/g, "$1");
  t = t.replace(/^[，、]+/, "");
  t = t.trim();

  return t;
}

const READABLE_RE = /[\p{L}\p{N}]/u;

function hasReadableGlyphs(text: string): boolean {
  return READABLE_RE.test(text);
}

/**
 * 去掉 Markdown 链接（含文案）、URL、emoji、标记符号。
 * 若去掉后没有可读字符，说明整段只是排版残留，不应送 TTS。
 */
function stripSpeechScaffold(text: string): string {
  let t = text;
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[[^\]]*\]\([^)]*$/g, " ");
  t = t.replace(/\bhttps?:\/\/[^\s)\]>，。！？；、"'<>]+/gi, " ");
  t = t.replace(/\bwww\.[^\s)\]>，。！？；、"'<>]+/gi, " ");
  try {
    t = t.replace(/\p{Extended_Pictographic}/gu, "");
    t = t.replace(/\p{Emoji_Presentation}/gu, "");
  } catch {
    t = t.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      "",
    );
  }
  t = t.replace(/[*#`~_>|•●○◆◇▪▫►◀⭐✨🔥💡✅❌⚠🎉🚀📌👉⬅️➡️⬆️⬇️\-—=\[\]()（）【】〖〗]/g, " ");
  t = t.replace(/[\/\\?&=]+/g, " ");
  t = t.replace(/[，。！？；、,:;.!?]+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function isUnspeakableVoiceText(raw: string, prepared = ""): boolean {
  if (!raw.trim()) return true;
  if (!hasReadableGlyphs(stripSpeechScaffold(raw))) return true;
  if (prepared && !hasReadableGlyphs(prepared)) return true;
  return false;
}

/**
 * TTS 完整处理链：清洗 → 自然化（带调试日志）
 * 无可朗读内容时返回 null，调用方不得送豆包。
 */
export function prepareVoiceText(
  raw: string,
  options: VoiceNaturalizeOptions = {},
): string | null {
  const original = raw ?? "";

  if (isUnspeakableVoiceText(original)) {
    console.log("[VOICE NATURALIZER] 原始文本：", original.slice(0, 200));
    console.log("[VOICE NATURALIZER] 最终发送TTS： (skip empty)");
    return null;
  }

  const cleaned = cleanVoiceText(original);
  if (!cleaned.trim() || !hasReadableGlyphs(cleaned)) {
    console.log("[VOICE NATURALIZER] 原始文本：", original.slice(0, 200));
    console.log("[VOICE NATURALIZER] 清洗后：", cleaned.slice(0, 200));
    console.log("[VOICE NATURALIZER] 最终发送TTS： (skip empty)");
    return null;
  }

  const naturalized = naturalizeVoiceText(cleaned, options);
  const finalText = naturalized.trim();

  console.log("[VOICE NATURALIZER] 原始文本：", original.slice(0, 200));
  console.log("[VOICE NATURALIZER] 清洗后：", cleaned.slice(0, 200));
  console.log("[VOICE NATURALIZER] 自然化后：", naturalized.slice(0, 200));

  if (!finalText || !hasReadableGlyphs(finalText) || isUnspeakableVoiceText(original, finalText)) {
    console.log("[VOICE NATURALIZER] 最终发送TTS： (skip empty)");
    return null;
  }

  console.log("[VOICE NATURALIZER] 最终发送TTS：", finalText.slice(0, 200));
  return finalText;
}
