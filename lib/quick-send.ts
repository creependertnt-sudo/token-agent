import type { ChatServiceType } from "@/lib/constants";
import { getLastChat } from "@/lib/chat-history";
import { shuffle } from "@/lib/quick-actions";
import { humanizeStarterText } from "@/lib/starter-voice";

/** 一键发送可选路由（本轮对话使用） */
export type QuickSendOptions = {
  serviceType?: ChatServiceType;
  serviceId?: string;
  /** 来源助手消息：发送后隐藏其推荐按钮 */
  messageId?: string;
  /** 推进链 id：有则启动分步任务流程 */
  chainId?: string;
  /** @deprecated 请用 chainId；兼容旧调用 */
  starterId?: string;
  /** Starter 分类（链 id 缺失时兜底） */
  starterCategory?: StarterCategory;
  /** 来自推进链动作按钮 → 后端进入跟进模式 */
  actionChainContinue?: boolean;
};

export type StarterCategory =
  | "product"
  | "dev"
  | "ai"
  | "business"
  | "career"
  | "growth"
  | "creative"
  | "learning";

/**
 * 可筛选 / 可排序的起点条目（智能推荐基础数据）。
 * text 为展示文案；发送时会去掉末尾「→」。
 * chainId 存在 → 点击启动推进链任务流程。
 */
export type StarterItem = {
  id: string;
  /** 自然建议句（判断 + 建议，非命令） */
  text: string;
  /**
   * 语气核：可与随机语气拼接（如「把客服流程优化一下」）。
   * 不含「帮我…」命令感。
   */
  voiceCore?: string;
  category: StarterCategory;
  tags: string[];
  weight: number;
  isPrimary?: boolean;
  /** 对应 ACTION_CHAINS 的推进链 id */
  chainId?: string;
};

export type StarterTier = "primary" | "secondary" | "explore";

/** UI 分层展示用（由 StarterItem 投影而来） */
export type StarterQuickSend = {
  id: string;
  label: string;
  prompt: string;
  tier: StarterTier;
  category?: StarterCategory;
  tags?: string[];
  weight?: number;
  chainId?: string;
};

/** 分层起点：主推荐 1 + 次推荐 3 + 探索 2~4 */
export type StarterBundle = {
  primary: StarterQuickSend;
  secondary: StarterQuickSend[];
  explore: StarterQuickSend[];
};

/** 套餐卡「推荐我一个」→ 直接进 Guide 对话 */
export const PROMPT_RECOMMEND_PACKAGE =
  "请根据我刚才的对话，用顾问方式：先理解需求，再推荐合适模型，最后给一个最合适的套餐，并说明大概还需要几轮对话。";

/** SALES「先试试 Beta」→ 直接开聊，不跳转 */
export const PROMPT_TRY_BETA =
  "我想先试试 Beta，请用 Beta 继续帮我推进刚才的问题，并告诉我下一步怎么做。";

/** 全量起点目录：口语建议句 + voiceCore（供语气随机） */
const STARTER_CATALOG_RAW = [
  // —— product ——
  {
    id: "ai_customer_opt",
    text: "这个AI客服其实可以重新设计一下结构 →",
    voiceCore: "把这个AI客服再优化一下",
    category: "product",
    tags: ["ai", "客服", "优化"],
    weight: 10,
    isPrimary: true,
  },
  {
    id: "ai_customer_flow",
    text: "客服流程这块，感觉可以再梳得更清楚一点 →",
    voiceCore: "把客服流程重新梳一遍",
    category: "product",
    tags: ["ai", "客服", "流程"],
    weight: 8,
  },
  {
    id: "ai_customer_build",
    text: "我可以帮你把这个AI客服做成一个完整系统 →",
    voiceCore: "把这个AI客服做成完整系统",
    category: "ai",
    tags: ["ai", "客服", "系统"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "product_full_plan",
    text: "这个方向其实值得落成一版完整方案 →",
    voiceCore: "把完整方案先搭一版",
    category: "product",
    tags: ["方案", "产品", "规划"],
    weight: 8,
  },
  {
    id: "product_ux_opt",
    text: "产品体验这里，我觉得还能再顺一点 →",
    voiceCore: "把产品体验再顺一下",
    category: "product",
    tags: ["产品", "体验", "优化"],
    weight: 7,
  },
  {
    id: "product_feature_sense",
    text: "这个功能的做法，感觉还能更合理一点 →",
    voiceCore: "把这个功能设计得更合理",
    category: "product",
    tags: ["功能", "产品", "设计"],
    weight: 6,
  },
  {
    id: "product_mvp",
    text: "不如先压成一版能跑的 MVP →",
    voiceCore: "先压一版能跑的 MVP",
    category: "product",
    tags: ["mvp", "规划", "启动"],
    weight: 6,
  },

  // —— ai ——
  {
    id: "ai_chatgpt_product",
    text: "你这个可以往「类似ChatGPT」的方向再做深一点 →",
    voiceCore: "往类似ChatGPT的方向再做深一点",
    category: "ai",
    tags: ["ai", "chatgpt", "产品", "gpt"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "ai_customer_lift_convert",
    text: "AI客服的转化，感觉卡在推荐时机上了 →",
    voiceCore: "把AI客服的转化再提一提",
    category: "ai",
    tags: ["ai", "客服", "转化"],
    weight: 8,
  },
  {
    id: "ai_train_own_model",
    text: "训练自己的模型这件事，其实可以拆得更清楚 →",
    voiceCore: "把训练自己模型的路径拆清楚",
    category: "ai",
    tags: ["ai", "训练", "模型"],
    weight: 7,
  },
  {
    id: "ai_gpt_like",
    text: "做个类 GPT 系统，我觉得可以从最小能力开始 →",
    voiceCore: "从最小能力搭一个类GPT系统",
    category: "ai",
    tags: ["ai", "gpt", "系统"],
    weight: 5,
  },

  // —— dev ——
  {
    id: "dev_login",
    text: "登录这块，其实可以先做成一个干净可用的版本 →",
    voiceCore: "把登录功能先做成可用版",
    category: "dev",
    tags: ["代码", "登录", "功能"],
    weight: 7,
  },
  {
    id: "dev_bug",
    text: "这个 bug 看着像是某个边界没兜住，我们可以一起定位 →",
    voiceCore: "把这个bug一起定位一下",
    category: "dev",
    tags: ["代码", "bug", "调试"],
    weight: 8,
    isPrimary: true,
  },
  {
    id: "dev_code_opt",
    text: "这段代码其实还有更干净的写法 →",
    voiceCore: "把这段代码再优化一下",
    category: "dev",
    tags: ["代码", "优化", "实现"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "dev_better_impl",
    text: "实现方式这里，可能有个更稳的做法 →",
    voiceCore: "换一个更稳的实现方式",
    category: "dev",
    tags: ["代码", "实现", "重构"],
    weight: 7,
  },
  {
    id: "dev_logic_alt",
    text: "这个逻辑我们或许可以换个切法 →",
    voiceCore: "把这个逻辑换个切法",
    category: "dev",
    tags: ["代码", "逻辑", "优化"],
    weight: 6,
  },

  // —— business ——
  {
    id: "biz_make_money",
    text: "这个项目的赚钱路径，其实还没完全打开 →",
    voiceCore: "把这个项目的赚钱路径理清楚",
    category: "business",
    tags: ["赚钱", "变现", "商业", "项目"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "biz_monetize",
    text: "变现这块，感觉可以再具体一点 →",
    voiceCore: "把变现方式再具体一点",
    category: "business",
    tags: ["变现", "商业", "收费", "项目"],
    weight: 8,
  },
  {
    id: "biz_pricing_design",
    text: "定价现在可能偏“拍脑袋”，我们可以一起校准 →",
    voiceCore: "把定价再校准一下",
    category: "business",
    tags: ["定价", "收费", "商业"],
    weight: 8,
  },
  {
    id: "biz_pricing",
    text: "收费策略这里，其实可以更贴近用户感知 →",
    voiceCore: "把收费策略再设计一下",
    category: "business",
    tags: ["收费", "定价", "商业"],
    weight: 7,
  },
  {
    id: "biz_why_not_pay",
    text: "用户不愿付费，通常卡在某个具体点上 →",
    voiceCore: "一起找用户不愿付费的卡点",
    category: "business",
    tags: ["付费", "转化", "用户"],
    weight: 8,
  },
  {
    id: "biz_competitors",
    text: "这个想法，其实值得对照几个竞品看一眼 →",
    voiceCore: "对照几个竞品看一眼",
    category: "business",
    tags: ["竞品", "调研", "市场"],
    weight: 4,
  },

  // —— growth ——
  {
    id: "growth_retention",
    text: "你这个现在用户留存可能有点问题，可以一起看看 →",
    voiceCore: "一起看看用户留存卡在哪",
    category: "growth",
    tags: ["留存", "增长", "用户"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "growth_why_no_users",
    text: "这个产品感觉卡在某个点了，我们可以一起找一下原因 →",
    voiceCore: "一起找产品没人用的原因",
    category: "growth",
    tags: ["增长", "用户", "产品", "项目"],
    weight: 8,
  },
  {
    id: "growth_strategy",
    text: "增长策略可以先抓一条最容易见效的线 →",
    voiceCore: "先抓一条最容易见效的增长线",
    category: "growth",
    tags: ["增长", "策略", "获客"],
    weight: 8,
  },
  {
    id: "biz_convert",
    text: "转化这里，我觉得还可以再推一把 →",
    voiceCore: "把用户转化再提一提",
    category: "growth",
    tags: ["转化", "增长", "用户"],
    weight: 7,
  },
  {
    id: "biz_next_step",
    text: "下一步其实已经挺清楚了，就差选一个先做 →",
    voiceCore: "先定一个最该做的下一步",
    category: "growth",
    tags: ["下一步", "行动", "规划"],
    weight: 8,
  },
  {
    id: "growth_saas_split",
    text: "要做成 SaaS 的话，模块拆法值得先想清楚 →",
    voiceCore: "先想清楚 SaaS 怎么拆模块",
    category: "growth",
    tags: ["saas", "架构", "产品"],
    weight: 5,
  },

  // —— career ——
  {
    id: "career_write_resume",
    text: "简历可以先写成一版“让人愿意点开”的 →",
    voiceCore: "先写成一版更愿意点开的简历",
    category: "career",
    tags: ["简历", "求职", "职业"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "career_resume",
    text: "这份简历其实还能更突出你的结果 →",
    voiceCore: "把简历再突出结果一点",
    category: "career",
    tags: ["简历", "求职", "优化"],
    weight: 7,
  },
  {
    id: "career_project_job",
    text: "你这个项目，讲好了其实挺能撑求职的 →",
    voiceCore: "把项目经历讲成求职亮点",
    category: "career",
    tags: ["求职", "项目", "工作"],
    weight: 8,
  },
  {
    id: "career_skill_up",
    text: "技术能力提升，关键是别撒得太开 →",
    voiceCore: "把技术提升路径收束一下",
    category: "career",
    tags: ["技术", "能力", "成长"],
    weight: 8,
  },

  // —— creative ——
  {
    id: "creative_startup_idea",
    text: "创业点子这块，我觉得可以先找一个更落地的切口 →",
    voiceCore: "先找一个更落地的创业切口",
    category: "creative",
    tags: ["创业", "点子", "创意"],
    weight: 8,
    isPrimary: true,
  },
  {
    id: "creative_product_name",
    text: "产品名字其实可以再贴一点气质 →",
    voiceCore: "把产品名字再贴一点气质",
    category: "creative",
    tags: ["命名", "产品", "创意"],
    weight: 7,
  },
  {
    id: "creative_fun_features",
    text: "有趣的功能，往往藏在一个很小的使用瞬间里 →",
    voiceCore: "从一个使用瞬间挖有趣功能",
    category: "creative",
    tags: ["功能", "创意", "趣味"],
    weight: 7,
  },
  {
    id: "creative_idea",
    text: "创新点子可以先大胆一点，再往回收 →",
    voiceCore: "先大胆想一个创新点子",
    category: "creative",
    tags: ["创意", "点子", "灵感"],
    weight: 4,
  },
  {
    id: "creative_new_feature",
    text: "新功能不一定要大，先做一个让人眼前一亮的就行 →",
    voiceCore: "先想一个眼前一亮的小功能",
    category: "creative",
    tags: ["功能", "创意", "产品"],
    weight: 4,
  },
  {
    id: "product_expand",
    text: "这个产品旁边，其实还连着几块可扩展的能力 →",
    voiceCore: "看看还能扩展哪块能力",
    category: "creative",
    tags: ["产品", "扩展", "功能", "项目"],
    weight: 5,
  },

  // —— learning ——
  {
    id: "learning_path_give",
    text: "学习路线可以先按“两周能用起来”来排 →",
    voiceCore: "排一条两周能用起来的学习路线",
    category: "learning",
    tags: ["学习", "路线", "规划"],
    weight: 9,
    isPrimary: true,
  },
  {
    id: "learning_path",
    text: "学习规划这里，我觉得顺序比数量更重要 →",
    voiceCore: "把学习顺序先排清楚",
    category: "learning",
    tags: ["学习", "路线", "成长"],
    weight: 7,
  },
  {
    id: "learning_quick_start",
    text: "这个技术快速上手，其实就差一条最短路径 →",
    voiceCore: "找一条最短的上手路径",
    category: "learning",
    tags: ["学习", "上手", "技术"],
    weight: 8,
  },
  {
    id: "learning_what_first",
    text: "先学什么，取决于你下周最想做成哪一件事 →",
    voiceCore: "先定你下周最该学的那一件",
    category: "learning",
    tags: ["学习", "优先级", "入门"],
    weight: 8,
  },
] as const;

function starterChainId(starterId: string): string {
  if (starterId === "dev_code_opt") return "code_opt_chain";
  return `${starterId}_chain`;
}

/** 带 chainId 的全量起点目录 */
export const STARTER_CATALOG: readonly StarterItem[] = STARTER_CATALOG_RAW.map(
  (item) => ({
    ...item,
    tags: [...item.tags],
    voiceCore: "voiceCore" in item ? item.voiceCore : undefined,
    chainId: starterChainId(item.id),
  }),
);

/**
 * @deprecated 按 category 分组的文案视图；请优先用 STARTER_CATALOG
 */
export const STARTER_POOL: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const item of STARTER_CATALOG) {
    const key = item.category;
    if (!map[key]) map[key] = [];
    map[key].push(stripArrow(item.text));
  }
  return map;
})();

const SECONDARY_COUNT = 3;
const EXPLORE_MIN = 2;
const EXPLORE_MAX = 4;
const SHUFFLE_RETRY = 8;

const EXPLORE_CATEGORIES: ReadonlySet<StarterCategory> = new Set([
  "creative",
  "growth",
  "learning",
  "ai",
]);

let lastBundleSignature = "";

export function stripArrow(text: string): string {
  return text.replace(/\s*→\s*$/u, "").trim();
}

/** 禁止的空泛 CTA（不是下一步动作） */
const FORBIDDEN_STARTER_COPY = [
  /点击这里/,
  /点这里/,
  /查看更多/,
  /了解更多/,
  /点击继续/,
  /继续点击/,
];

export function isForbiddenStarterCopy(text: string): boolean {
  const raw = stripArrow(text);
  return FORBIDDEN_STARTER_COPY.some((re) => re.test(raw));
}

/**
 * 规范为可发送的行动文案（无箭头）。
 * 空泛 CTA 会被拒绝并返回空串。
 */
export function normalizeStarterActionText(text: string): string {
  const core = stripArrow(text);
  if (!core || isForbiddenStarterCopy(core)) return "";
  return core;
}

/** 展示用：统一结尾「 →」 */
export function formatStarterDisplayLabel(text: string): string {
  const core = normalizeStarterActionText(text) || stripArrow(text) || "继续下一步";
  return `${core} →`;
}

function bundleSignature(bundle: StarterBundle): string {
  return [
    bundle.primary.id,
    ...bundle.secondary.map((s) => s.id),
    ...bundle.explore.map((s) => s.id),
  ].join("\0");
}

function toQuickSend(
  item: StarterItem,
  tier: StarterTier,
  contextText = "",
): StarterQuickSend {
  const spoken = humanizeStarterText(item, { tier, contextText });
  const prompt = normalizeStarterActionText(spoken) || stripArrow(item.text) || item.id;
  return {
    id: item.id,
    label: prompt,
    prompt,
    tier,
    category: item.category,
    tags: [...item.tags],
    weight: item.weight,
    chainId: item.chainId ?? starterChainId(item.id),
  };
}

function buildBundleFromItems(
  primary: StarterItem,
  secondary: StarterItem[],
  explore: StarterItem[],
  contextText = "",
): StarterBundle {
  return {
    primary: toQuickSend(primary, "primary", contextText),
    secondary: secondary
      .slice(0, SECONDARY_COUNT)
      .map((item) => toQuickSend(item, "secondary", contextText)),
    explore: explore
      .slice(0, EXPLORE_MAX)
      .map((item) => toQuickSend(item, "explore", contextText)),
  };
}

/** 从上下文文本提取可匹配的小写 token */
export function tokenizeStarterContext(text: string): string[] {
  const raw = text.toLowerCase();
  const tokens = new Set<string>();
  const extras = raw.match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const t of extras) tokens.add(t);
  // 常用中文关键词整词
  for (const kw of [
    "客服",
    "代码",
    "优化",
    "变现",
    "赚钱",
    "转化",
    "留存",
    "增长",
    "定价",
    "付费",
    "产品",
    "简历",
    "求职",
    "工作",
    "学习",
    "创业",
    "创意",
    "训练",
    "模型",
    "bug",
    "ai",
    "chatgpt",
  ]) {
    if (raw.includes(kw.toLowerCase()) || text.includes(kw)) tokens.add(kw);
  }
  if (/AI/i.test(text)) tokens.add("ai");
  return [...tokens];
}

/**
 * 按 tags / category / weight 打分，供筛选排序。
 * contextTokens 为空时退化为纯 weight（可主推加权）。
 */
export function scoreStarterItem(
  item: StarterItem,
  contextTokens: string[] = [],
): number {
  let score = item.weight;
  if (item.isPrimary) score += 2;

  if (contextTokens.length === 0) return score;

  const tags = item.tags.map((t) => t.toLowerCase());
  for (const token of contextTokens) {
    const t = token.toLowerCase();
    if (tags.includes(t)) score += 6;
    else if (tags.some((tag) => tag.includes(t) || t.includes(tag))) score += 3;
    if (item.category === t) score += 2;
    if (stripArrow(item.text).toLowerCase().includes(t)) score += 1;
  }
  return score;
}

/** 排序：分高优先；同分按 weight，再轻微打乱 */
export function sortStartersByScore(
  items: readonly StarterItem[],
  contextTokens: string[] = [],
): StarterItem[] {
  const scored = items.map((item) => ({
    item,
    score: scoreStarterItem(item, contextTokens),
    jitter: Math.random(),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.item.weight !== a.item.weight) return b.item.weight - a.item.weight;
    return a.jitter - b.jitter;
  });
  return scored.map((s) => s.item);
}

/** 按 category / tags 过滤 */
export function filterStarterCatalog(opts?: {
  categories?: StarterCategory[];
  tags?: string[];
  minWeight?: number;
}): StarterItem[] {
  const categories = opts?.categories;
  const tags = opts?.tags?.map((t) => t.toLowerCase());
  const minWeight = opts?.minWeight ?? 0;

  return STARTER_CATALOG.filter((item) => {
    if (item.weight < minWeight) return false;
    if (categories && categories.length > 0 && !categories.includes(item.category)) {
      return false;
    }
    if (tags && tags.length > 0) {
      const itemTags = item.tags.map((t) => t.toLowerCase());
      if (!tags.some((t) => itemTags.includes(t))) return false;
    }
    return true;
  });
}

function pickExploreItems(
  ranked: StarterItem[],
  usedIds: Set<string>,
  count: number,
): StarterItem[] {
  const explorePool = ranked.filter(
    (item) =>
      !usedIds.has(item.id) &&
      (EXPLORE_CATEGORIES.has(item.category) || item.weight <= 6),
  );
  const fallback = ranked.filter((item) => !usedIds.has(item.id));
  const pool = (explorePool.length >= EXPLORE_MIN ? explorePool : fallback).slice();
  return shuffle(pool).slice(
    0,
    Math.max(EXPLORE_MIN, Math.min(count, EXPLORE_MAX)),
  );
}

function assembleBundle(
  ranked: StarterItem[],
  preferredPrimaryId?: string,
): StarterBundle {
  const list = [...ranked];
  if (list.length === 0) {
    return STARTER_BUNDLE_FALLBACK;
  }

  const primary =
    (preferredPrimaryId
      ? list.find((i) => i.id === preferredPrimaryId)
      : undefined) ??
    list.find((i) => i.isPrimary) ??
    list[0]!;

  const rest = list.filter((i) => i.id !== primary.id);
  const secondary = rest.slice(0, SECONDARY_COUNT);
  const used = new Set([primary.id, ...secondary.map((i) => i.id)]);
  const exploreCount =
    EXPLORE_MIN + Math.floor(Math.random() * (EXPLORE_MAX - EXPLORE_MIN + 1));
  const explore = pickExploreItems(list, used, exploreCount);

  if (secondary.length < SECONDARY_COUNT) {
    for (const item of STARTER_CATALOG) {
      if (secondary.length >= SECONDARY_COUNT) break;
      if (used.has(item.id)) continue;
      secondary.push(item);
      used.add(item.id);
    }
  }

  return buildBundleFromItems(primary, secondary, explore, getLastChatText());
}

/** 目录别名（筛选逻辑可读性） */
export const STARTERS = STARTER_CATALOG;

/** 匹配目标：主推 1 + rest 最多 5 */
const MATCHED_TARGET = 6;
const GENERIC_MIN_WEIGHT = 7;

/**
 * 最近对话上下文文本（标题 + 最后 3 条消息）。
 */
export function getLastChatText(): string {
  const lastChat = getLastChat();
  if (!lastChat) return "";

  const recent = (lastChat.messages ?? []).slice(-3);
  const parts = [
    lastChat.title ?? "",
    ...recent.map((m) => (typeof m.content === "string" ? m.content : "")),
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** @deprecated 请用 getLastChatText */
export function extractStarterContextText(): string {
  return getLastChatText();
}

/**
 * 标签匹配：item.tags 任一出现在上下文中即命中，再按 weight 降序。
 */
export function matchStartersByTags(lastText: string): StarterItem[] {
  const haystack = lastText.toLowerCase();
  if (!haystack.trim()) return [];

  return STARTERS.filter((item) =>
    item.tags.some((tag) => haystack.includes(tag.toLowerCase())),
  ).sort((a, b) => b.weight - a.weight);
}

/** 通用推荐（无上下文 / 匹配不足时补充） */
export function getGenericStarters(): StarterItem[] {
  return [...STARTERS]
    .filter((item) => Boolean(item.isPrimary) || item.weight >= GENERIC_MIN_WEIGHT)
    .sort((a, b) => b.weight - a.weight);
}

export type SmartStarterSelection = {
  primary: StarterItem;
  /** 次推荐 + 探索的候选池（最多 5） */
  rest: StarterItem[];
  matched: StarterItem[];
};

/**
 * 智能筛选核心：
 * 1) 标签匹配 2) weight 排序 3) 主推=最相关+最高 weight 4) 不足用通用补
 */
export function selectSmartStarters(lastText: string): SmartStarterSelection {
  const historyMatched = matchStartersByTags(lastText);
  let matched = [...historyMatched];
  const used = new Set(matched.map((item) => item.id));

  const fillFrom = (pool: StarterItem[]) => {
    for (const item of pool) {
      if (matched.length >= MATCHED_TARGET) break;
      if (used.has(item.id)) continue;
      matched.push(item);
      used.add(item.id);
    }
  };

  // matched 不足 → 通用推荐补充
  if (matched.length < MATCHED_TARGET) {
    fillFrom(getGenericStarters());
  }
  // 仍不足 → 全目录按 weight 补齐
  if (matched.length < MATCHED_TARGET) {
    fillFrom([...STARTERS].sort((a, b) => b.weight - a.weight));
  }

  if (matched.length === 0) {
    const fallbackPrimary = pickPrimaryStarter();
    return {
      primary: fallbackPrimary,
      rest: [],
      matched: [fallbackPrimary],
    };
  }

  const primary = pickPrimaryStarter({
    historyMatched,
    candidates: matched,
  });

  // rest = matched 前 5 条里去掉主推后的池；不够再从 matched 后续补
  const topFive = matched.slice(0, 5);
  const rest = [
    ...topFive.filter((item) => item.id !== primary.id),
    ...matched.filter(
      (item) =>
        item.id !== primary.id && !topFive.some((t) => t.id === item.id),
    ),
  ].slice(0, 5);

  return { primary, rest, matched };
}

/** 将智能筛选结果组装成 UI 分层 */
export function bundleFromSmartSelection(
  selection: SmartStarterSelection,
): StarterBundle {
  const { primary, rest } = selection;
  const secondary = rest.slice(0, SECONDARY_COUNT);
  const used = new Set([primary.id, ...secondary.map((item) => item.id)]);

  let explore = rest.slice(SECONDARY_COUNT);
  if (explore.length < EXPLORE_MIN) {
    const need = EXPLORE_MAX - explore.length;
    explore = [
      ...explore,
      ...pickExploreItems([...STARTERS], used, need),
    ];
  }
  explore = explore
    .filter((item, index, arr) => {
      if (used.has(item.id)) return false;
      used.add(item.id);
      return arr.findIndex((x) => x.id === item.id) === index;
    })
    .slice(0, EXPLORE_MAX);

  // secondary 不足时用通用补
  if (secondary.length < SECONDARY_COUNT) {
    for (const item of getGenericStarters()) {
      if (secondary.length >= SECONDARY_COUNT) break;
      if (used.has(item.id) || item.id === primary.id) continue;
      secondary.push(item);
      used.add(item.id);
    }
  }

  return buildBundleFromItems(primary, secondary, explore, getLastChatText());
}

/** 新对话默认组合：一眼懂 AI，同时什么都能聊 */
const DIVERSE_PICK_PLAN: ReadonlyArray<{
  category: StarterCategory;
  count: number;
}> = [
  { category: "ai", count: 2 },
  { category: "dev", count: 2 },
  { category: "business", count: 1 },
  { category: "creative", count: 1 },
];

/**
 * 从某分类快速抽取（shuffle，O(n)，不慢）。
 */
export function pickFrom(
  category: StarterCategory,
  count: number,
  excludeIds: Set<string> = new Set(),
): StarterItem[] {
  if (count <= 0) return [];
  const pool = STARTERS.filter(
    (item) => item.category === category && !excludeIds.has(item.id),
  );
  if (pool.length === 0) return [];
  // 先洗牌再取，避免每次同一套；同分不刻意排死
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

/**
 * 主推荐选择：当前最相关 + weight 最高。
 * 优先级：1️⃣ 历史匹配 → 2️⃣ AI/产品相关 → 3️⃣ 高权重通用
 */
export function pickPrimaryStarter(opts?: {
  /** 历史标签命中（未掺通用补齐） */
  historyMatched?: readonly StarterItem[];
  /** 可选候选池；无历史时用于挑 AI/产品 */
  candidates?: readonly StarterItem[];
}): StarterItem {
  const byWeightDesc = (a: StarterItem, b: StarterItem) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
  };

  const history = opts?.historyMatched ?? [];
  if (history.length > 0) {
    return [...history].sort(byWeightDesc)[0]!;
  }

  const pool = opts?.candidates?.length ? [...opts.candidates] : [...STARTERS];
  const aiProduct = pool.filter(
    (item) => item.category === "ai" || item.category === "product",
  );
  if (aiProduct.length > 0) {
    return aiProduct.sort(byWeightDesc)[0]!;
  }

  const generics = getGenericStarters();
  if (generics.length > 0) return generics[0]!;

  return pool.sort(byWeightDesc)[0] ?? STARTERS[0]!;
}

/**
 * @deprecated 请用 pickPrimaryStarter；保留：仅从 ai/product 取最高 weight
 */
export function pickPrimaryFromAiProduct(
  candidates?: readonly StarterItem[],
): StarterItem {
  return pickPrimaryStarter({ candidates });
}

function pushUnique(
  target: StarterItem[],
  used: Set<string>,
  items: StarterItem[],
) {
  for (const item of items) {
    if (used.has(item.id)) continue;
    used.add(item.id);
    target.push(item);
  }
}

/**
 * 无历史：按分类配额组合，主推按优先级挑「最该点的那个」。
 */
export function buildDiverseStarterSelection(): SmartStarterSelection {
  const used = new Set<string>();
  const picked: StarterItem[] = [];

  for (const { category, count } of DIVERSE_PICK_PLAN) {
    pushUnique(picked, used, pickFrom(category, count, used));
  }

  const primary = pickPrimaryStarter({ candidates: picked });
  if (!used.has(primary.id)) {
    picked.unshift(primary);
    used.add(primary.id);
  }

  // rest：组合结果里去掉主推，最多 5；不足再抽 growth/learning 补探索感
  const rest: StarterItem[] = [];
  for (const item of picked) {
    if (item.id === primary.id) continue;
    if (rest.length >= 5) break;
    rest.push(item);
  }
  if (rest.length < 5) {
    pushUnique(rest, used, pickFrom("growth", 1, used));
  }
  if (rest.length < 5) {
    pushUnique(rest, used, pickFrom("learning", 1, used));
  }
  if (rest.length < 5) {
    pushUnique(rest, used, pickFrom("career", 1, used));
  }

  return {
    primary,
    rest: rest.slice(0, 5),
    matched: [primary, ...rest],
  };
}

/**
 * 有历史：优先历史相关；再用分类配额补足「全能」观感。
 */
export function enrichSelectionWithDiversePicks(
  smart: SmartStarterSelection,
): SmartStarterSelection {
  const tagMatched = matchStartersByTags(getLastChatText());

  // 主推：历史最相关+最高 weight → 否则 AI/产品 → 否则高权重通用
  const primary = pickPrimaryStarter({
    historyMatched: tagMatched.length > 0 ? tagMatched : undefined,
    candidates:
      smart.matched.length > 0
        ? smart.matched
        : [smart.primary, ...smart.rest],
  });

  const rest: StarterItem[] = [];
  const used = new Set<string>([primary.id]);

  const pushRest = (items: readonly StarterItem[]) => {
    for (const item of items) {
      if (rest.length >= 5) break;
      if (used.has(item.id)) continue;
      used.add(item.id);
      rest.push(item);
    }
  };

  // 先保留历史相关，再保留智能筛选结果
  pushRest(tagMatched);
  pushRest(smart.rest);
  pushRest(smart.matched);

  // 再用分类配额补足多样性
  for (const { category, count } of DIVERSE_PICK_PLAN) {
    if (rest.length >= 5) break;
    const have = [primary, ...rest].filter((i) => i.category === category)
      .length;
    const need = Math.max(0, count - have);
    if (need <= 0) continue;
    pushRest(pickFrom(category, need, used));
  }

  return {
    primary,
    rest: rest.slice(0, 5),
    matched: [primary, ...rest],
  };
}

/**
 * 新对话 Starter 生成策略：
 * - 有历史 → 历史标签优先 + 分类配额补足
 * - 无历史 → ai×2 + dev×2 + business×1 + creative×1
 * - 主推荐 → ai/product 中 weight 最高
 */
export function buildNewChatStarterSelection(
  lastText?: string,
): SmartStarterSelection {
  const text = (lastText ?? getLastChatText()).trim();
  if (text) {
    return enrichSelectionWithDiversePicks(selectSmartStarters(text));
  }
  return buildDiverseStarterSelection();
}

/**
 * 分层随机起点（无上下文）：分类配额组合。
 */
export function getRandomStarterBundle(): StarterBundle {
  let guard = 0;
  let bundle: StarterBundle;

  do {
    bundle = bundleFromSmartSelection(buildDiverseStarterSelection());
    guard += 1;
  } while (
    guard < SHUFFLE_RETRY &&
    lastBundleSignature &&
    bundleSignature(bundle) === lastBundleSignature
  );

  lastBundleSignature = bundleSignature(bundle);
  return bundle;
}

/**
 * 上下文感知分层起点：有历史优先相关，再补多样性。
 */
export function getContextualStarterBundle(): StarterBundle {
  const selection = buildNewChatStarterSelection();
  const bundle = bundleFromSmartSelection(selection);
  lastBundleSignature = bundleSignature(bundle);
  return bundle;
}

/** @deprecated 请用 getContextualStarterBundle */
export function getContextualStarters(): StarterQuickSend[] {
  return flattenStarterBundle(getContextualStarterBundle());
}

/** @deprecated 请用 getRandomStarterBundle */
export function getRandomStarters(): StarterQuickSend[] {
  return flattenStarterBundle(getRandomStarterBundle());
}

export function flattenStarterBundle(bundle: StarterBundle): StarterQuickSend[] {
  return [bundle.primary, ...bundle.secondary, ...bundle.explore];
}

export function resetStarterPickMemory() {
  lastBundleSignature = "";
}

function findCatalog(id: string): StarterItem {
  return (
    STARTER_CATALOG.find((i) => i.id === id) ??
    STARTER_CATALOG[0]!
  );
}

/** 静态兜底分层（不参与去重） */
export const STARTER_BUNDLE_FALLBACK: StarterBundle = buildBundleFromItems(
  findCatalog("ai_customer_opt"),
  [
    findCatalog("product_full_plan"),
    findCatalog("biz_monetize"),
    findCatalog("biz_next_step"),
  ],
  [findCatalog("product_expand"), findCatalog("ai_gpt_like")],
);

/**
 * @deprecated 扁平列表兜底；请优先用 STARTER_BUNDLE_FALLBACK
 */
export const STARTER_QUICK_SENDS: StarterQuickSend[] =
  flattenStarterBundle(STARTER_BUNDLE_FALLBACK);

export function buildStarterQuickSends(
  _historyTitles: string[] = [],
): StarterQuickSend[] {
  return flattenStarterBundle(getContextualStarterBundle());
}
