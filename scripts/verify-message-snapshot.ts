import { prisma } from "../lib/db";

async function main() {
  const cols = (await prisma.$queryRawUnsafe(
    'PRAGMA table_info("Message")',
  )) as Array<{ name: string }>;
  console.log(
    "Message columns:",
    cols.map((c) => c.name).join(", "),
  );

  const required = ["serviceType", "modelName", "tokenCost", "tokenBalanceAfter"];
  for (const name of required) {
    if (!cols.some((c) => c.name === name)) {
      throw new Error(`Missing column: ${name}`);
    }
  }
  console.log("OK: snapshot columns exist");

  const sample = await prisma.message.findMany({
    where: { role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      serviceType: true,
      modelName: true,
      tokenCost: true,
      tokenBalanceAfter: true,
    },
  });
  console.log(
    "Recent assistant snapshots:",
    JSON.stringify(
      sample.map((s) => ({
        id: s.id.slice(0, 8),
        serviceType: s.serviceType,
        modelName: s.modelName,
        tokenCost: s.tokenCost,
        tokenBalanceAfter: s.tokenBalanceAfter,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
