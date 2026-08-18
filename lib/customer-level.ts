import type { CustomerDemandSignals } from "@/lib/customer-analysis";
import type { CustomerMemoryRow } from "@/lib/customer-memory";

export type CustomerLevel = "VIP" | "HIGH_VALUE" | "POTENTIAL" | "LOW_VALUE";

export type CustomerLevelOrder = {
  packageName: string;
  tokenAmount: number;
};

export type CustomerLevelInput = {
  tokenBalance: number | null;
  recentOrders: CustomerLevelOrder[];
  signals: CustomerDemandSignals;
  memory: CustomerMemoryRow | null;
  message?: string;
  customerType?: string | null;
};

export type CustomerLevelResult = {
  level: CustomerLevel;
  label: string;
  score: number;
  reasons: string[];
  reason: string;
};

const LEVEL_LABEL: Record<CustomerLevel, string> = {
  VIP: "VIP",
  HIGH_VALUE: "HIGH_VALUE",
  POTENTIAL: "POTENTIAL",
  LOW_VALUE: "LOW_VALUE",
};

function blobOf(input: CustomerLevelInput): string {
  return [
    input.message ?? "",
    input.signals.needs.join(" "),
    input.memory?.industry ?? "",
    input.memory?.needs ?? "",
  ].join(" ");
}

function isPureConsult(message: string): boolean {
  const t = message.trim();
  if (/开发|高并发|公司|企业|团队|不够用|想买|买token|购买|api/i.test(t)) {
    return false;
  }
  return /^(多少钱|套餐多少钱|价格多少|充值多少钱|费用).{0,20}$/u.test(t);
}

function isEnterpriseVip(input: CustomerLevelInput): boolean {
  const blob = blobOf(input);
  if (input.customerType === "ENTERPRISE") return true;
  if (/\d+\s*个人/.test(blob) && /公司|企业|团队|api/i.test(blob)) return true;
  if (/高并发/.test(blob) && /公司|企业|团队|api/i.test(blob)) return true;
  if (input.recentOrders.length >= 3) return true;
  const highOrder = input.recentOrders.some((o) => o.tokenAmount >= 80_000);
  if (highOrder && /企业|公司/.test(blob)) return true;
  return false;
}

function isHighValueUpgrade(input: CustomerLevelInput): boolean {
  if (input.recentOrders.length === 0) return false;
  const blob = blobOf(input);
  if (/开发|不够用|额度不够|升级/.test(blob)) return true;
  if (input.tokenBalance != null && input.tokenBalance < 2000) return true;
  return false;
}

function isPotentialBuyer(input: CustomerLevelInput): boolean {
  if (input.recentOrders.length > 0) return false;
  const t = input.message ?? "";
  return /想买|买token|购买|充值|套餐/.test(t);
}

/**
 * 用户价值分层：规则优先，评分兜底。
 * 仅用于销售决策与话术，不参与扣费或模型路由。
 */
export function evaluateCustomerLevel(
  input: CustomerLevelInput,
): CustomerLevelResult {
  const reasons: string[] = [];
  let score = 0;

  if (input.recentOrders.length > 0) {
    score += 30;
    reasons.push("有历史订单 +30");
  }

  const t = input.message ?? "";
  if (/购买|充值|想买|买token/.test(`${t} ${input.signals.needs.join(" ")}`)) {
    score += 40;
    reasons.push("购买/充值意向 +40");
  }

  if (input.tokenBalance != null && input.tokenBalance < 2000) {
    score += 20;
    reasons.push("余额 < 2000 +20");
  }

  const budget = (input.memory?.budget ?? input.signals.budget ?? "")
    .toString()
    .toLowerCase();
  if (budget === "high" || /高|充足|不差/.test(budget)) {
    score += 20;
    reasons.push("高预算 +20");
  }

  if (isEnterpriseVip(input)) {
    score = Math.max(score, 90);
    reasons.push("企业/多人/高并发 API → VIP");
    return done("VIP", score, reasons);
  }

  if (isPureConsult(t)) {
    reasons.push("纯价格/普通咨询 → LOW_VALUE");
    return done("LOW_VALUE", Math.min(score, 20), reasons);
  }

  if (isHighValueUpgrade(input)) {
    score = Math.max(score, 60);
    reasons.push("有购买历史且存在升级/开发缺口 → HIGH_VALUE");
    return done("HIGH_VALUE", score, reasons);
  }

  if (isPotentialBuyer(input)) {
    score = Math.max(score, 40);
    reasons.push("新用户且有明确购买意向 → POTENTIAL");
    return done("POTENTIAL", score, reasons);
  }

  let level: CustomerLevel = "LOW_VALUE";
  if (score > 80) level = "VIP";
  else if (score > 50) level = "HIGH_VALUE";
  else if (score > 30) level = "POTENTIAL";

  if (reasons.length === 0) reasons.push(`得分 ${score} 落入 ${level}`);
  return done(level, score, reasons);
}

function done(
  level: CustomerLevel,
  score: number,
  reasons: string[],
): CustomerLevelResult {
  return {
    level,
    label: LEVEL_LABEL[level],
    score,
    reasons,
    reason: `得分 ${score}；${reasons.join("；")}`,
  };
}

export function formatCustomerLevelForPrompt(
  result: CustomerLevelResult,
): string {
  const lines = result.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `【客户分层】
${result.level}
等级：${result.label}（得分 ${result.score}）
依据：
${lines}
说明：分层只用于销售决策与话术，不改变扣费与模型通道。`;
}
