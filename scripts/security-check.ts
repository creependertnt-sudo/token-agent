import { execSync } from "child_process";

export type SecurityCheckResult = {
  ok: boolean;
  issues: string[];
  trackedCount: number;
};

const PLACEHOLDER =
  /your[_-]?key|changeme|placeholder|example|xxx|todo|<.+>/i;

function trackedFiles(): string[] {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function isForbiddenPath(file: string): boolean {
  const n = file.replace(/\\/g, "/");
  if (n === ".env") return true;
  if (
    n.startsWith(".env.") &&
    n !== ".env.example" &&
    n !== ".env.production.example"
  ) {
    return true;
  }
  if (n.endsWith(".db") || n.endsWith(".sqlite")) return true;
  if (n === "node_modules" || n.startsWith("node_modules/")) return true;
  if (n === ".next" || n.startsWith(".next/")) return true;
  return false;
}

function looksLikeLiveKey(line: string): boolean {
  if (PLACEHOLDER.test(line)) return false;
  if (/OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{8,}/.test(line)) return true;
  if (/DEEPSEEK_KEY\s*=\s*sk-[A-Za-z0-9_-]{8,}/.test(line)) return true;
  if (/(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/.test(line)) return true;
  return false;
}

export function runSecurityCheck(): SecurityCheckResult {
  const files = trackedFiles();
  const issues: string[] = [];

  for (const file of files) {
    if (isForbiddenPath(file)) {
      issues.push(`tracked forbidden path: ${file}`);
    }
  }

  let grep = "";
  try {
    grep = execSync(
      'git grep -n -I -E "OPENAI_API_KEY|DEEPSEEK_KEY|sk-[A-Za-z0-9_-]{16,}"',
      { encoding: "utf8" },
    );
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    if (err.status === 1) grep = "";
    else grep = err.stdout ?? "";
  }

  for (const line of grep.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const path = line.split(":")[0] ?? "";
    const tracked = path.replace(/\\/g, "/");
    if (tracked === ".env.example" || tracked === ".env.production.example") {
      continue;
    }
    if (looksLikeLiveKey(line)) {
      issues.push(`possible secret in git: ${line.slice(0, 180)}`);
    }
  }

  return { ok: issues.length === 0, issues, trackedCount: files.length };
}

function main() {
  const result = runSecurityCheck();
  if (!result.ok) {
    console.error("FAIL security-check", result.issues);
    process.exit(1);
  }
  console.log("OK security-check", { trackedCount: result.trackedCount });
}

if (process.argv[1]?.includes("security-check")) {
  main();
}
