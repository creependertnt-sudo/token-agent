import { createHmac } from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/db";

const ROOT = process.cwd();
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const USER_ID = "cms61mqfa0000u8j0qgz6pd3b";

function signSession(userId: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function parseDone(body: string) {
  const blocks = body.replace(/\r\n/g, "\n").split("\n\n");
  for (const block of blocks) {
    if (!block.includes("event: done")) continue;
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    try {
      return JSON.parse(data) as {
        showProducts?: boolean;
        products?: Array<{ id: string; name: string }>;
      };
    } catch {
      return null;
    }
  }
  return null;
}

async function chat(message: string) {
  const token = signSession(USER_ID);
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, serviceType: "SALES" }),
    signal: AbortSignal.timeout(90000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`chat ${res.status}: ${text.slice(0, 240)}`);
  }
  return parseDone(text);
}

async function latestLog() {
  return prisma.agentLog.findFirst({
    where: { userId: USER_ID },
    orderBy: { createdAt: "desc" },
  });
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const basic = await prisma.tokenPackage.findFirst({
    where: { name: "基础套餐", active: true },
    select: { id: true, name: true },
  });
  assert(Boolean(basic), "missing 基础套餐");

  console.log("--- 1. 有什么套餐？ ---");
  await chat("有什么套餐？");
  const log1 = await latestLog();
  console.log({
    id: log1?.id,
    toolUsed: log1?.toolUsed,
    toolSuccess: log1?.toolSuccess,
    intent: log1?.intent,
    purchased: log1?.purchased,
  });
  assert(Boolean(log1), "log1 missing");
  assert(
    (log1!.toolUsed ?? "").includes("query_packages"),
    `expected query_packages got ${log1!.toolUsed}`,
  );

  console.log("--- 2. 我想买 token ---");
  const done2 = await chat("我想买 token");
  const log2 = await latestLog();
  const pkg = await prisma.tokenPackage.findUnique({
    where: { id: log2?.recommendedPackageId ?? "" },
    select: { name: true },
  });
  console.log({
    id: log2?.id,
    recommendedPackageId: log2?.recommendedPackageId,
    packageName: pkg?.name,
    pushStrategy: log2?.pushStrategy,
    sseProducts: done2?.products?.map((p) => p.name),
    purchased: log2?.purchased,
  });
  assert(Boolean(log2), "log2 missing");
  assert(pkg?.name === "基础套餐", `expected 基础套餐 got ${pkg?.name}`);
  assert(
    log2!.pushStrategy === "STRONG" || log2!.pushStrategy === "MEDIUM",
    `expected STRONG/MEDIUM got ${log2!.pushStrategy}`,
  );

  console.log("--- 3. 完成支付 ---");
  const token = signSession(USER_ID);
  const orderRes = await fetch("http://localhost:3000/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ packageId: basic!.id }),
  });
  const orderJson = (await orderRes.json()) as { order?: { id: string } };
  assert(Boolean(orderJson.order?.id), `create order failed ${orderRes.status}`);
  const payRes = await fetch(
    `http://localhost:3000/api/orders/${orderJson.order!.id}/pay`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  assert(payRes.ok, `pay failed ${payRes.status}`);
  const afterPay = await prisma.agentLog.findUnique({ where: { id: log2!.id } });
  console.log({
    log2Id: log2!.id,
    purchased: afterPay?.purchased,
  });
  assert(afterPay?.purchased === true, "expected purchased=true");

  console.log("OK agent-log live", {
    q1: "query_packages",
    q2: `${pkg?.name} ${log2!.pushStrategy}`,
    pay: true,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
