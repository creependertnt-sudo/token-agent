import type { CustomerDemandSignals } from "@/lib/customer-analysis";
import type { CustomerMemoryRow } from "@/lib/customer-memory";

export type UsageLevel = "LIGHT" | "NORMAL" | "HEAVY";
export type UsageIntensity = "light" | "normal" | "heavy";

export type UsageOrderSnapshot = {
  packageName: string;
  tokenAmount: number;
};

export type UsageEstimateInput = {
  message: string;
  signals: CustomerDemandSignals;
  memory: CustomerMemoryRow | null;
  tokenBalance: number | null;
  recentOrders: UsageOrderSnapshot[];
  /** 实际已消耗 Token（TokenUsage 绝对值合计）；不参与扣费 */
  consumedTokens?: number | null;
};

export type UsageEstimate = {
  estimatedTokens: number;
  intensity: UsageIntensity;
  usageLevel: UsageLevel;
  lastPackageTokens: number | null;
  lastPackageName: string | null;
  exceedsLastPackage: boolean;
  exceedHistory: boolean;
  reason: string;
};

/**
 * 预估本轮场景所需 Token 量，并用历史订单均值修正。
 * 不参与扣费，只服务套餐推荐与升级判断。
 */
export function estimateUsage(input: UsageEstimateInput): UsageEstimate {
  const blob = [
    input.message,
    input.signals.needs.join(" "),
    input.memory?.needs ?? "",
    input.memory?.industry ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let base = 10_000;
  if (
    /高并发|大规模|分布式|微服务|系统架构|\d+\s*个人|公司|企业|团队/.test(blob) &&
    /api|高并发|并发|调用|使用/.test(blob)
  ) {
    base = 100_000;
  } else if (/高并发|大规模|分布式|微服务|系统架构/.test(blob)) {
    base = 100_000;
  } else if (/开发|代码|项目|不够用/.test(blob)) {
    base = 50_000;
  } else if (/测试|试用|尝鲜/.test(blob)) {
    base = 5_000;
  }

  const history = input.recentOrders;
  if (history.length > 0) {
    const avg =
      history.reduce((sum, o) => sum + o.tokenAmount, 0) / history.length;
    base = Math.max(base, avg);
  }

  const intensity: UsageIntensity =
    base >= 80_000 ? "heavy" : base <= 15_000 ? "light" : "normal";
  const usageLevel: UsageLevel =
    intensity === "heavy" ? "HEAVY" : intensity === "light" ? "LIGHT" : "NORMAL";

  const last = history[0] ?? null;
  const lastPackageTokens = last?.tokenAmount ?? null;
  const lastPackageName = last?.packageName ?? null;
  const consumed = input.consumedTokens ?? null;
  const consumedExceeds =
    lastPackageTokens != null &&
    lastPackageTokens > 0 &&
    consumed != null &&
    consumed >= lastPackageTokens;
  const exceedsLastPackage =
    (lastPackageTokens != null &&
      lastPackageTokens > 0 &&
      base > lastPackageTokens) ||
    consumedExceeds;

  const lastLine = lastPackageName
    ? `历史套餐 ${lastPackageName}（${lastPackageTokens!.toLocaleString()} Token）`
    : "无历史套餐";
  const consumedLine =
    consumed != null
      ? `；实际已消耗 ${consumed.toLocaleString()} Token`
      : "";

  return {
    estimatedTokens: base,
    intensity,
    usageLevel,
    lastPackageTokens,
    lastPackageName,
    exceedsLastPackage,
    exceedHistory: exceedsLastPackage,
    reason: `预估 ${base.toLocaleString()} Token（${usageLevel}）；${lastLine}${consumedLine}${
      exceedsLastPackage ? "，超过历史套餐容量" : ""
    }`,
  };
}

export function formatUsageEstimateForPrompt(estimate: UsageEstimate): string {
  return `【用量预测】
预估用量：${estimate.estimatedTokens.toLocaleString()} Token
强度：${estimate.usageLevel}
历史套餐容量：${
    estimate.lastPackageTokens != null
      ? `${estimate.lastPackageTokens.toLocaleString()} Token`
      : "无"
  }
是否超过历史套餐：${estimate.exceedHistory ? "是" : "否"}
依据：${estimate.reason}`;
}
