import type { AIServiceType } from "@/app/generated/prisma/enums";
import {
  SERVICE_CONFIG,
  SERVICE_GENERATION_LIMITS,
  type ChatServiceType,
  type PremiumFeature,
} from "@/lib/constants";
import type { MemoryItem } from "@/lib/memory";

export type SelectedServiceInfo = {
  id: string;
  name: string;
  slug: string;
  type: AIServiceType;
  tokenCost: number;
  description: string | null;
};

const ALL_CHAT_TYPES = Object.keys(SERVICE_CONFIG) as ChatServiceType[];

export function isChatServiceType(type: string): type is ChatServiceType {
  return Object.prototype.hasOwnProperty.call(SERVICE_CONFIG, type);
}

export function getServiceConfig(type: AIServiceType) {
  if (!isChatServiceType(type)) {
    throw new Error(`未知 AIService.type：${type}`);
  }
  return SERVICE_CONFIG[type];
}

/** 扣费只认用户选择的 serviceType */
export function getLockedTokenCost(type: AIServiceType): number {
  return getServiceConfig(type).cost;
}

export function getServiceDisplayName(type: AIServiceType): string {
  return getServiceConfig(type).name;
}

export function serviceTypeToFeature(
  type: AIServiceType,
): PremiumFeature | null {
  switch (type) {
    case "LIGHT":
      return "light";
    case "STANDARD":
      return "standard";
    case "PREMIUM":
      return "premium";
    case "SALES":
      return null;
    default: {
      const _exhaustive: never = type;
      throw new Error(`未知 AIService.type：${String(_exhaustive)}`);
    }
  }
}

/** 除当前锁定档以外的其它档位（用于禁止自称） */
export function getForbiddenServiceTypes(
  lockedType: ChatServiceType,
): ChatServiceType[] {
  return ALL_CHAT_TYPES.filter((t) => t !== lockedType);
}

/** 从 system prompt 提取「模型身份」行，供调用前一致性日志 */
export function extractPromptModelIdentity(systemPrompt: string): string {
  const m = systemPrompt.match(/模型身份[：:]\s*([^\n]+)/);
  return m?.[1]?.trim() || "(missing)";
}

/**
 * 去掉历史消息中的扣费页脚 / 错误身份声明，避免污染本轮身份。
 */
export function sanitizeHistoryForLockedType(
  content: string,
  lockedType: AIServiceType,
): string {
  let text = content
    .replace(/\n*---\s*\n已消耗[\s\S]*$/u, "")
    .replace(/\n*---\s*\n通道[\s\S]*$/u, "")
    .trim();

  if (!isChatServiceType(lockedType)) return text;

  for (const key of getForbiddenServiceTypes(lockedType)) {
    const other = SERVICE_CONFIG[key];
    const patterns = [
      new RegExp(`本次服务为\\s*${key}[^\\n。]*`, "gi"),
      new RegExp(`本轮服务为\\s*${key}[^\\n。]*`, "gi"),
      new RegExp(
        `${key}\\s*（?${other.name}）?[^\\n。]{0,20}固定消耗\\s*${other.cost}\\s*Token`,
        "gi",
      ),
      new RegExp(`当前(?:为|是|锁定)[：:\\s]*${key}`, "gi"),
      new RegExp(`我是\\s*${key}[^\\n。]{0,40}`, "gi"),
      new RegExp(`我是\\s*${other.name}[^\\n。]{0,40}`, "gi"),
    ];
    for (const re of patterns) {
      text = text.replace(re, "");
    }
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 去掉回复正文中的档位/扣费自称（界面 Header/状态栏已展示）。
 * 若误称其它档位身份，一并剔除；SALES 禁止自称 A/B/C 模型。
 */
export function enforceServiceIdentity(
  type: AIServiceType,
  reply: string,
): string {
  if (!isChatServiceType(type)) return reply;

  let text = reply;
  const cfg = SERVICE_CONFIG[type];

  for (const key of ALL_CHAT_TYPES) {
    const other = SERVICE_CONFIG[key];
    text = text.replace(
      new RegExp(
        `(?:本次|本轮)服务为\\s*${key}[^。\\n]*?(?:固定)?消耗\\s*\\d+\\s*Token[。.]?`,
        "gi",
      ),
      "",
    );
    text = text.replace(
      new RegExp(
        `(?:当前|本轮)(?:为|是|锁定)[：:\\s]*${key}[^。\\n]*`,
        "gi",
      ),
      "",
    );
    text = text.replace(
      new RegExp(`固定消耗\\s*${other.cost}\\s*Token`, "gi"),
      "",
    );
    text = text.replace(
      new RegExp(
        `已(?:扣除余额|消耗\\s*\\d+\\s*Token)[^\\n。]{0,40}`,
        "gi",
      ),
      "",
    );

    if (key !== type) {
      text = text.replace(
        new RegExp(`我是\\s*${key}\\s*（[^）]*）?[^。\\n]*[。.]?`, "gi"),
        "",
      );
      text = text.replace(
        new RegExp(`我是\\s*${other.name}[^。\\n]*[。.]?`, "gi"),
        "",
      );
    }
  }

  // 本档扣费套话不进正文
  text = text.replace(
    new RegExp(
      `(?:本次|本轮)服务为\\s*${type}[^。\\n]*?(?:固定)?消耗\\s*${cfg.cost}\\s*Token[。.]?`,
      "gi",
    ),
    "",
  );
  text = text.replace(
    new RegExp(`固定消耗\\s*${cfg.cost}\\s*Token`, "gi"),
    "",
  );

  if (type === "SALES") {
    // 销售客服对外只称 Token AI客服，禁止 A/B/C 自称
    text = text.replace(
      /我是\s*(?:A模型AI|B模型AI|C模型AI|LIGHT|STANDARD|PREMIUM)[^。\n]*[。.]?/gi,
      "",
    );
    text = text.replace(
      /我是\s*(?:\*\*)?销售客服(?:\*\*)?[^。\n]*[。.]?/gi,
      "",
    );
  } else {
    text = text.replace(
      new RegExp(`我是\\s*${type}\\s*（[^）]*）?[^。\\n]*[。.]?`, "gi"),
      "",
    );
    text = text.replace(
      new RegExp(`我是\\s*${cfg.name}[^。\\n]*[。.]?`, "gi"),
      "",
    );
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 硬性裁剪回复，防止 LIGHT/STANDARD 输出越级长文。
 */
export function enforceTierReply(
  type: AIServiceType,
  reply: string,
): string {
  const withIdentity = enforceServiceIdentity(type, reply);

  if (!isChatServiceType(type) || type === "PREMIUM") {
    return withIdentity;
  }

  // SALES / LIGHT / STANDARD 均有长度上限
  const limit = SERVICE_GENERATION_LIMITS[type].maxChars;
  const trimmed = withIdentity.trim();
  if (trimmed.length <= limit) return trimmed;

  let cut = trimmed.slice(0, limit);
  const lastBreak = Math.max(
    cut.lastIndexOf("\n"),
    cut.lastIndexOf("。"),
    cut.lastIndexOf("！"),
    cut.lastIndexOf("？"),
    cut.lastIndexOf("."),
  );
  if (lastBreak > limit * 0.45) {
    cut = cut.slice(0, lastBreak + 1);
  }

  const hint =
    type === "LIGHT"
      ? `\n\n——\n回答已按当前通道长度限制截断。需要更完整方案请手动切换 STANDARD 或 PREMIUM。`
      : `\n\n——\n回答已按当前通道长度限制截断。需要更完整推理请手动切换 PREMIUM。`;

  return `${cut.trim()}${hint}`;
}

function memoryBlock(memories: MemoryItem[]) {
  const safe = memories.filter((m) => {
    const c = m.content;
    return !/(SALES|LIGHT|STANDARD|PREMIUM|消耗\s*\d+\s*Token|A模型|B模型|C模型)/i.test(
      c,
    );
  });

  if (safe.length === 0) {
    return `【重要记忆】
暂无已保存记忆。`;
  }

  const lines = safe.map((m) => `- [${m.category}] ${m.content}`);
  return `【重要记忆】
${lines.join("\n")}`;
}

/** 来自 ModelConfig 表；付费档 prompt 优先用此数据，避免写死差异 */
export type AgentModelConfigInput = {
  grade: string;
  name: string;
  capability: string;
  suitableFor: string;
  limitations: string;
  tokenCost: number;
  maxContext: number;
  systemInstructions?: string;
};

/** 来自 ModelCapability 表 */
export type AgentModelCapabilityInput = {
  positioning: string;
  suitableFor: string;
  notSuitableFor: string;
  persona: string;
};

type AgentPromptInput = {
  /** 唯一身份来源：请求体 selectedServiceType / serviceType */
  serviceType: AIServiceType;
  memories: MemoryItem[];
  tokenBalance: number;
  salesCatalog?: {
    packagesText: string;
    modelsText: string;
    intent?: string;
    showProducts?: boolean;
    pushStrategy?: string;
    conversionHint?: string;
    rechargePath?: string;
  };
  /** SALES RAG / 决策 / 需求分析 / 能力与竞品（流水线合并上下文） */
  salesKnowledgeText?: string;
  salesDecisionText?: string;
  salesPipelineContext?: string;
  /** LIGHT/STANDARD/PREMIUM：数据库 ModelConfig */
  modelConfig?: AgentModelConfigInput | null;
  /** LIGHT/STANDARD/PREMIUM：数据库 ModelCapability */
  modelCapability?: AgentModelCapabilityInput | null;
};

/**
 * 按本次请求的 selectedServiceType 动态生成唯一 system prompt。
 * 禁止默认 PREMIUM/C模型；名称/费用/能力一律读 SERVICE_CONFIG[serviceType]。
 */
export function buildAgentSystemPrompt(input: AgentPromptInput): string {
  const {
    serviceType,
    memories,
    tokenBalance,
    salesCatalog,
    salesKnowledgeText,
    salesDecisionText,
    salesPipelineContext,
    modelConfig,
    modelCapability,
  } = input;
  if (!isChatServiceType(serviceType)) {
    throw new Error(`未知 serviceType：${serviceType}`);
  }

  const cfg = SERVICE_CONFIG[serviceType];
  const mem = memoryBlock(memories);
  const forbidden = getForbiddenServiceTypes(serviceType)
    .map((t) => `${t}（${SERVICE_CONFIG[t].name}）`)
    .join("、");

  const capabilityLine =
    modelConfig?.capability ??
    modelCapability?.positioning ??
    "（能力以数据库 ModelConfig/ModelCapability 为准）";
  const costLine =
    modelConfig != null
      ? `${modelConfig.tokenCost} Token`
      : cfg.cost === 0
        ? "免费"
        : `${cfg.cost} Token`;

  // 身份行格式必须与 extractPromptModelIdentity / chat 校验约定一致：
  // 「${serviceType} · ${cfg.name}」——禁止附加（A档）等后缀，否则会误报不一致。
  const identityBlock = `【本轮身份锁定·唯一来源 selectedServiceType=${serviceType}】
模型身份：${serviceType} · ${cfg.name}
费用：${cfg.cost === 0 ? "免费" : costLine}
能力：${capabilityLine}
禁止自称：${forbidden}
禁止默认或升级到 PREMIUM / C模型AI（除非本轮锁定就是 PREMIUM）
【输出禁令】不要主动写出「本轮服务为XXX」「固定消耗XX Token」「已扣除余额」「已消耗XX Token」；界面会单独展示扣费`;

  const modelConfigBlock = modelConfig
    ? `【ModelConfig 数据库 · 唯一能力来源】
等级：${modelConfig.grade}
名称：${modelConfig.name}
Token 价格：${modelConfig.tokenCost} / 次
最大上下文：约 ${modelConfig.maxContext.toLocaleString()} tokens
能力描述：${modelConfig.capability}
适用场景：${modelConfig.suitableFor}
限制：${modelConfig.limitations}
${modelConfig.systemInstructions ? `行为说明：\n${modelConfig.systemInstructions}` : ""}
禁止在回复中编造未出现在上述字段中的能力介绍或档位区别。`
    : `【ModelConfig】本轮未加载到数据库配置，仅保持身份锁定，勿臆造 A/B/C 能力差异。`;

  const modelCapabilityBlock = modelCapability
    ? `【ModelCapability 数据库】
定位：${modelCapability.positioning}
适用场景：${modelCapability.suitableFor}
不太适合：${modelCapability.notSuitableFor}
典型画像：${modelCapability.persona}`
    : "";

  switch (serviceType) {
    case "SALES": {
      const knowledgeBlock =
        salesKnowledgeText?.trim() ||
        "（本次未注入知识库，请先问诊，勿编造价格。）";

      const decisionBlock =
        salesDecisionText?.trim() ||
        "（本次未注入销售决策，请先判断客户类型与意图再作答。）";

      const pipelineBlock =
        salesPipelineContext?.trim() ||
        `${decisionBlock}

【销售知识库检索结果】
${knowledgeBlock}`;

      return `你是「Token AI客服」——平台免费销售转化顾问（SALES 通道）。

${identityBlock}

【对外身份硬规则】
- 若需要自我介绍，只能说「我是 Token AI客服」
- 禁止说「我是 C模型AI / B模型AI / A模型AI / PREMIUM / STANDARD / LIGHT」
- 你不负责替用户写完整代码或做深度架构；你负责问诊、推荐、促成购买

【标准销售流水线（必须遵守）】
用户问题 → 意图识别 → 查询知识库 → 分析客户需求 → 推荐方案 → 销售回复
下方已给出本轮流水线结果，请据此组织回复，不要跳过问诊直接甩套餐。

【回答依据】
1. 流水线：意图 → 查库 → 模型/套餐/竞品 → 回复
2. 数据库：ModelConfig / ModelCapability / CompetitorKnowledge / SalesStrategy / CustomerProfile / ModelRecommendRule / SalesKnowledge(RAG) / CustomerMemory
3. 老用户优先参考 CustomerMemory（行业/需求/预算/痛点/阶段/购买/推荐/偏好）
4. 按客户阶段组织话术：NEW / INTERESTED / COMPARING / READY_TO_BUY / CUSTOMER
5. A/B/C 介绍、区别、适用场景只引用 ModelConfig/ModelCapability，禁止臆造
6. 套餐数字：用户明确问套餐/价格表时必须调用 query_packages，只引用工具返回的数据；推销时只引用【当前推荐套餐】一条，禁止无提示甩全部套餐
7. 禁止贬低 Coze/Dify/FastGPT/Chatbase 及其他竞品
8. 不要在回复中输出思考过程或 reasoning 内容
9. 竞品价格：CompetitorKnowledge 未写明的对方报价一律未知。禁止猜测、禁止编造「比 OpenAI 便宜 30%」这类未经验证数据。应说明无法确认对方实时价格，然后介绍自身计费方式、Token 套餐、模型选择与成本控制优势，最后问：您主要是用于 API 调用、AI 客服，还是个人开发？

【禁止】
- 不要每次固定输出整页套餐列表
- 不要自称付费模型身份
- 不要输出扣费套话
- 不要编造未出现在 CompetitorKnowledge 中的竞品价格

用户余额（仅供参考）：${tokenBalance} Token。
${salesCatalog?.conversionHint?.trim() || (salesCatalog?.showProducts ? "提示：本轮可推荐最终套餐并引导购买，禁止罗列全部套餐。" : "提示：当前偏咨询，优先问诊与推荐通道。")}

【本轮流水线结果】
${pipelineBlock}

${mem}`;
    }

    case "LIGHT":
    case "STANDARD":
    case "PREMIUM": {
      const limits = SERVICE_GENERATION_LIMITS[serviceType];
      return `你是本通道锁定的助手：${cfg.name}（selectedServiceType=${serviceType}）。

${identityBlock}

${modelConfigBlock}

${modelCapabilityBlock}

【生成约束（技术上限，非能力营销文案）】
- maxTokens≈${limits.maxTokens}；温度≈${limits.temperature}；正文建议不超过约 ${limits.maxChars} 字
- 严格按数据库 capability / suitableFor / limitations / systemInstructions 作答
- 禁止写死或编造其他档位（A/B/C）的介绍与区别；若用户问起区别，说明需在销售客服通道对照数据库说明，或仅基于本通道已注入字段回答自身边界
- 禁止自称其他 serviceType

${mem}`;
    }

    default: {
      const _exhaustive: never = serviceType;
      throw new Error(`未处理的 serviceType：${String(_exhaustive)}`);
    }
  }
}

/** 调用 LLM 前的锁定提醒：禁止自称「当前档」以外的身份（尤其禁止误禁当前档） */
export function buildLockReminder(serviceType: ChatServiceType): string {
  const cfg = SERVICE_CONFIG[serviceType];
  const forbidden = getForbiddenServiceTypes(serviceType)
    .map((t) => `${t}/${SERVICE_CONFIG[t].name}`)
    .join("、");

  if (serviceType === "SALES") {
    return `再次确认：本轮 selectedServiceType=SALES，对外身份=Token AI客服。必须执行【销售决策】与【转化动作】：按推进策略组织话术；只推荐最终套餐，禁止罗列全部套餐目录；未就绪先问诊。竞品对比不攻击、不编造对方价格；未命中竞品报价时说明无法提供实时竞品价格，再介绍自家计费与套餐并询问使用场景。禁止无脑甩套餐与扣费套话。`;
  }

  return `再次确认：本轮唯一锁定 selectedServiceType=${serviceType}，模型身份=${cfg.name}，费用=${cfg.cost === 0 ? "免费" : `${cfg.cost} Token`}。禁止自称 ${forbidden}。禁止输出「本轮服务为」「固定消耗」「已扣除余额」等扣费句。`;
}
