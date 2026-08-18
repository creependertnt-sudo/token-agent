import { MemoryCategory } from "../app/generated/prisma/enums";
import { prisma } from "../lib/db";
import {
  chronologicalRecent,
  takeShortTermMessages,
  SHORT_TERM_FETCH_MAX_MESSAGES,
} from "../lib/chat-memory";
import {
  enforceMemoryQuota,
  selectImportantMemories,
} from "../lib/memory";
import { assertUserRateLimit, RateLimitError } from "../lib/rate-limit";
import { CONTEXT_HISTORY_ROUNDS, resolveUserQuota } from "../lib/user-quota";
import { SERVICE_CONFIG } from "../lib/constants";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");
  assert(CONTEXT_HISTORY_ROUNDS === 20, "20 rounds");
  assert(SHORT_TERM_FETCH_MAX_MESSAGES === 40, "fetch 40 msgs");
  assert(
    takeShortTermMessages(Array.from({ length: 50 }, (_, i) => i)).length === 40,
    "cap 20 rounds",
  );
  assert(chronologicalRecent([3, 2, 1]).join(",") === "1,2,3", "desc → chrono");

  const important = selectImportantMemories(
    [
      { id: "1", category: MemoryCategory.fact, content: "hi" },
      { id: "2", category: MemoryCategory.business, content: "做企业系统" },
      { id: "3", category: MemoryCategory.preference, content: "喜欢 TypeScript" },
    ],
    2,
  );
  assert(important[0]?.id === "2", "business ranks first");
  assert(important.length === 2, "prompt memory cap");

  const testUser = await prisma.user.create({
    data: {
      email: `quota-test-${Date.now()}@example.local`,
      passwordHash: "test",
    },
    select: { id: true },
  });

  try {
    const quota = await resolveUserQuota(testUser.id);
    assert(quota.tier === "NORMAL", "new user is NORMAL");
    assert(quota.requestsPerMinute === 10, "normal rpm 10");
    assert(quota.maxMemories === 100, "normal memory 100");
    assert(quota.contextRounds === 20, "context 20");

    try {
      await assertUserRateLimit(testUser.id, {
        ...quota,
        requestsPerMinute: 0,
      });
      throw new Error("expected RateLimitError");
    } catch (e) {
      assert(e instanceof RateLimitError, "rate limit throws");
    }

    await prisma.agentMemory.createMany({
      data: [
        { userId: testUser.id, category: MemoryCategory.fact, content: "你好" },
        {
          userId: testUser.id,
          category: MemoryCategory.fact,
          content: "重复事实 AAA",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.fact,
          content: "重复事实 AAA",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.business,
          content: "需求：企业 API 对接",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.preference,
          content: "喜欢 TypeScript",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.fact,
          content: "临时备注 b1",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.fact,
          content: "临时备注 b2",
        },
        {
          userId: testUser.id,
          category: MemoryCategory.fact,
          content: "临时备注 b3",
        },
      ],
    });
    const after = await enforceMemoryQuota(testUser.id, 4);
    assert(after <= 4, `compacted to ${after}`);
    const remaining = await prisma.agentMemory.count({
      where: { userId: testUser.id },
    });
    assert(remaining <= 4, `db count ${remaining}`);

    console.log("OK user-limits", {
      tier: quota.tier,
      rpm: quota.requestsPerMinute,
      maxMemories: quota.maxMemories,
      compacted: after,
    });
  } finally {
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
