import { prisma } from "@/lib/db";

export type CompetitorHit = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  strengths: string;
  differences: string;
  talkTrack: string;
  score: number;
};

const KNOWN_SLUGS = ["coze", "dify", "fastgpt", "chatbase"] as const;

/**
 * 竞品知识库检索（关键词 + 点名加权）。
 */
export async function searchCompetitorKnowledge(input: {
  query: string;
  limit?: number;
}): Promise<CompetitorHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 4, 1), 10);
  const q = input.query.trim().toLowerCase();
  const rows = await prisma.competitorKnowledge.findMany({
    orderBy: { name: "asc" },
  });

  if (rows.length === 0) return [];

  const scored = rows
    .map((r) => {
      let score = 0;
      const blob = `${r.name} ${r.slug} ${r.keywords} ${r.summary}`.toLowerCase();
      if (q.includes(r.slug) || q.includes(r.name.toLowerCase())) score += 20;
      if (r.slug === "coze" && /扣子/.test(q)) score += 20;
      for (const part of q.split(/[\s,，、]+/)) {
        if (part.length >= 2 && blob.includes(part)) score += 4;
      }
      if (/竞品|对比|区别|和其他|市面|agent/.test(q)) score += 3;
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        summary: r.summary,
        strengths: r.strengths,
        differences: r.differences,
        talkTrack: r.talkTrack,
        score,
      };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored.slice(0, limit);

  // 泛对比：返回全部已知竞品摘要
  if (/竞品|对比|区别|和其他|市面/.test(q)) {
    return rows
      .filter((r) =>
        (KNOWN_SLUGS as readonly string[]).includes(r.slug.toLowerCase()),
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        summary: r.summary,
        strengths: r.strengths,
        differences: r.differences,
        talkTrack: r.talkTrack,
        score: 1,
      }));
  }

  return [];
}

export function formatCompetitorsForPrompt(hits: CompetitorHit[]): string {
  if (hits.length === 0) {
    return "（本次未命中具体竞品条目；可用通用「计费透明 / 自主选档 / 售前问诊」话术，勿贬低竞品。）";
  }

  return hits
    .map(
      (h) => `### ${h.name}（${h.slug}）
简介：${h.summary}
对方常见优势：${h.strengths}
差异沟通（不攻击）：${h.differences}
推荐话术：${h.talkTrack}`,
    )
    .join("\n\n");
}
