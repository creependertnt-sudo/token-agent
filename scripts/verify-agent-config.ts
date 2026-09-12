import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { toOpenAITools } from "../lib/tool-registry";
import { buildAgentSystemPrompt } from "../lib/agent-router";
import {
  listAgentConfigs,
  loadAgentRuntimeConfig,
  updateAgentConfig,
} from "../lib/agent-config";
import { seedAgentConfigs } from "../prisma/seed-agent";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const tools = toOpenAITools();
  assert(tools.length >= 4, "tools registered");
  for (const tool of tools) {
    const props =
      (tool.function.parameters as { properties?: Record<string, unknown> })
        .properties ?? {};
    assert(!("userId" in props), `${tool.function.name} schema has userId`);
  }
  console.log("PASS Tool", tools.map((t) => t.function.name).join(","));

  await seedAgentConfigs();
  const listed = await listAgentConfigs();
  assert(listed.length === 4, "four agent configs");
  for (const type of ["SALES", "LIGHT", "STANDARD", "PREMIUM"] as const) {
    assert(
      listed.some((row) => row.serviceType === type && row.enabled),
      `config ${type}`,
    );
  }

  const sales = listed.find((row) => row.serviceType === "SALES");
  assert(Boolean(sales), "SALES config exists");
  const original = sales!.systemPrompt;
  const marker = `AGENT_CONFIG_MARKER_${Date.now()}`;

  await updateAgentConfig(sales!.id, {
    systemPrompt: `${original}\n\n${marker}`,
  });

  const loaded = await loadAgentRuntimeConfig("SALES");
  assert(loaded.source === "database", "runtime reads database");
  assert(loaded.systemPrompt.includes(marker), "next load uses new prompt");
  assert(loaded.model === "deepseek-chat", "SALES model");
  assert(loaded.tools.includes("query_packages"), "tools attached");

  const composed = buildAgentSystemPrompt({
    serviceType: "SALES",
    memories: [],
    tokenBalance: 100,
    configPrompt: loaded.systemPrompt,
  });
  assert(composed.includes(marker), "composed prompt includes DB prompt");
  assert(composed.includes("模型身份：SALES · Guide"), "identity still locked");

  const version = await prisma.agentConfigVersion.findFirst({
    where: { agentId: sales!.id },
    orderBy: { changedAt: "desc" },
  });
  assert(Boolean(version), "version recorded");
  assert(version!.oldPrompt === original, "oldPrompt stored");
  assert(version!.newPrompt.includes(marker), "newPrompt stored");

  await updateAgentConfig(sales!.id, { systemPrompt: original });
  const restored = await loadAgentRuntimeConfig("SALES");
  assert(!restored.systemPrompt.includes(marker), "prompt restored");

  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");
  console.log("PASS Runtime", {
    source: loaded.source,
    model: loaded.model,
    temperature: loaded.temperature,
  });
  console.log("PASS SALES", { cost: SERVICE_CONFIG.SALES.cost });
  console.log("OK agent-config");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
