import type { CustomerMemoryRow } from "@/lib/customer-memory";
import type { CustomerDemandSignals } from "@/lib/customer-analysis";
import type { UsageEstimate } from "@/lib/usage-estimator";
import type { CustomerLevel } from "@/lib/customer-level";

export type TokenPackageRow = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
  description: string | null;
  sortOrder: number;
};

export type RecentOrderSnapshot = {
  packageName: string;
  tokenAmount: number;
  createdAt: Date;
};

export type UpsellContext = {
  shouldUpsell: boolean;
  upgradeReason: string | null;
  previousPackageName?: string | null;
};

export type PackageRecommendInput = {
  tokenBalance: number | null;
  recentOrders: RecentOrderSnapshot[];
  customerMemory: CustomerMemoryRow | null;
  signals: CustomerDemandSignals;
  message: string;
  packages: TokenPackageRow[];
  upsellContext?: UpsellContext | null;
  /** 来自 sales-decision，企业客户时套餐优先企业档 */
  customerType?: string | null;
  enterpriseSignal?: boolean | null;
  usageEstimate?: UsageEstimate | null;
  customerLevel?: CustomerLevel | null;
};

export type PackageRecommendResult = {
  /** 唯一推荐套餐（与 recommendedPackage 相同引用） */
  package: TokenPackageRow | null;
  recommendedPackage: TokenPackageRow | null;
  reason: string;
  confidence: "low" | "medium" | "high";
  factors: string[];
  recommendationReason: string[];
};

type Tier = "low" | "mid" | "high";
type BudgetLevel = "low" | "medium" | "high" | null;

function inferBudgetLevel(
  signals: CustomerDemandSignals,
  memory: CustomerMemoryRow | null,
): BudgetLevel {
  if (signals.budget) return signals.budget;
  const text = (memory?.budget ?? "").toLowerCase().trim();
  if (text === "low" || /低|少|紧|学生|便宜|入门/.test(text)) return "low";
  if (text === "high" || /高|足|企业|充足|不差/.test(text)) return "high";
  if (text === "medium" || /中|一般|性价比/.test(text)) return "medium";
  return null;
}

function inferUsageTier(
  signals: CustomerDemandSignals,
  message: string,
  memory: CustomerMemoryRow | null,
): "light" | "normal" | "heavy" {
  const blob = [
    signals.needs.join(" "),
    message,
    memory?.needs ?? "",
    memory?.industry ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/系统架构|复杂算法|企业|高并发|分布式|微服务|私有化/.test(blob)) {
    return "heavy";
  }
  // 「综合咨询」是空需求兜底，不视为轻度使用
  const lightBlob = blob.replace(/综合咨询/g, " ");
  if (/文案|翻译|轻度|咨询|尝鲜|作业/.test(lightBlob)) {
    return "light";
  }
  return "normal";
}

function pickPackageIndex(packages: TokenPackageRow[], tier: Tier): number {
  if (packages.length === 0) return -1;
  if (packages.length === 1) return 0;
  if (tier === "low") return 0;
  if (tier === "high") return packages.length - 1;
  return Math.min(1, packages.length - 1);
}

/** 在已排序套餐列表中定位历史购买档位索引 */
function resolvePurchasedTierIndex(
  packages: TokenPackageRow[],
  packageName: string,
  tokenAmount: number,
): number {
  const byName = packages.findIndex(
    (p) => p.name === packageName || p.name.includes(packageName),
  );
  if (byName >= 0) return byName;

  const byAmount = packages.findIndex((p) => p.tokenAmount === tokenAmount);
  if (byAmount >= 0) return byAmount;

  if (/基础|入门|尝鲜|basic/i.test(packageName)) return 0;
  if (/标准|standard/i.test(packageName)) {
    return Math.min(1, packages.length - 1);
  }
  if (/企业|高级|premium|enterprise/i.test(packageName)) {
    return packages.length - 1;
  }
  return 0;
}

function tierToIndex(tier: Tier, packages: TokenPackageRow[]): number {
  return pickPackageIndex(packages, tier);
}

const ENTERPRISE_PURCHASE_RE =
  /企业|公司|团队|多人|员工|部门|批量采购|商业使用|企业账号|私有化|合规|\d+\s*个人/;

function isEnterprisePurchaseContext(input: {
  message: string;
  customerMemory: CustomerMemoryRow | null;
  customerType?: string | null;
  enterpriseSignal?: boolean | null;
}): boolean {
  if (input.customerType === "ENTERPRISE") return true;
  if (input.enterpriseSignal) return true;
  if (ENTERPRISE_PURCHASE_RE.test(input.message)) return true;
  const mem = [
    input.customerMemory?.industry ?? "",
    input.customerMemory?.needs ?? "",
  ].join(" ");
  return /企业|公司|团队|批量/.test(mem);
}

function usageToTier(estimate: UsageEstimate | null | undefined): Tier | null {
  if (!estimate) return null;
  if (estimate.intensity === "heavy" || estimate.estimatedTokens >= 80_000) {
    return "high";
  }
  if (estimate.intensity === "light" || estimate.estimatedTokens <= 15_000) {
    return "low";
  }
  return "mid";
}

/**
 * 基于余额、订单、CustomerMemory、本轮需求推荐 TokenPackage（数据驱动理由）。
 *
 * 优先级：企业/团队 → 低套餐升级 → 高消耗开发 → 普通个人 → 默认。
 */
export function recommendTokenPackage(
  input: PackageRecommendInput,
): PackageRecommendResult {
  const {
    tokenBalance,
    recentOrders,
    customerMemory,
    signals,
    message,
    packages,
    upsellContext,
    customerType,
    enterpriseSignal,
    usageEstimate,
    customerLevel,
  } = input;

  if (packages.length === 0) {
    return {
      package: null,
      recommendedPackage: null,
      reason: "暂无可用套餐目录，无法给出数据化套餐推荐。",
      confidence: "low",
      factors: [],
      recommendationReason: [],
    };
  }

  const sortedPackages = [...packages].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.tokenAmount - b.tokenAmount,
  );

  const factors: string[] = [];
  const recommendationReason: string[] = [];

  if (tokenBalance != null) {
    factors.push(`当前余额剩余 ${tokenBalance.toLocaleString()} Token`);
    recommendationReason.push(
      `当前余额：${tokenBalance.toLocaleString()} Token`,
    );
  } else {
    recommendationReason.push("当前余额：未提供");
  }

  const lastOrder = recentOrders[0];
  if (lastOrder) {
    const date = lastOrder.createdAt.toISOString().slice(0, 10);
    factors.push(
      `最近购买 ${lastOrder.packageName} × ${lastOrder.tokenAmount.toLocaleString()} Token（${date}）`,
    );
    recommendationReason.push(
      `历史订单：${lastOrder.packageName}（${lastOrder.tokenAmount.toLocaleString()} Token，${date}）`,
    );
  } else {
    recommendationReason.push("历史订单：暂无成功支付记录");
  }

  const memIndustry = customerMemory?.industry?.trim();
  const memBudget = customerMemory?.budget?.trim();
  if (memIndustry) factors.push(`CustomerMemory 行业：${memIndustry}`);
  if (memBudget) factors.push(`CustomerMemory 预算：${memBudget}`);

  if (signals.needs.length > 0) {
    factors.push(`本轮需求：${signals.needs.join("、")}`);
    recommendationReason.push(`当前需求：${signals.needs.join("、")}`);
  } else {
    recommendationReason.push("当前需求：未识别");
  }

  if (customerLevel) {
    factors.push(`客户分层：${customerLevel}`);
  }
  if (usageEstimate) {
    factors.push(usageEstimate.reason);
    recommendationReason.push(`用量预测：${usageEstimate.reason}`);
  }

  const budget = inferBudgetLevel(signals, customerMemory);
  const usage = inferUsageTier(signals, message, customerMemory);
  const enterprise = isEnterprisePurchaseContext({
    message,
    customerMemory,
    customerType,
    enterpriseSignal,
  });
  const usageTier = usageToTier(usageEstimate);
  const highConsume =
    usageEstimate != null
      ? usageEstimate.intensity !== "light" &&
        (usageEstimate.intensity === "heavy" ||
          usageEstimate.exceedsLastPackage ||
          usageEstimate.estimatedTokens >= 40_000)
      : usage === "heavy" ||
        signals.needs.some((n) =>
          /代码开发|系统架构|复杂算法|高并发/.test(n),
        ) ||
        /高并发|高频|不够用|额度不够/.test(message);

  // 5. 默认 mid；4. 普通个人 / 首次购买 → 基础档
  let tier: Tier = usageTier ?? "mid";
  if (!enterprise && !highConsume) {
    if (budget === "low" || usage === "light" || recentOrders.length === 0) {
      tier = "low";
    } else if (budget === "high") {
      tier = "high";
    }
  } else if (!enterprise && highConsume) {
    if (usageEstimate?.intensity === "heavy" || usage === "heavy") {
      tier = "high";
      factors.push("用量预测为高消耗，倾向企业档");
    } else {
      tier = "mid";
      factors.push("用量预测超过轻量档，至少标准档");
    }
  } else if (!enterprise && (budget === "high" || usage === "heavy")) {
    tier = "high";
  }

  if (usageEstimate?.exceedsLastPackage && !enterprise && tier === "low") {
    tier = "mid";
    factors.push("预估用量超过历史套餐容量，至少升一档");
  }

  // 1. 企业需求优先于预算字段，禁止 budget=low 降到基础档
  if (enterprise) {
    tier = "high";
    factors.push("企业/团队采购需求，优先企业套餐（不受预算字段降级）");
  } else if (tokenBalance != null && recentOrders.length > 0) {
    if (tokenBalance < 1000) {
      if (tier === "low") {
        tier = "mid";
        factors.push("余额偏低（<1000），倾向推荐更高档位补充额度");
      }
    } else if (tokenBalance < 3000 && tier === "low") {
      tier = "mid";
      factors.push("余额不足 3000，建议至少标准档套餐");
    } else if (tokenBalance >= 80000) {
      factors.push("余额较充足，可按需小额补充");
      if (tier === "high") tier = "mid";
    }
  }

  let idx = tierToIndex(tier, sortedPackages);

  // 升级：推荐档位不得低于已购档位，并尽量升一档（与【升级推荐】共用结果）
  if (upsellContext?.shouldUpsell) {
    const prevName =
      upsellContext.previousPackageName ?? lastOrder?.packageName ?? "";
    const prevAmount = lastOrder?.tokenAmount ?? 0;
    const currentTierIdx = resolvePurchasedTierIndex(
      sortedPackages,
      prevName,
      prevAmount,
    );
    const minIdx = Math.min(currentTierIdx + 1, sortedPackages.length - 1);
    if (idx < minIdx) {
      idx = minIdx;
      factors.push(
        `升级场景：推荐不低于已购档位（${prevName || "低套餐"}），目标至少 ${sortedPackages[minIdx]!.name}`,
      );
    }
    if (upsellContext.upgradeReason) {
      factors.push(upsellContext.upgradeReason);
    }
  } else if (
    !enterprise &&
    lastOrder &&
    /基础|入门|尝鲜/.test(lastOrder.packageName) &&
    tokenBalance != null &&
    tokenBalance < 5000
  ) {
    const midIdx = tierToIndex("mid", sortedPackages);
    if (idx < midIdx) idx = midIdx;
    factors.push("历史购买基础档且余额不足，建议升级标准档");
  } else if (
    !enterprise &&
    lastOrder &&
    /标准/.test(lastOrder.packageName) &&
    usage === "heavy"
  ) {
    const highIdx = tierToIndex("high", sortedPackages);
    if (idx < highIdx) idx = highIdx;
    factors.push("已购标准档且本轮为高负载需求，建议企业档");
  }

  const pkg = sortedPackages[idx]!;
  recommendationReason.push(
    `推荐套餐：${pkg.name}（${pkg.tokenAmount.toLocaleString()} Token，¥${pkg.price}）`,
  );

  const dataLine =
    factors.length > 0 ? factors.join("；") : "结合本轮对话与账户数据";
  const reason = `${dataLine}，建议 **${pkg.name}**（${pkg.tokenAmount.toLocaleString()} Token，¥${pkg.price}）。`;

  const confidence: PackageRecommendResult["confidence"] =
    factors.length >= 4 ? "high" : factors.length >= 2 ? "medium" : "low";

  return {
    package: pkg,
    recommendedPackage: pkg,
    reason,
    confidence,
    factors,
    recommendationReason,
  };
}

/** 注入 SALES system prompt */
export function formatPackageRecommendForPrompt(
  result: PackageRecommendResult,
): string {
  if (!result.package) {
    return `【套餐推荐】\n${result.reason}`;
  }

  const reasonLines =
    result.recommendationReason.length > 0
      ? result.recommendationReason
          .map((line, i) => `${i + 1}. ${line}`)
          .join("\n")
      : `1. ${result.reason}`;

  return `【套餐推荐】
推荐套餐：${result.package.name}
Token 数量：${result.package.tokenAmount.toLocaleString()}
价格：¥${result.package.price}
置信度：${result.confidence}
推荐理由（回复用户时必须基于下列数据，禁止编造未出现的数字）：${result.reason}

【推荐理由】
${reasonLines}`;
}
