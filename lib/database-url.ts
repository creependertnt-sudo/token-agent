import fs from "fs";
import path from "path";

export const DEFAULT_SQLITE_URL = "file:./data.db";

function loadEnvFile(file: string) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) return raw;
  return DEFAULT_SQLITE_URL;
}

export function isPostgresUrl(url: string): boolean {
  return /^(postgres|postgresql):\/\//i.test(url);
}

/** Prisma better-sqlite3 adapter prefers an absolute file: URL. */
export function sqliteAdapterUrl(url: string): string {
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  if (path.isAbsolute(file)) return `file:${file}`;
  return `file:${path.join(process.cwd(), file.replace(/^\.\//, ""))}`;
}
