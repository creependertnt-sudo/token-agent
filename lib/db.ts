import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  isPostgresUrl,
  resolveDatabaseUrl,
  sqliteAdapterUrl,
} from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaCacheKey?: number;
};

/** 升级此数字可在 dev HMR 下强制丢弃旧 Prisma 单例 */
const PRISMA_CACHE_KEY = 27;

function createPrismaClient() {
  const url = resolveDatabaseUrl();
  if (isPostgresUrl(url)) {
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: sqliteAdapterUrl(url) });
  return new PrismaClient({ adapter });
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaCacheKey === PRISMA_CACHE_KEY &&
    typeof (existing as { tenant?: unknown }).tenant !== "undefined"
  ) {
    return existing;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaCacheKey = PRISMA_CACHE_KEY;
  }
  return client;
}

export const prisma = getPrismaClient();
