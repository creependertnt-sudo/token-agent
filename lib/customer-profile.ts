import { prisma } from "@/lib/db";
import type { CustomerType } from "@/lib/sales-decision";

export type CustomerProfileRow = {
  code: string;
  name: string;
  description: string;
  matchKeywords: string;
  typicalNeeds: string;
  talkTrack: string;
  defaultRecommend: string;
  clarifyingQuestions: string[];
  sortOrder: number;
};

export async function listCustomerProfiles(): Promise<CustomerProfileRow[]> {
  const rows = await prisma.customerProfile.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    description: r.description,
    matchKeywords: r.matchKeywords,
    typicalNeeds: r.typicalNeeds,
    talkTrack: r.talkTrack,
    defaultRecommend: r.defaultRecommend,
    clarifyingQuestions: r.clarifyingQuestions
      .split(/[\n;；]/)
      .map((s) => s.trim())
      .filter(Boolean),
    sortOrder: r.sortOrder,
  }));
}

function keywordList(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 用数据库 CustomerProfile.matchKeywords 匹配客户画像。
 * 未命中返回 UNKNOWN 画像（若表中有），否则 null。
 */
export function matchCustomerProfile(
  message: string,
  profiles: CustomerProfileRow[],
): CustomerProfileRow | null {
  const t = message.toLowerCase();
  let best: { profile: CustomerProfileRow; score: number } | null = null;

  for (const p of profiles) {
    if (p.code === "UNKNOWN") continue;
    const kws = keywordList(p.matchKeywords);
    let score = 0;
    for (const kw of kws) {
      if (kw && t.includes(kw)) score += kw.length >= 2 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && p.sortOrder < best.profile.sortOrder))) {
      best = { profile: p, score };
    }
  }

  if (best) return best.profile;
  return profiles.find((p) => p.code === "UNKNOWN") ?? null;
}

export function profileCodeToCustomerType(code: string): CustomerType {
  const allowed = [
    "STUDENT",
    "INDIVIDUAL_DEV",
    "STARTUP_TEAM",
    "ENTERPRISE",
    "UNKNOWN",
  ] as const;
  if ((allowed as readonly string[]).includes(code)) {
    return code as CustomerType;
  }
  return "UNKNOWN";
}

export function formatCustomerProfileForPrompt(
  profile: CustomerProfileRow | null,
): string {
  if (!profile) {
    return "（CustomerProfile 未命中，按未知客户问诊。）";
  }
  return `【客户画像 CustomerProfile】
编码：${profile.code} · ${profile.name}
说明：${profile.description}
典型需求：${profile.typicalNeeds}
话术：${profile.talkTrack}
默认档位倾向：${profile.defaultRecommend || "无（先问诊）"}
建议追问：${profile.clarifyingQuestions.join("；") || "需求/预算/技术水平"}`;
}
