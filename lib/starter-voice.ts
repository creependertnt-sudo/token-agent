/**
 * Starter 去模板化：口语语气 + 随机层 + 上下文影子。
 * 目标：像 AI 刚看完你在给建议，而不是功能按钮。
 */

export type StarterVoiceInput = {
  id: string;
  text: string;
  /** 可与语气前缀拼接的动作核（如：把客服流程优化一下） */
  voiceCore?: string;
  category: string;
  tags: string[];
};

export type StarterVoiceTier = "primary" | "secondary" | "explore";

/** 第6-2：随机语气（tone + 内容） */
export const STARTER_TONES = [
  (core: string) => `你这个可以试试${core}`,
  (core: string) => `这个方向其实可以再深入一点，${core}`,
  (core: string) => `我感觉这里可以${core}`,
  (core: string) => `这里可能有个更好的做法：${core}`,
  (core: string) => `这个我们可以换个思路看看，${core}`,
] as const;

export type StarterContextShadow = "ai_customer" | "token" | "project";

/** 第6-3：上下文影子句 */
const CONTEXT_SHADOW_LINES: Record<StarterContextShadow, string[]> = {
  ai_customer: [
    "你这个AI客服可以把推荐策略再优化一下",
    "这个AI客服其实可以重新设计一下结构",
    "我可以帮你把这个AI客服做成一个完整系统",
    "客服这边的对话流程，感觉还能再顺一点",
  ],
  token: [
    "你现在这个token机制其实可以再细化一下",
    "这个token设计感觉还能再顺一点",
    "token这块可以再想想怎么用得更清楚",
  ],
  project: [
    "这个项目可以往更完整的产品方向走一下",
    "你这个项目其实卡在某个点了，我们可以一起找一下",
    "这个项目感觉值得再做深一点",
  ],
};

function stripArrow(text: string): string {
  return text.replace(/\s*→\s*$/u, "").trim();
}

function pickOne<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** 从历史 / 标题里识别上下文影子 */
export function detectStarterContextShadow(
  contextText: string,
): StarterContextShadow | null {
  const t = contextText.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/客服|ai\s*客服/i.test(t)) return "ai_customer";
  if (/token|代币|积分/i.test(t)) return "token";
  if (/项目|产品|系统/.test(t)) return "project";
  return null;
}

function itemFitsShadow(
  item: StarterVoiceInput,
  shadow: StarterContextShadow,
): boolean {
  const tags = item.tags.map((x) => x.toLowerCase());
  const blob = `${item.category} ${tags.join(" ")} ${stripArrow(item.text)}`;

  if (shadow === "ai_customer") {
    return /客服/.test(blob) || (item.category === "ai" && /ai/.test(blob));
  }
  if (shadow === "token") {
    return /token|收费|定价|变现|赚钱/.test(blob);
  }
  if (shadow === "project") {
    return (
      /项目|产品|方案|mvp|变现/.test(blob) ||
      item.category === "product" ||
      item.category === "business" ||
      item.category === "growth"
    );
  }
  return false;
}

/**
 * 渲染「像人说话」的 Starter 文案（不含箭头）。
 * primary 偏完整判断句；其余更多 tone + core。
 */
export function humanizeStarterText(
  item: StarterVoiceInput,
  opts?: {
    tier?: StarterVoiceTier;
    contextText?: string;
  },
): string {
  const tier = opts?.tier ?? "secondary";
  const contextText = opts?.contextText ?? "";
  const shadow = detectStarterContextShadow(contextText);
  const voiceCore = item.voiceCore?.trim();

  // 上下文影子：命中且条目相关
  if (shadow && itemFitsShadow(item, shadow)) {
    const shadowChance = tier === "primary" ? 0.85 : 0.55;
    if (Math.random() < shadowChance) {
      return pickOne(CONTEXT_SHADOW_LINES[shadow]);
    }
  }

  // 主推荐：优先完整自然句
  if (tier === "primary") {
    if (Math.random() < 0.35 && voiceCore) {
      return pickOne(STARTER_TONES)(voiceCore);
    }
    return stripArrow(item.text);
  }

  // 次级 / 探索：语气随机更活跃
  if (voiceCore && Math.random() < 0.65) {
    return pickOne(STARTER_TONES)(voiceCore);
  }

  return stripArrow(item.text);
}
