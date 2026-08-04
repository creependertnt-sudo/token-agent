import { NextResponse } from "next/server";
import {
  searchSalesKnowledge,
  SALES_KNOWLEDGE_CATEGORIES,
} from "@/lib/sales-knowledge";

/**
 * GET /api/sales/search?q=...&limit=5&category=pricing
 * 销售知识库检索（供 SALES RAG / 调试）。
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? searchParams.get("query") ?? "").trim();
    const limitRaw = Number(searchParams.get("limit") ?? "5");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 5;
    const category = searchParams.get("category")?.trim() || undefined;

    if (category && !SALES_KNOWLEDGE_CATEGORIES.includes(category as never)) {
      return NextResponse.json(
        {
          error: `无效 category。可选：${SALES_KNOWLEDGE_CATEGORIES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!q) {
      return NextResponse.json(
        { error: "请提供查询参数 q（或 query）。" },
        { status: 400 },
      );
    }

    const hits = await searchSalesKnowledge({ query: q, limit, category });

    return NextResponse.json({
      query: q,
      count: hits.length,
      results: hits.map((h) => ({
        id: h.id,
        category: h.category,
        title: h.title,
        content: h.content,
        keywords: h.keywords,
        score: h.score,
      })),
    });
  } catch (error) {
    console.error("Sales knowledge search error:", error);
    return NextResponse.json({ error: "知识库检索失败。" }, { status: 500 });
  }
}

/**
 * POST /api/sales/search
 * body: { query: string, limit?: number, category?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const q =
      typeof body?.query === "string"
        ? body.query.trim()
        : typeof body?.q === "string"
          ? body.q.trim()
          : "";
    const limit =
      typeof body?.limit === "number" && Number.isFinite(body.limit)
        ? body.limit
        : 5;
    const category =
      typeof body?.category === "string" ? body.category.trim() : undefined;

    if (category && !SALES_KNOWLEDGE_CATEGORIES.includes(category as never)) {
      return NextResponse.json(
        {
          error: `无效 category。可选：${SALES_KNOWLEDGE_CATEGORIES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!q) {
      return NextResponse.json(
        { error: "请提供 query（或 q）。" },
        { status: 400 },
      );
    }

    const hits = await searchSalesKnowledge({ query: q, limit, category });

    return NextResponse.json({
      query: q,
      count: hits.length,
      results: hits,
    });
  } catch (error) {
    console.error("Sales knowledge search error:", error);
    return NextResponse.json({ error: "知识库检索失败。" }, { status: 500 });
  }
}
