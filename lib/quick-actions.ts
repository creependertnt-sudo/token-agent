import type { QuickAction } from "@/components/chat/types";
import type { ChatServiceType } from "@/lib/constants";

/** 用户问题意图：给推荐系统定方向 */
export type UserIntent =
  | "build"
  | "optimize"
  | "explain"
  | "recommend"
  | "general";

/** @deprecated 兼容旧名；请优先用 UserIntent */
export type QuickActionKind = UserIntent | "plan" | "question" | "deepen";

export type GenerateQuickActionsInput = {
  lastUserMessage: string;
  lastAssistantMessage: string;
  /** 有效对话轮次（用户发送次数） */
  messageCount: number;
  serviceType?: ChatServiceType | string | null;
};

/**
 * 每种意图的备选动作池（最多 3 个展示）。
 * 原则：推荐 = 替用户决定下一步，不是让用户「选择继续」。
 * ❌ 点击这里继续 / 查看更多
 * ✅ 帮我优化这个客服逻辑 / 给我一个完整方案
 */
export const ACTION_TEMPLATES: Record<UserIntent, readonly string[]> = {
  build: [
    "给我一个完整方案",
    "拆成可执行的步骤",
    "先做一个最小可用版本",
    "用代码把核心流程写出来",
  ],
  optimize: [
    "帮我优化这个逻辑",
    "给我一个完整方案",
    "指出最该改的三处",
    "把改进点排成优先级",
  ],
  explain: [
    "用例子讲清楚原理",
    "对比常见做法差异",
    "总结成可落地要点",
  ],
  recommend: [
    "直接推荐最合适的一个",
    "按场景给出首选方案",
    "说明为什么选这个",
  ],
  general: [
    "继续推进下一步",
    "把重点展开成方案",
    "给出我现在就能做的事",
  ],
};

const PICK_COUNT = 3;
const SHUFFLE_RETRY = 8;
const KEYWORD_MIN = 10;
const KEYWORD_MAX = 15;

/** 上次抽出的 label 签名（同会话去重） */
let lastPickedSignature = "";

/**
 * 从用户问题提取上下文关键词（约 10～15 字），用于把推荐写「针对你」。
 * 例：「帮我设计一个AI客服系统」→「AI客服系统」
 */
export function extractContextKeywords(message: string): string {
  const raw = message.replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const cut = raw.search(/[。！？!?\n]/);
  const sentence = (cut >= 0 ? raw.slice(0, cut) : raw).trim();

  const withoutPolite =
    sentence
      .replace(
        /^(请帮我|帮我|请你|麻烦你?|请问|我想要?|我需要|能否|可以)[：:\s，,]*/i,
        "",
      )
      .trim() || sentence;

  let core = withoutPolite
    .replace(
      /^(优化|改进|提升|实现|设计|搭建|开发|编写|写|做)(一个|个|一下|下)?/i,
      "",
    )
    .replace(/^(一个|这个|那个|一份|一套)/, "")
    .trim();

  if (!core) core = withoutPolite;

  // 已抽出明确话题（≥4字）则保留，不强行补「设计一个」
  if (core.length >= 4 && core.length <= KEYWORD_MAX) {
    return core;
  }
  if (core.length > KEYWORD_MAX) {
    return core.slice(0, KEYWORD_MAX);
  }
  // 极短时用去客套句补到不超过 15 字
  if (withoutPolite.length > core.length) {
    return withoutPolite.slice(0, KEYWORD_MAX);
  }
  return core;
}

/**
 * 把模板里的泛指换成当前关键词，使推荐贴合问题。
 * 例：帮我优化这个逻辑 + AI客服 → 帮我优化这个客服逻辑
 */
export function contextualizeAction(template: string, keywords: string): string {
  const kw = keywords.trim();
  if (!kw) return template;

  // 「AI客服系统」→ 口语里常说「客服」；优先可读短称
  const topic =
    kw.length > 6 && /客服/.test(kw)
      ? kw.replace(/系统$/, "").replace(/^一个/, "") || kw
      : kw;

  if (template === "给我一个完整方案") {
    return "给我一个完整方案";
  }
  if (template === "帮我优化这个逻辑") {
    // 「AI客服」→「客服」更贴口语示例
    const logicTopic = /客服/.test(topic)
      ? topic.replace(/^AI\s*/i, "").replace(/系统$/, "") || topic
      : topic;
    return `帮我优化这个${logicTopic}逻辑`;
  }

  const rules: Array<[RegExp, string]> = [
    [/指出最该改的三处/g, `指出这个${topic}最该改的三处`],
    [/把改进点排成优先级/g, `把这个${topic}的改进点排成优先级`],
    [/拆成可执行的步骤/g, `把${topic}拆成可执行的步骤`],
    [/先做一个最小可用版本/g, `先做一个${topic}最小可用版本`],
    [/用代码把核心流程写出来/g, `用代码把${topic}核心流程写出来`],
    [/用例子讲清楚原理/g, `用例子讲清楚${topic}的原理`],
    [/对比常见做法差异/g, `对比${topic}的常见做法差异`],
    [/总结成可落地要点/g, `把${topic}总结成可落地要点`],
    [/直接推荐最合适的一个/g, `直接推荐最合适的${topic}`],
    [/按场景给出首选方案/g, `按场景给出${topic}的首选方案`],
    [/说明为什么选这个/g, `说明为什么选这个${topic}`],
    [/继续推进下一步/g, `继续推进这个${topic}的下一步`],
    [/把重点展开成方案/g, `把${topic}的重点展开成方案`],
    [/给出我现在就能做的事/g, `给出我现在就能做的${topic}下一步`],
  ];

  for (const [re, replacement] of rules) {
    if (re.test(template)) {
      return template.replace(re, replacement);
    }
  }

  return `${template.replace(/[。.!？?]*$/, "")}：关于${topic}`;
}

/**
 * 意图识别：根据用户问题判断推荐方向。
 * 按优先级匹配，命中即返回。
 */
export function detectUserIntent(text: string): UserIntent {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "general";

  // 优化类优先于「做/写」，避免「帮我优化…」被建成 build
  if (/优化|改进|提升/.test(t)) return "optimize";
  if (/实现|写代码|代码|搭建|设计一个|做一个|开发/.test(t)) return "build";
  if (/是什么|为什么|原理/.test(t)) return "explain";
  if (/推荐|怎么选/.test(t)) return "recommend";
  return "general";
}

/** 兼容旧调用：综合用户话 + 助手回复；用户意图优先 */
export function classifyForQuickActions(
  userMessage: string,
  assistantMessage: string,
): UserIntent {
  const fromUser = detectUserIntent(userMessage);
  if (fromUser !== "general") return fromUser;
  return detectUserIntent(assistantMessage);
}

/** Fisher–Yates 洗牌（不改原数组） */
export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function actionSignature(labels: string[]): string {
  return labels.join("\0");
}

/**
 * 从模板池随机抽 count 条；若与上次完全相同则重新随机。
 */
export function pickActionTemplates(
  intent: UserIntent,
  opts: {
    count?: number;
    previousLabels?: string[] | null;
  } = {},
): string[] {
  const pool = ACTION_TEMPLATES[intent] ?? ACTION_TEMPLATES.general;
  if (pool.length === 0) return [];

  const count = Math.min(opts.count ?? PICK_COUNT, pool.length);
  const previousSig =
    opts.previousLabels != null
      ? actionSignature(opts.previousLabels)
      : lastPickedSignature;

  let picked = shuffle(pool).slice(0, count);
  let guard = 0;
  while (
    guard < SHUFFLE_RETRY &&
    previousSig &&
    actionSignature(picked) === previousSig
  ) {
    picked = shuffle(pool).slice(0, count);
    guard += 1;
  }

  lastPickedSignature = actionSignature(picked);
  return picked;
}

/** 重置去重记忆（新对话时调用） */
export function resetQuickActionPickMemory() {
  lastPickedSignature = "";
}

function templatesToActions(
  intent: UserIntent,
  labels: string[],
  keywords: string,
): QuickAction[] {
  return labels.map((template, i) => {
    const text = contextualizeAction(template, keywords);
    return {
      id: `${intent}-${i}-${text.slice(0, 10)}`,
      label: text,
      prompt: text,
    };
  });
}

/**
 * 推荐系统核心：意图 → 上下文增强 → 最多 3 个「替用户决定下一步」的动作。
 */
export function generateQuickActions(
  input: GenerateQuickActionsInput,
): QuickAction[] {
  const { lastUserMessage, lastAssistantMessage, serviceType } = input;

  if (!lastAssistantMessage.trim()) return [];
  if (serviceType === "SALES") return [];

  const keywords = extractContextKeywords(lastUserMessage);
  const intent = classifyForQuickActions(
    lastUserMessage,
    lastAssistantMessage,
  );

  const canSuggestBeta =
    serviceType !== "STANDARD" && serviceType !== "PREMIUM";

  const betaAction: QuickAction = {
    id: "conv-beta",
    label: "用 Beta 模型深入分析",
    prompt:
      "用 Beta 模型深入分析刚才的问题，给出更完整的判断和下一步行动",
    suggestServiceType: "STANDARD",
  };

  // optimize：固定「决定下一步」三选，避免像广告位乱洗牌
  if (intent === "optimize") {
    const primary = templatesToActions(
      intent,
      ["帮我优化这个逻辑", "给我一个完整方案"],
      keywords,
    );
    if (canSuggestBeta) {
      return [...primary, betaAction].slice(0, PICK_COUNT);
    }
    const third = templatesToActions(
      intent,
      ["指出最该改的三处"],
      keywords,
    );
    return [...primary, ...third].slice(0, PICK_COUNT);
  }

  const labels = pickActionTemplates(intent, { count: PICK_COUNT });
  let actions = templatesToActions(intent, labels, keywords);

  // build：插入 Beta 深化入口（占一个名额，总数仍 ≤3）
  if (intent === "build" && canSuggestBeta) {
    actions = [
      ...actions.filter((a) => a.id !== "conv-beta").slice(0, PICK_COUNT - 1),
      betaAction,
    ];
  }

  return actions.slice(0, PICK_COUNT);
}

/** @deprecated 请用 generateQuickActions */
export function buildQuickActions(reply: string): QuickAction[] {
  return generateQuickActions({
    lastUserMessage: "",
    lastAssistantMessage: reply,
    messageCount: 1,
    serviceType: null,
  });
}

/** @deprecated 请用 detectUserIntent / classifyForQuickActions */
export function classifyReplyForActions(reply: string): QuickActionKind {
  return detectUserIntent(reply);
}
