import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { toOpenAITools } from "../lib/tool-registry";
import { knowledgeTool } from "../lib/tools/knowledge-tool";
import {
  createKnowledge,
  deleteKnowledge,
  listKnowledge,
  updateKnowledge,
} from "../lib/knowledge-admin";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function search(query: string, userId: string) {
  return knowledgeTool.execute({ query }, { userId }) as Promise<{
    salesKnowledge?: Array<{ title: string; content: string }>;
    competitors?: Array<{ name: string; summary: string }>;
    error?: string;
  }>;
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const schemas = toOpenAITools();
  for (const tool of schemas) {
    const props =
      (tool.function.parameters as { properties?: Record<string, unknown> })
        .properties ?? {};
    assert(!("userId" in props), `${tool.function.name} schema has userId`);
  }

  const stamp = Date.now();
  const salesTitle = `API调用说明-${stamp}`;
  const competitorName = `VerifyDify-${stamp}`;
  const createdIds: string[] = [];

  const user = await prisma.user.create({
    data: {
      email: `kb-admin-${stamp}@example.local`,
      passwordHash: "test",
      tokenBalance: 18740,
      freeChatCount: 5,
    },
    select: { id: true, tokenBalance: true },
  });

  try {
    const listed = await listKnowledge();
    assert(Array.isArray(listed), "list returns array");

    const sales = await createKnowledge({
      type: "sales",
      title: salesTitle,
      category: "PRODUCT",
      content: "支持REST API调用，便于接入现有系统。",
      keywords: "API,REST,调用",
    });
    createdIds.push(sales.id);
    assert(sales.category === "product", "category normalized");

    const afterCreate = await search(salesTitle, user.id);
    const hit = afterCreate.salesKnowledge?.find((row) => row.title === salesTitle);
    assert(Boolean(hit), "search_knowledge finds new sales knowledge");
    assert(
      hit?.content.includes("支持REST API调用"),
      "search_knowledge returns new content",
    );

    const updated = await updateKnowledge(sales.id, {
      content: "更新后：支持 REST API 与流式调用。",
      category: "faq",
    });
    assert(updated.category === "faq", "category updated");
    const afterUpdate = await search(salesTitle, user.id);
    const updatedHit = afterUpdate.salesKnowledge?.find(
      (row) => row.title === salesTitle,
    );
    assert(
      updatedHit?.content.includes("流式调用"),
      "search_knowledge returns updated content",
    );
    assert(
      !updatedHit?.content.includes("便于接入现有系统"),
      "old content replaced",
    );

    const competitor = await createKnowledge({
      type: "competitor",
      name: competitorName,
      content: "Dify 是一个LLMOps平台，本条仅用于知识后台验证。",
      keywords: `${competitorName},Dify,LLMOps`,
    });
    createdIds.push(competitor.id);
    const competitorSearch = await search(competitorName, user.id);
    const competitorHit = competitorSearch.competitors?.find(
      (row) => row.name === competitorName,
    );
    assert(Boolean(competitorHit), "search_knowledge finds new competitor");
    assert(
      competitorHit?.summary.includes("LLMOps平台"),
      "competitor summary returned",
    );

    await deleteKnowledge(sales.id);
    await deleteKnowledge(competitor.id);
    createdIds.length = 0;

    const afterDeleteSales = await search(salesTitle, user.id);
    assert(
      !afterDeleteSales.salesKnowledge?.some((row) => row.title === salesTitle),
      "deleted sales knowledge not returned",
    );
    const afterDeleteComp = await search(competitorName, user.id);
    assert(
      !afterDeleteComp.competitors?.some((row) => row.name === competitorName),
      "deleted competitor not returned",
    );

    const afterUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenBalance: true },
    });
    assert(afterUser?.tokenBalance === user.tokenBalance, "token not deducted");
    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

    console.log("OK knowledge-admin", {
      listed: listed.length,
      salesTitle,
      competitorName,
      salesCost: SERVICE_CONFIG.SALES.cost,
      tokenBalance: afterUser?.tokenBalance,
    });
  } finally {
    if (createdIds.length > 0) {
      await prisma.salesKnowledge.deleteMany({
        where: { id: { in: createdIds } },
      });
      await prisma.competitorKnowledge.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
