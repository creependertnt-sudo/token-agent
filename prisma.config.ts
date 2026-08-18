import { defineConfig } from "prisma/config";
import {
  isPostgresUrl,
  resolveDatabaseUrl,
} from "./lib/database-url";

const url = resolveDatabaseUrl();
const postgres = isPostgresUrl(url);

export default defineConfig({
  schema: postgres ? "prisma/schema.prisma" : "prisma/schema.sqlite.prisma",
  migrations: {
    path: postgres ? "prisma/migrations-pg" : "prisma/migrations",
  },
  datasource: {
    url,
  },
});
