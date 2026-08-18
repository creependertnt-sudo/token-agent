import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaCacheKey?: number;
};

/** 升级此数字可在 dev HMR 下强制丢弃旧 Prisma 单例 */
const PRISMA_CACHE_KEY = 22;

function createPrismaClient() {
  const dbPath = path.join(process.cwd(), "data.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;
  if (
    existing &&
    globalForPrisma.prismaCacheKey === PRISMA_CACHE_KEY &&
    typeof (existing as { aIService?: unknown }).aIService !== "undefined"
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
