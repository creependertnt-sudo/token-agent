import { prisma } from "@/lib/db";
import { extractCustomerDemandSignals } from "@/lib/customer-analysis";
import { detectSalesIntent } from "@/lib/sales-decision";

export const CUSTOMER_STAGES = [
  "NEW",
  "INTERESTED",
  "COMPARING",
  "READY_TO_BUY",
  "CUSTOMER",
] as const;

export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

export type ConfidenceLevel = "low" | "medium" | "high";

export type CustomerMemoryRow = {
  industry: string;
  needs: string;
  budget: string;
  painPoints: string;
  purchaseHistory: string;
  recommendedModel: string;
  preferences: string;
  customerStage: CustomerStage;
  confidence: ConfidenceLevel;
  lastIntent: string;
};

const STAGE_LABEL: Record<CustomerStage, string> = {
  NEW: "新客户",
  INTERESTED: "有兴趣",
  COMPARING: "比较中",
  READY_TO_BUY: "准备购买",
  CUSTOMER: "已成交客户",
};

function mapRow(row: {
  industry: string;
  needs: string;
  budget: string;
  painPoints: string;
  purchaseHistory: string;
  recommendedModel: string;
  preferences: string;
  customerStage: string;
  confidence: string;
  lastIntent: string;
}): CustomerMemoryRow {
  return {
    industry: row.industry,
    needs: row.needs,
    budget: row.budget,
    painPoints: row.painPoints,
    purchaseHistory: row.purchaseHistory,
    recommendedModel: row.recommendedModel,
    preferences: row.preferences,
    customerStage: normalizeStage(row.customerStage),
    confidence: normalizeConfidence(row.confidence),
    lastIntent: row.lastIntent,
  };
}

function normalizeStage(value: string): CustomerStage {
  if ((CUSTOMER_STAGES as readonly string[]).includes(value)) {
    return value as CustomerStage;
  }
  return "NEW";
}

function normalizeConfidence(value: string): ConfidenceLevel {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

export async function getCustomerMemory(
  userId: string,
): Promise<CustomerMemoryRow | null> {
  const row = await prisma.customerMemory.findUnique({ where: { userId } });
  return row ? mapRow(row) : null;
}

/** 注入 SALES prompt：老用户历史需求与阶段 */
export function formatCustomerMemoryForPrompt(
  memory: CustomerMemoryRow | null,
): string {
  if (!memory) {
    return "【长期客户记忆 CustomerMemory】暂无记录（新客户或尚未沉淀）。";
  }

  const empty =
    !memory.industry &&
    !memory.needs &&
    !memory.budget &&
    !memory.painPoints &&
    !memory.purchaseHistory &&
    !memory.recommendedModel &&
    !memory.preferences &&
    memory.customerStage === "NEW" &&
    !memory.lastIntent;
  if (empty) {
    return "【长期客户记忆 CustomerMemory】暂无有效字段（阶段=NEW）。";
  }

  return `【长期客户记忆 CustomerMemory · 老用户回访请优先参考】
客户阶段：${memory.customerStage}（${STAGE_LABEL[memory.customerStage]}）
置信度：${memory.confidence}
最近意图：${memory.lastIntent || "未记录"}
行业：${memory.industry || "未记录"}
需求：${memory.needs || "未记录"}
预算：${memory.budget || "未记录"}
痛点：${memory.painPoints || "未记录"}
购买历史：${memory.purchaseHistory || "未记录"}
历史推荐模型：${memory.recommendedModel || "未记录"}
用户偏好：${memory.preferences || "未记录"}
说明：按客户阶段组织话术（NEW 问诊 / INTERESTED 深化 / COMPARING 差异化 / READY_TO_BUY 促成 / CUSTOMER 续费与升级）。勿编造未记录事实；本轮说法与记忆冲突时以本轮为准。`;
}

/**
 * 客户阶段判断：NEW → INTERESTED → COMPARING → READY_TO_BUY → CUSTOMER
 * 已有购买记录则至少为 CUSTOMER；只升不降（除非仍是 NEW）。
 */
export function inferCustomerStage(input: {
  message: string;
  intent?: string | null;
  hasPurchase: boolean;
  previousStage?: CustomerStage | null;
}): CustomerStage {
  if (input.hasPurchase) return "CUSTOMER";

  const t = input.message.trim().toLowerCase();
  const intent = (input.intent ?? "").toUpperCase();

  let next: CustomerStage = "NEW";

  if (
    /充值|下单|购买|买|付款|支付|立刻买|马上买|怎么买|去购买|ready/.test(t) ||
    intent === "PRICE_QUERY"
  ) {
    next = /充值|下单|购买|买|付款|支付|立刻|马上/.test(t)
      ? "READY_TO_BUY"
      : "INTERESTED";
  }

  if (
    /对比|区别|差在|哪个好|vs|竞品|coze|dify|fastgpt|chatbase|扣子/.test(t) ||
    intent === "PRODUCT_COMPARE" ||
    intent === "MODEL_SELECT"
  ) {
    next = next === "READY_TO_BUY" ? "READY_TO_BUY" : "COMPARING";
  }

  if (
    next === "NEW" &&
    (/适合|推荐|想做|需要|预算|方案|咨询|了解|兴趣/.test(t) ||
      intent === "TECH_REQUIREMENT" ||
      intent === "ENTERPRISE_PLAN" ||
      intent === "MODEL_SELECT")
  ) {
    next = "INTERESTED";
  }

  const prev = input.previousStage ?? "NEW";
  return maxStage(prev, next);
}

const STAGE_RANK: Record<CustomerStage, number> = {
  NEW: 0,
  INTERESTED: 1,
  COMPARING: 2,
  READY_TO_BUY: 3,
  CUSTOMER: 4,
};

function maxStage(a: CustomerStage, b: CustomerStage): CustomerStage {
  return STAGE_RANK[a] >= STAGE_RANK[b] ? a : b;
}

function extractPainPoints(message: string): string {
  const t = message.trim();
  const hits: string[] = [];
  if (/贵|成本.?高|预算紧|太贵|费用|成本太/.test(t)) hits.push("价格/成本敏感");
  if (/不会|小白|不懂|难用|复杂/.test(t)) hits.push("上手难度");
  if (/慢|延迟|效率低/.test(t)) hits.push("效率/速度");
  if (/不稳定|报错|失败|幻觉/.test(t)) hits.push("稳定性/可靠性");
  if (/隐私|安全|合规|私有化/.test(t)) hits.push("安全/合规");
  if (/竞品|对比|不如|换成/.test(t)) hits.push("竞品比较压力");
  if (/架构|高并发|分布式|企业级/.test(t) && /难|复杂|搞不定/.test(t)) {
    hits.push("复杂架构挑战");
  }
  return hits.join("、");
}

function extractPurchaseIntent(message: string): string {
  const t = message.trim();
  if (/立刻买|马上买|现在就买|直接下单/.test(t)) return "强购买意向";
  if (/充值|购买|下单|付款|怎么买|想买/.test(t)) return "有购买意向";
  if (/多少钱|套餐|价格|贵不贵/.test(t)) return "询价中";
  if (/再看看|对比一下|考虑一下/.test(t)) return "观望比较";
  return "";
}

function scoreConfidence(parts: {
  industry: boolean;
  needs: boolean;
  budget: boolean;
  pain: boolean;
  intent: boolean;
}): ConfidenceLevel {
  let n = 0;
  if (parts.industry) n += 1;
  if (parts.needs) n += 1;
  if (parts.budget) n += 1;
  if (parts.pain) n += 1;
  if (parts.intent) n += 1;
  if (n >= 4) return "high";
  if (n >= 2) return "medium";
  return "low";
}

export type MemoryExtractionInput = {
  userId: string;
  userMessage: string;
  /** 可选：本轮销售意图 */
  intent?: string | null;
  /** 可选：本轮推荐档位 */
  recommendedModel?: string | null;
  /** 可选：流水线已识别字段 */
  industry?: string | null;
  needs?: string[] | string | null;
  budget?: string | null;
};

/**
 * 对话结束后的 Memory 提取流程：
 * 分析用户消息 → 提取行业/需求/预算/痛点/购买意向 → 判断客户阶段 → 更新 CustomerMemory
 */
export async function extractAndUpdateCustomerMemory(
  input: MemoryExtractionInput,
): Promise<CustomerMemoryRow> {
  const signals = extractCustomerDemandSignals(input.userMessage);
  const intent =
    input.intent?.trim() || detectSalesIntent(input.userMessage);

  const needsFromInput = Array.isArray(input.needs)
    ? input.needs.filter(Boolean).join("、")
    : (input.needs ?? "").trim();
  const needsMerged = [
    needsFromInput,
    signals.needs.join("、"),
  ]
    .filter(Boolean)
    .join("、");

  const industry = (input.industry ?? signals.industry ?? "").trim();
  const budget = (input.budget ?? signals.budget ?? "").trim();
  const painPoints = extractPainPoints(input.userMessage);
  const purchaseIntent = extractPurchaseIntent(input.userMessage);
  const preferences = purchaseIntent;

  const existing = await prisma.customerMemory.findUnique({
    where: { userId: input.userId },
  });

  const purchaseHistory = await buildPurchaseHistorySummary(input.userId);
  const hasPurchase = Boolean(purchaseHistory || existing?.purchaseHistory);

  const customerStage = inferCustomerStage({
    message: input.userMessage,
    intent,
    hasPurchase,
    previousStage: existing
      ? normalizeStage(existing.customerStage)
      : "NEW",
  });

  const confidence = scoreConfidence({
    industry: Boolean(industry || existing?.industry),
    needs: Boolean(needsMerged || existing?.needs),
    budget: Boolean(budget || existing?.budget),
    pain: Boolean(painPoints || existing?.painPoints),
    intent: Boolean(intent),
  });

  const data = {
    industry: pickNew(industry, existing?.industry),
    needs: pickNew(needsMerged, existing?.needs),
    budget: pickNew(budget, existing?.budget),
    painPoints: pickNew(painPoints, existing?.painPoints),
    purchaseHistory: purchaseHistory || existing?.purchaseHistory || "",
    recommendedModel: pickNew(
      input.recommendedModel,
      existing?.recommendedModel,
    ),
    preferences: pickNew(preferences, existing?.preferences),
    customerStage,
    confidence,
    lastIntent: intent || existing?.lastIntent || "",
  };

  const row = await prisma.customerMemory.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
  });

  console.log(
    `[memory:extract] user=${input.userId.slice(0, 8)} stage=${row.customerStage} conf=${row.confidence} intent=${row.lastIntent} industry=${row.industry || "-"}`,
  );

  return mapRow(row);
}

/** @deprecated 请用 extractAndUpdateCustomerMemory */
export async function upsertCustomerMemoryFromSales(params: {
  userId: string;
  industry?: string | null;
  needs?: string[] | string | null;
  budget?: string | null;
  recommendedModel?: string | null;
  preferences?: string | null;
  intent?: string | null;
}): Promise<CustomerMemoryRow> {
  return extractAndUpdateCustomerMemory({
    userId: params.userId,
    userMessage: [
      params.industry,
      Array.isArray(params.needs) ? params.needs.join(" ") : params.needs,
      params.budget,
      params.preferences,
    ]
      .filter(Boolean)
      .join(" ") || "咨询",
    intent: params.intent,
    recommendedModel: params.recommendedModel,
    industry: params.industry,
    needs: params.needs,
    budget: params.budget,
  });
}

function pickNew(
  incoming: string | null | undefined,
  previous: string | null | undefined,
): string {
  const next = (incoming ?? "").trim();
  if (next) return next.slice(0, 500);
  return (previous ?? "").trim();
}

async function buildPurchaseHistorySummary(userId: string): Promise<string> {
  const orders = await prisma.order.findMany({
    where: { userId, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      package: { select: { name: true, tokenAmount: true, price: true } },
    },
  });
  if (orders.length === 0) return "";
  return orders
    .map((o) => {
      const pkg = o.package;
      const label = pkg
        ? `${pkg.name}（${pkg.tokenAmount} Token / ¥${pkg.price}）`
        : `订单 ${o.id.slice(0, 8)}`;
      return `${label} @ ${o.createdAt.toISOString().slice(0, 10)}`;
    })
    .join("；");
}
