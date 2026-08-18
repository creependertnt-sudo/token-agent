import { prisma } from "@/lib/db";
import {
  SALES_KNOWLEDGE_CATEGORIES,
  type SalesKnowledgeCategory,
} from "@/lib/sales-knowledge";
import { scopeTenantId } from "@/lib/tenant-context";

export type KnowledgeType = "sales" | "competitor";

export type KnowledgeListItem = {
  id: string;
  type: KnowledgeType;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  keywords: string;
  updatedAt: Date;
  name?: string;
  slug?: string;
  strengths?: string;
  differences?: string;
  talkTrack?: string;
};

export type KnowledgeWriteInput = {
  type?: KnowledgeType | string;
  title?: string;
  name?: string;
  category?: string;
  content?: string;
  keywords?: string;
  slug?: string;
  strengths?: string;
  differences?: string;
  talkTrack?: string;
};

const EXCERPT_LEN = 80;

function excerptOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= EXCERPT_LEN) return t;
  return `${t.slice(0, EXCERPT_LEN)}…`;
}

function asType(value: unknown): KnowledgeType | null {
  const t = String(value ?? "")
    .trim()
    .toLowerCase();
  if (t === "sales" || t === "salesknowledge") return "sales";
  if (t === "competitor" || t === "competitorknowledge") return "competitor";
  return null;
}

export function normalizeSalesCategory(
  raw: string | undefined,
): SalesKnowledgeCategory | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    (SALES_KNOWLEDGE_CATEGORIES as readonly string[]).includes(value)
  ) {
    return value as SalesKnowledgeCategory;
  }
  return null;
}

function toSlug(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `kb-${Date.now().toString(36)}`;
}

async function uniqueCompetitorSlug(
  base: string,
  tenantId: string,
  excludeId?: string,
) {
  let slug = base;
  let n = 2;
  while (
    await prisma.competitorKnowledge.findFirst({
      where: excludeId
        ? { slug, tenantId, NOT: { id: excludeId } }
        : { slug, tenantId },
      select: { id: true },
    })
  ) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function mapSales(row: {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string;
  updatedAt: Date;
}): KnowledgeListItem {
  return {
    id: row.id,
    type: "sales",
    title: row.title,
    category: row.category,
    excerpt: excerptOf(row.content),
    content: row.content,
    keywords: row.keywords,
    updatedAt: row.updatedAt,
  };
}

function mapCompetitor(row: {
  id: string;
  name: string;
  slug: string;
  summary: string;
  strengths: string;
  differences: string;
  talkTrack: string;
  keywords: string;
  updatedAt: Date;
}): KnowledgeListItem {
  return {
    id: row.id,
    type: "competitor",
    title: row.name,
    category: "competitor",
    excerpt: excerptOf(row.summary),
    content: row.summary,
    keywords: row.keywords,
    updatedAt: row.updatedAt,
    name: row.name,
    slug: row.slug,
    strengths: row.strengths,
    differences: row.differences,
    talkTrack: row.talkTrack,
  };
}

function matchesQuery(item: KnowledgeListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    item.title,
    item.category,
    item.content,
    item.keywords,
    item.name ?? "",
    item.slug ?? "",
    item.strengths ?? "",
    item.differences ?? "",
    item.talkTrack ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

/**
 * 列出销售 / 竞品知识。只读查询，不含用户或密钥字段。
 */
export async function listKnowledge(
  query?: string,
  tenantId?: string | null,
): Promise<KnowledgeListItem[]> {
  const scoped = scopeTenantId(tenantId);
  const [sales, competitors] = await Promise.all([
    prisma.salesKnowledge.findMany({
      where: { tenantId: scoped },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.competitorKnowledge.findMany({
      where: { tenantId: scoped },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const items = [
    ...sales.map(mapSales),
    ...competitors.map(mapCompetitor),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  if (!query?.trim()) return items;
  return items.filter((item) => matchesQuery(item, query));
}

export async function getKnowledgeById(
  id: string,
  tenantId?: string | null,
): Promise<KnowledgeListItem | null> {
  const scoped = scopeTenantId(tenantId);
  const sales = await prisma.salesKnowledge.findFirst({
    where: { id, tenantId: scoped },
  });
  if (sales) return mapSales(sales);
  const competitor = await prisma.competitorKnowledge.findFirst({
    where: { id, tenantId: scoped },
  });
  if (competitor) return mapCompetitor(competitor);
  return null;
}

export async function createKnowledge(
  input: KnowledgeWriteInput,
  tenantId?: string | null,
): Promise<KnowledgeListItem> {
  const scoped = scopeTenantId(tenantId);
  const type = asType(input.type);
  if (!type) {
    throw new KnowledgeAdminError("请指定 type：sales 或 competitor。", 400);
  }

  if (type === "sales") {
    const title = String(input.title ?? "").trim();
    const content = String(input.content ?? "").trim();
    const category = normalizeSalesCategory(input.category);
    if (!title) throw new KnowledgeAdminError("标题不能为空。", 400);
    if (!content) throw new KnowledgeAdminError("内容不能为空。", 400);
    if (!category) {
      throw new KnowledgeAdminError(
        `无效 category。可选：${SALES_KNOWLEDGE_CATEGORIES.join(", ")}`,
        400,
      );
    }
    const keywords =
      String(input.keywords ?? "").trim() || title;
    const row = await prisma.salesKnowledge.create({
      data: { title, content, category, keywords, tenantId: scoped },
    });
    return mapSales(row);
  }

  const name = String(input.name ?? input.title ?? "").trim();
  const summary = String(input.content ?? "").trim();
  if (!name) throw new KnowledgeAdminError("竞品名称不能为空。", 400);
  if (!summary) throw new KnowledgeAdminError("内容不能为空。", 400);
  const slug = await uniqueCompetitorSlug(
    toSlug(String(input.slug ?? name).trim() || name),
    scoped,
  );
  const row = await prisma.competitorKnowledge.create({
    data: {
      name,
      slug,
      summary,
      strengths: String(input.strengths ?? "").trim(),
      differences: String(input.differences ?? "").trim(),
      talkTrack: String(input.talkTrack ?? "").trim(),
      keywords: String(input.keywords ?? "").trim() || name,
      tenantId: scoped,
    },
  });
  return mapCompetitor(row);
}

export async function updateKnowledge(
  id: string,
  input: KnowledgeWriteInput,
  tenantId?: string | null,
): Promise<KnowledgeListItem> {
  const existing = await getKnowledgeById(id, tenantId);
  if (!existing) throw new KnowledgeAdminError("知识条目不存在。", 404);

  if (existing.type === "sales") {
    const data: {
      title?: string;
      content?: string;
      category?: string;
      keywords?: string;
    } = {};
    if (typeof input.title === "string") {
      const title = input.title.trim();
      if (!title) throw new KnowledgeAdminError("标题不能为空。", 400);
      data.title = title;
    }
    if (typeof input.content === "string") {
      const content = input.content.trim();
      if (!content) throw new KnowledgeAdminError("内容不能为空。", 400);
      data.content = content;
    }
    if (typeof input.category === "string") {
      const category = normalizeSalesCategory(input.category);
      if (!category) {
        throw new KnowledgeAdminError(
          `无效 category。可选：${SALES_KNOWLEDGE_CATEGORIES.join(", ")}`,
          400,
        );
      }
      data.category = category;
    }
    if (typeof input.keywords === "string") {
      data.keywords = input.keywords.trim();
    }
    const row = await prisma.salesKnowledge.update({ where: { id }, data });
    return mapSales(row);
  }

  const data: {
    name?: string;
    slug?: string;
    summary?: string;
    strengths?: string;
    differences?: string;
    talkTrack?: string;
    keywords?: string;
  } = {};
  if (typeof input.name === "string" || typeof input.title === "string") {
    const name = String(input.name ?? input.title ?? "").trim();
    if (!name) throw new KnowledgeAdminError("竞品名称不能为空。", 400);
    data.name = name;
  }
  if (typeof input.content === "string") {
    const summary = input.content.trim();
    if (!summary) throw new KnowledgeAdminError("内容不能为空。", 400);
    data.summary = summary;
  }
  if (typeof input.slug === "string" && input.slug.trim()) {
    data.slug = await uniqueCompetitorSlug(
      toSlug(input.slug.trim()),
      scopeTenantId(tenantId),
      id,
    );
  }
  if (typeof input.strengths === "string") data.strengths = input.strengths.trim();
  if (typeof input.differences === "string") {
    data.differences = input.differences.trim();
  }
  if (typeof input.talkTrack === "string") data.talkTrack = input.talkTrack.trim();
  if (typeof input.keywords === "string") data.keywords = input.keywords.trim();

  const row = await prisma.competitorKnowledge.update({ where: { id }, data });
  return mapCompetitor(row);
}

export async function deleteKnowledge(
  id: string,
  tenantId?: string | null,
): Promise<void> {
  const existing = await getKnowledgeById(id, tenantId);
  if (!existing) throw new KnowledgeAdminError("知识条目不存在。", 404);
  if (existing.type === "sales") {
    await prisma.salesKnowledge.delete({ where: { id } });
    return;
  }
  await prisma.competitorKnowledge.delete({ where: { id } });
}

export class KnowledgeAdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "KnowledgeAdminError";
    this.status = status;
  }
}
