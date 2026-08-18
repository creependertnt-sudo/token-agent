import { prisma } from "../lib/db";
import { defaultAgentSeeds } from "../lib/agent-config-defaults";
import { ensureDefaultTenant, DEFAULT_TENANT_ID } from "../lib/tenant-context";

export async function seedAgentConfigs() {
  const tenant = await ensureDefaultTenant();
  const seeds = defaultAgentSeeds();
  for (const row of seeds) {
    await prisma.agentConfig.upsert({
      where: {
        tenantId_serviceType: {
          tenantId: tenant.id,
          serviceType: row.serviceType,
        },
      },
      create: {
        name: row.name,
        serviceType: row.serviceType,
        systemPrompt: row.systemPrompt,
        model: row.model,
        temperature: row.temperature,
        enabled: row.enabled,
        tenantId: DEFAULT_TENANT_ID,
      },
      update: {},
    });
  }
  const count = await prisma.agentConfig.count();
  console.log("Seed AgentConfig:", {
    count,
    types: seeds.map((row) => row.serviceType),
  });
}

async function main() {
  await seedAgentConfigs();
}

if (process.argv[1]?.includes("seed-agent")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
