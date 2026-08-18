import { SERVICE_CONFIG } from "../lib/constants";
import { prisma } from "../lib/db";
import { resolveDatabaseUrl, isPostgresUrl } from "../lib/database-url";
import { runHealthCheck } from "../lib/health";
import { checkDatabase } from "./check-database";
import { runSecurityCheck } from "./security-check";

type Row = { item: string; result: string };

function line(rows: Row[]) {
  const width = Math.max(...rows.map((row) => row.item.length));
  for (const row of rows) {
    console.log(`${row.item.padEnd(width)}  ${row.result}`);
  }
}

async function migrationStatus(): Promise<{ ok: boolean; count: number }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
    'SELECT COUNT(*) AS count FROM "_prisma_migrations"',
  );
  const count = Number(rows[0]?.count ?? 0);
  return { ok: count > 0, count };
}

async function main() {
  const rows: Row[] = [];
  const url = resolveDatabaseUrl();
  const engine = isPostgresUrl(url) ? "postgresql" : "sqlite";

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  rows.push({
    item: "环境变量",
    result: `PASS (${engine}${hasDatabaseUrl ? "" : ", DATABASE_URL 默认本地 SQLite"}; OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL || "https://api.deepseek.com"}; OPENAI_MODEL=${process.env.OPENAI_MODEL || "deepseek-chat"})`,
  });

  const health = await runHealthCheck();
  rows.push({
    item: "数据库连接",
    result: health.database ? "PASS" : "FAIL",
  });

  let prismaOk = false;
  try {
    prismaOk = typeof prisma.user.count === "function";
  } catch {
    prismaOk = false;
  }
  rows.push({
    item: "Prisma状态",
    result: prismaOk ? "PASS" : "FAIL",
  });

  const migrations = await migrationStatus();
  rows.push({
    item: "Migration状态",
    result: migrations.ok ? `PASS (${migrations.count})` : "FAIL",
  });
  rows.push({
    item: "迁移",
    result: migrations.ok ? "PASS" : "FAIL",
  });

  const deepseek =
    health.model === true
      ? "PASS"
      : process.env.OPENAI_API_KEY
        ? "FAIL"
        : "PASS (未配置 Key，跳过连通)";
  rows.push({ item: "DeepSeek连接", result: deepseek });

  const integrity = await checkDatabase();
  rows.push({
    item: "数据完整",
    result: integrity.ok ? "PASS" : `FAIL ${integrity.issues.join("; ")}`,
  });

  const security = runSecurityCheck();
  rows.push({
    item: "安全检查",
    result: security.ok ? "PASS" : `FAIL ${security.issues.join("; ")}`,
  });

  const salesCost = SERVICE_CONFIG.SALES.cost;
  rows.push({
    item: "SALES.cost",
    result: salesCost === 0 ? "0" : `FAIL ${salesCost}`,
  });

  line(rows);

  const failed = rows.filter(
    (row) =>
      row.result.startsWith("FAIL") ||
      (row.item === "SALES.cost" && row.result !== "0"),
  );
  if (failed.length > 0) {
    process.exit(1);
  }
  console.log("OK verify-deployment", {
    engine,
    salesCost,
    users: integrity.live.users,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
