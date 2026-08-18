import { SERVICE_CONFIG } from "../lib/constants";
import { AppError, errorResponse } from "../lib/app-error";
import { authorizeAdmin } from "../lib/admin-auth";
import { getAdminOverviewStats } from "../lib/admin-overview";
import { runHealthCheck } from "../lib/health";
import { runSecurityCheck } from "./security-check";
import { prisma } from "../lib/db";
import { createRequestId } from "../lib/request-context";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  try {
    authorizeAdmin({ id: "u", email: "u@x", role: "USER" });
    throw new Error("user must be forbidden");
  } catch (error) {
    assert(error instanceof AppError && error.status === 403, "权限 USER 403");
  }
  authorizeAdmin({ id: "a", email: "a@x", role: "ADMIN" });
  console.log("PASS 权限");

  const overview = await getAdminOverviewStats();
  assert(typeof overview.todayRequests === "number", "todayRequests");
  assert(typeof overview.successRate === "string", "successRate");
  assert(
    overview.averageDuration === null || typeof overview.averageDuration === "number",
    "averageDuration",
  );
  assert(typeof overview.paidOrders === "number", "paidOrders");
  console.log("PASS Dashboard", overview);

  const health = await runHealthCheck();
  assert(health.database === true, "database SELECT 1");
  assert(typeof health.model === "boolean", "model flag");
  assert(health.status === "ok" || health.status === "error", "health status");
  console.log("PASS Health", health);

  const res = errorResponse(
    new AppError("TOKEN_LOW", "Token不足", 402),
  );
  assert(res.status === 402, "error status");
  const body = (await res.json()) as {
    error?: { code?: string; message?: string };
  };
  assert(body.error?.code === "TOKEN_LOW", "error.code");
  assert(body.error?.message === "Token不足", "error.message");
  assert(!JSON.stringify(body).toLowerCase().includes("sk-"), "no api key");
  const leaked = errorResponse(new Error("DeepSeek 401 api key sk-secretvalue"));
  const leakedBody = await leaked.json();
  assert(!JSON.stringify(leakedBody).includes("sk-secretvalue"), "no stack/key");
  const requestId = createRequestId();
  assert(requestId.length > 8, "requestId");
  console.log("PASS Error格式", { requestId });

  const security = runSecurityCheck();
  assert(security.ok, security.issues.join("; "));
  console.log("PASS 安全扫描", { trackedCount: security.trackedCount });

  console.log("OK production-ready", { salesCost: SERVICE_CONFIG.SALES.cost });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
