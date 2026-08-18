import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { searchSalesKnowledge } from "../lib/sales-knowledge";
import { searchCompetitorKnowledge } from "../lib/competitor-knowledge";
import { getUserMemories } from "../lib/memory";
import { getCustomerMemory } from "../lib/customer-memory";
import { loadAgentRuntimeConfig } from "../lib/agent-config";
import { listKnowledge } from "../lib/knowledge-admin";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  ensureDefaultTenant,
} from "../lib/tenant-context";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");
  const def = await ensureDefaultTenant();
  assert(def.id === DEFAULT_TENANT_ID, "default tenant id");
  assert(def.name === DEFAULT_TENANT_NAME, "default tenant name");

  const unboundUsers = await prisma.user.count({ where: { tenantId: null } });
  assert(unboundUsers === 0, "legacy users bound to default tenant");
  const defaultUsers = await prisma.user.count({
    where: { tenantId: DEFAULT_TENANT_ID },
  });
  assert(defaultUsers >= 0, "default tenant user count readable");
  console.log("PASS 旧数据迁移", {
    defaultTenant: def.name,
    defaultUsers,
  });

  const stamp = Date.now();
  const tenantA = await prisma.tenant.create({
    data: { name: `Tenant A ${stamp}` },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: `Tenant B ${stamp}` },
  });

  const userA = await prisma.user.create({
    data: {
      email: `tenant-a-${stamp}@example.local`,
      passwordHash: "test",
      tenantId: tenantA.id,
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `tenant-b-${stamp}@example.local`,
      passwordHash: "test",
      tenantId: tenantB.id,
    },
  });

  const knowledgeIds: string[] = [];
  const competitorIds: string[] = [];
  const agentIds: string[] = [];
  const memoryIds: string[] = [];

  try {
    const salesA = await prisma.salesKnowledge.create({
      data: {
        tenantId: tenantA.id,
        category: "product",
        title: `A-SECRET-${stamp}`,
        content: "仅 Tenant A 可见的知识",
        keywords: `A-SECRET-${stamp}`,
      },
    });
    knowledgeIds.push(salesA.id);
    const salesB = await prisma.salesKnowledge.create({
      data: {
        tenantId: tenantB.id,
        category: "product",
        title: `B-SECRET-${stamp}`,
        content: "仅 Tenant B 可见的知识",
        keywords: `B-SECRET-${stamp}`,
      },
    });
    knowledgeIds.push(salesB.id);

    const compA = await prisma.competitorKnowledge.create({
      data: {
        tenantId: tenantA.id,
        name: `CompA-${stamp}`,
        slug: `compa-${stamp}`,
        summary: "A only competitor",
        strengths: "",
        differences: "",
        talkTrack: "",
        keywords: `CompA-${stamp}`,
      },
    });
    competitorIds.push(compA.id);
    const compB = await prisma.competitorKnowledge.create({
      data: {
        tenantId: tenantB.id,
        name: `CompB-${stamp}`,
        slug: `compb-${stamp}`,
        summary: "B only competitor",
        strengths: "",
        differences: "",
        talkTrack: "",
        keywords: `CompB-${stamp}`,
      },
    });
    competitorIds.push(compB.id);

    const memA = await prisma.agentMemory.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        category: "fact",
        content: `memory-a-${stamp}`,
      },
    });
    memoryIds.push(memA.id);
    const memB = await prisma.agentMemory.create({
      data: {
        userId: userB.id,
        tenantId: tenantB.id,
        category: "fact",
        content: `memory-b-${stamp}`,
      },
    });
    memoryIds.push(memB.id);

    await prisma.customerMemory.create({
      data: {
        userId: userA.id,
        tenantId: tenantA.id,
        needs: `need-a-${stamp}`,
      },
    });
    await prisma.customerMemory.create({
      data: {
        userId: userB.id,
        tenantId: tenantB.id,
        needs: `need-b-${stamp}`,
      },
    });

    const agentA = await prisma.agentConfig.create({
      data: {
        tenantId: tenantA.id,
        name: "A Sales",
        serviceType: "SALES",
        systemPrompt: `PROMPT-A-${stamp}`,
        model: "deepseek-chat",
        temperature: 0.4,
        enabled: true,
      },
    });
    agentIds.push(agentA.id);
    const agentB = await prisma.agentConfig.create({
      data: {
        tenantId: tenantB.id,
        name: "B Sales",
        serviceType: "SALES",
        systemPrompt: `PROMPT-B-${stamp}`,
        model: "deepseek-chat",
        temperature: 0.9,
        enabled: true,
      },
    });
    agentIds.push(agentB.id);

    const usersA = await prisma.user.findMany({
      where: { tenantId: tenantA.id },
      select: { id: true, email: true },
    });
    assert(usersA.every((row) => row.id !== userB.id), "A users exclude B");
    assert(
      !(await prisma.user.findFirst({
        where: { tenantId: tenantA.id, id: userB.id },
      })),
      "A cannot see user B",
    );
    console.log("PASS Tenant隔离");

    const loadedA = await loadAgentRuntimeConfig("SALES", tenantA.id);
    const loadedB = await loadAgentRuntimeConfig("SALES", tenantB.id);
    assert(loadedA.systemPrompt.includes(`PROMPT-A-${stamp}`), "A agent prompt");
    assert(loadedB.systemPrompt.includes(`PROMPT-B-${stamp}`), "B agent prompt");
    assert(!loadedA.systemPrompt.includes(`PROMPT-B-${stamp}`), "A agent hides B");
    assert(!loadedB.systemPrompt.includes(`PROMPT-A-${stamp}`), "B agent hides A");
    console.log("PASS Agent隔离");

    const knowledgeA = await listKnowledge("", tenantA.id);
    const knowledgeB = await listKnowledge("", tenantB.id);
    assert(
      knowledgeA.some((row) => row.title === `A-SECRET-${stamp}`),
      "A lists own knowledge",
    );
    assert(
      !knowledgeA.some((row) => row.title === `B-SECRET-${stamp}`),
      "A cannot list B knowledge",
    );
    assert(
      !knowledgeB.some((row) => row.title === `A-SECRET-${stamp}`),
      "B cannot list A knowledge",
    );

    const searchA = await searchSalesKnowledge({
      query: `B-SECRET-${stamp}`,
      tenantId: tenantA.id,
    });
    assert(
      !searchA.some((hit) => hit.title === `B-SECRET-${stamp}`),
      "A search misses B knowledge",
    );
    const searchB = await searchSalesKnowledge({
      query: `A-SECRET-${stamp}`,
      tenantId: tenantB.id,
    });
    assert(
      !searchB.some((hit) => hit.title === `A-SECRET-${stamp}`),
      "B search misses A knowledge",
    );
    const compAHits = await searchCompetitorKnowledge({
      query: `CompB-${stamp}`,
      tenantId: tenantA.id,
    });
    assert(
      !compAHits.some((hit) => hit.name === `CompB-${stamp}`),
      "A competitor search misses B",
    );
    console.log("PASS Knowledge隔离");

    const memsA = await getUserMemories(userA.id);
    const memsB = await getUserMemories(userB.id);
    assert(
      memsA.some((row) => row.content === `memory-a-${stamp}`),
      "A sees own memory",
    );
    assert(
      !memsA.some((row) => row.content === `memory-b-${stamp}`),
      "A cannot see B memory",
    );
    assert(
      !memsB.some((row) => row.content === `memory-a-${stamp}`),
      "B cannot see A memory",
    );
    const tenantMemA = await prisma.agentMemory.findMany({
      where: { tenantId: tenantA.id },
    });
    assert(
      !tenantMemA.some((row) => row.content === `memory-b-${stamp}`),
      "tenant A memory query excludes B",
    );
    const custA = await getCustomerMemory(userA.id);
    const custB = await getCustomerMemory(userB.id);
    assert(custA?.needs === `need-a-${stamp}`, "A customer memory");
    assert(custB?.needs === `need-b-${stamp}`, "B customer memory");
    assert(custA?.needs !== custB?.needs, "customer memory isolated");
    console.log("PASS Memory隔离");

    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");
    console.log("PASS SALES.cost", SERVICE_CONFIG.SALES.cost);
    console.log("OK tenant-isolation");
  } finally {
    await prisma.agentMemory.deleteMany({
      where: { id: { in: memoryIds } },
    });
    await prisma.customerMemory.deleteMany({
      where: { userId: { in: [userA.id, userB.id] } },
    });
    await prisma.agentConfig.deleteMany({
      where: { id: { in: agentIds } },
    });
    await prisma.salesKnowledge.deleteMany({
      where: { id: { in: knowledgeIds } },
    });
    await prisma.competitorKnowledge.deleteMany({
      where: { id: { in: competitorIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
