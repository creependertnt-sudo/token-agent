import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  SQLITE_EXPORT_TABLES,
  sqliteDumpPath,
  type SqliteDump,
} from "./db-tables";

function resolveSqliteFile(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw && /^(postgres|postgresql):\/\//i.test(raw)) {
    return path.join(process.cwd(), "data.db");
  }
  if (raw?.startsWith("file:")) {
    const file = raw.slice("file:".length);
    return path.isAbsolute(file)
      ? file
      : path.join(process.cwd(), file.replace(/^\.\//, ""));
  }
  return path.join(process.cwd(), "data.db");
}

function main() {
  const dbPath = resolveSqliteFile();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite file not found: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });
  const tables: SqliteDump["tables"] = {};

  for (const table of SQLITE_EXPORT_TABLES) {
    const exists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table) as { name?: string } | undefined;
    if (!exists) {
      tables[table] = [];
      continue;
    }
    tables[table] = db
      .prepare(`SELECT * FROM "${table}"`)
      .all() as Record<string, unknown>[];
  }

  db.close();

  const dump: SqliteDump = {
    exportedAt: new Date().toISOString(),
    source: dbPath,
    tables,
  };

  const outPath = sqliteDumpPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), "utf8");

  const summary = Object.fromEntries(
    SQLITE_EXPORT_TABLES.map((table) => [table, tables[table]?.length ?? 0]),
  );
  console.log("OK export-sqlite", { outPath, summary });
}

main();
