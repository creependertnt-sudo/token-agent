import { prisma } from "@/lib/db";

export type HealthCheckResult = {
  status: "ok" | "error";
  database: boolean;
  model: boolean;
};

function modelsEndpoint(): string {
  const base = (
    process.env.OPENAI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).replace(/\/$/, "");
  return `${base}/models`;
}

export async function runHealthCheck(): Promise<HealthCheckResult> {
  let database = false;
  let model = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (error) {
    console.error("[health] database", error instanceof Error ? error.message : "db");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch(modelsEndpoint(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      model = response.ok;
    } catch (error) {
      console.error("[health] model", error instanceof Error ? error.message : "model");
    }
  }

  return {
    status: database && model ? "ok" : "error",
    database,
    model,
  };
}
