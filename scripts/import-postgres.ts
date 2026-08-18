import fs from "fs";
import { prisma } from "../lib/db";
import { isPostgresUrl, resolveDatabaseUrl } from "../lib/database-url";
import {
  PRISMA_DELEGATE,
  SQLITE_EXPORT_TABLES,
  normalizeRow,
  sqliteDumpPath,
  type SqliteDump,
} from "./db-tables";

type Delegate = {
  createMany: (args: {
    data: Record<string, unknown>[];
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
};

async function main() {
  const url = resolveDatabaseUrl();
  if (!isPostgresUrl(url)) {
    throw new Error(
      "import-postgres 需要 DATABASE_URL 为 postgresql://…（当前不是 PostgreSQL）",
    );
  }

  const dumpFile = sqliteDumpPath();
  if (!fs.existsSync(dumpFile)) {
    throw new Error(`找不到导出文件，请先运行 npx tsx scripts/export-sqlite.ts: ${dumpFile}`);
  }

  const dump = JSON.parse(fs.readFileSync(dumpFile, "utf8")) as SqliteDump;
  const imported: Record<string, number> = {};

  let replica = false;
  try {
    await prisma.$executeRawUnsafe("SET session_replication_role = replica");
    replica = true;
  } catch {
    replica = false;
  }

  try {
    for (const table of SQLITE_EXPORT_TABLES) {
      const rows = (dump.tables[table] ?? []).map((row) => normalizeRow(row));
      if (rows.length === 0) {
        imported[table] = 0;
        continue;
      }
      const key = PRISMA_DELEGATE[table];
      const delegate = (prisma as unknown as Record<string, Delegate>)[key];
      if (!delegate?.createMany) {
        throw new Error(`Prisma delegate missing: ${key}`);
      }
      const result = await delegate.createMany({
        data: rows,
        skipDuplicates: true,
      });
      imported[table] = result.count;
    }
  } finally {
    if (replica) {
      await prisma.$executeRawUnsafe("SET session_replication_role = DEFAULT");
    }
  }

  console.log("OK import-postgres", imported);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
