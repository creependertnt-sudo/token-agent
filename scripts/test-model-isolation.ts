/**
 * 四模型隔离 + 昵称 API 测试
 * 运行：npx tsx scripts/test-model-isolation.ts
 */
import {
  SERVICE_GENERATION_LIMITS,
  SERVICE_TOKEN_COST,
} from "../lib/constants";
import {
  buildAgentSystemPrompt,
  enforceTierReply,
  getLockedTokenCost,
  isChatServiceType,
} from "../lib/agent-router";
import { resolveModelRouteByType } from "../lib/model-router";

const COMPLEX =
  "帮我设计一个完整AI公司的技术架构，包括前端、后端、数据库、部署方案";

type Result = { name: string; ok: boolean; detail: string };

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function unitTests(): Result[] {
  const results: Result[] = [];

  try {
    for (const t of ["SALES", "LIGHT", "STANDARD", "PREMIUM"] as const) {
      assert(isChatServiceType(t), `${t} should be valid`);
      assert(getLockedTokenCost(t) === SERVICE_TOKEN_COST[t], `cost ${t}`);
    }
    results.push({
      name: "SERVICE_TOKEN_COST 锁定",
      ok: true,
      detail: `SALES=0 LIGHT=5 STANDARD=20 PREMIUM=50`,
    });
  } catch (e) {
    results.push({
      name: "SERVICE_TOKEN_COST 锁定",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    assert(resolveModelRouteByType("SALES").callLlm === true, "SALES uses LLM");
    assert(resolveModelRouteByType("SALES").tokenCost === 0, "SALES free");
    for (const t of ["LIGHT", "STANDARD", "PREMIUM"] as const) {
      const r = resolveModelRouteByType(t);
      assert(r.serviceType === t && r.tokenCost === SERVICE_TOKEN_COST[t], t);
      assert(r.maxTokens === SERVICE_GENERATION_LIMITS[t].maxTokens, `${t} tokens`);
    }
    results.push({
      name: "model-router 无自动升级",
      ok: true,
      detail: "SALES LLM·0 / 按 serviceType 锁定 cost/maxTokens",
    });
  } catch (e) {
    results.push({
      name: "model-router 无自动升级",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const long = "架构方案。".repeat(200);
    const light = enforceTierReply("LIGHT", long);
    assert(light.length < long.length, "LIGHT truncated");
    assert(/LIGHT|STANDARD|PREMIUM/i.test(light), "hint");
    results.push({
      name: "enforceTierReply 硬隔离",
      ok: true,
      detail: `LIGHT 裁剪后 len=${light.length}`,
    });
  } catch (e) {
    results.push({
      name: "enforceTierReply 硬隔离",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const light = buildAgentSystemPrompt({
      serviceType: "LIGHT",
      memories: [],
      tokenBalance: 100,
    });
    assert(light.includes("LIGHT") || light.includes("A模型"), "identity");
    assert(light.includes("5"), "LIGHT cost in prompt");
    assert(!light.includes("模型身份：PREMIUM"), "LIGHT not PREMIUM");

    const sales = buildAgentSystemPrompt({
      serviceType: "SALES",
      memories: [],
      tokenBalance: 100,
      salesCatalog: {
        packagesText: "- 入门包：1000 Token",
        modelsText: "- demo",
        showProducts: false,
      },
    });
    assert(sales.includes("模型身份：SALES · 销售客服"), "SALES id line");
    assert(sales.includes("Token AI客服"), "SALES public name");
    assert(sales.includes("销售知识库检索结果") || sales.includes("知识库"), "rag slot");
    assert(sales.includes("先判断") || sales.includes("用户需求"), "sales flow");
    assert(sales.includes("禁止说"), "forbid paid identity");
    assert(
      sales.includes("LIGHT") && sales.includes("STANDARD") && sales.includes("PREMIUM"),
      "channel map",
    );

    const standard = buildAgentSystemPrompt({
      serviceType: "STANDARD",
      memories: [],
      tokenBalance: 100,
    });
    assert(standard.includes("模型身份：STANDARD · B模型AI"), "STANDARD id");
    assert(standard.includes("20 Token"), "STANDARD cost");
    assert(!standard.includes("模型身份：PREMIUM"), "STANDARD not PREMIUM");
    assert(standard.includes("禁止自称") && standard.includes("PREMIUM"), "forbid PREMIUM");

    const premium = buildAgentSystemPrompt({
      serviceType: "PREMIUM",
      memories: [],
      tokenBalance: 100,
    });
    assert(premium.includes("PREMIUM") && premium.includes("C模型"), "PREMIUM id");
    assert(premium.includes("50"), "PREMIUM cost");
    assert(!/默认 STANDARD|默认.*STANDARD/i.test(premium), "no default STANDARD");

    const fixed = enforceTierReply(
      "STANDARD",
      "我是 PREMIUM（C模型AI）。本次服务为 STANDARD 模型，固定消耗20 Token。你好",
    );
    assert(!/我是 PREMIUM|C模型AI/.test(fixed), "no PREMIUM claim");
    assert(!/固定消耗|本次服务为/.test(fixed), "no billing lines");
    assert(fixed.includes("你好"), "body kept");

    results.push({
      name: "agent-router Prompt 隔离",
      ok: true,
      detail: "SALES顾问 / LIGHT=A / STANDARD=B / PREMIUM=C",
    });
  } catch (e) {
    results.push({
      name: "agent-router Prompt 隔离",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return results;
}

async function apiTests(): Promise<Result[]> {
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const email = `iso-test-${Date.now()}@example.com`;
  const password = "Test1234!";
  const results: Result[] = [];

  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const regData = await reg.json();
    if (!reg.ok) {
      throw new Error(regData.error ?? `register ${reg.status}`);
    }
    assert(Boolean(regData.user?.nickname), "register nickname");

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await login.json();
    if (!login.ok) throw new Error(loginData.error ?? "login failed");

    const setCookie = login.headers.getSetCookie?.() ?? [];
    let cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
    if (!cookieHeader) {
      const raw = login.headers.get("set-cookie");
      if (raw) cookieHeader = raw.split(",")[0]?.split(";")[0] ?? "";
    }

    const { prisma } = await import("../lib/db");
    await prisma.user.update({
      where: { email },
      data: { tokenBalance: 500 },
    });

    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      Authorization: `Bearer ${loginData.token ?? ""}`,
    };

    async function chat(serviceType: string, message: string) {
      const before = await prisma.user.findUnique({
        where: { email },
        select: { tokenBalance: true },
      });
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ message, serviceType }),
      });
      const data = await res.json();
      const after = await prisma.user.findUnique({
        where: { email },
        select: { tokenBalance: true },
      });
      return {
        status: res.status,
        data,
        spent: (before?.tokenBalance ?? 0) - (after?.tokenBalance ?? 0),
      };
    }

    {
      const r = await chat("SALES", "我想做一个网站");
      const reply = String(r.data.reply ?? "");
      const ok =
        r.status === 200 &&
        r.data.lockedType === "SALES" &&
        r.data.featureCost === 0 &&
        r.spent === 0 &&
        r.data.modelRoute?.callLlm === true &&
        r.data.modelRoute?.tokenCost === 0 &&
        !/我是\s*C模型AI|我是\s*B模型AI/i.test(reply);
      results.push({
        name: "API SALES",
        ok,
        detail: ok
          ? `callLlm=true cost=0 len=${reply.length}`
          : JSON.stringify({
              status: r.status,
              featureCost: r.data.featureCost,
              callLlm: r.data.modelRoute?.callLlm,
              reply: reply.slice(0, 200),
            }),
      });
    }

    {
      const r = await chat("LIGHT", COMPLEX);
      const reply = String(r.data.reply ?? "");
      const ok =
        r.status === 200 &&
        r.data.featureCost === 5 &&
        r.spent === 5 &&
        reply.length < 1200;
      results.push({
        name: "API LIGHT 复杂问题",
        ok,
        detail: ok
          ? `cost=5 len=${reply.length}`
          : JSON.stringify({
              status: r.status,
              cost: r.data.featureCost,
              spent: r.spent,
              len: reply.length,
              err: r.data.error,
            }),
      });
    }

    {
      const r = await chat("STANDARD", COMPLEX);
      const ok = r.status === 200 && r.data.featureCost === 20 && r.spent === 20;
      results.push({
        name: "API STANDARD",
        ok,
        detail: ok
          ? `cost=20 len=${String(r.data.reply ?? "").length}`
          : JSON.stringify({ status: r.status, cost: r.data.featureCost }),
      });
    }

    {
      const r = await chat("PREMIUM", COMPLEX);
      const ok = r.status === 200 && r.data.featureCost === 50 && r.spent === 50;
      results.push({
        name: "API PREMIUM",
        ok,
        detail: ok
          ? `cost=50 len=${String(r.data.reply ?? "").length}`
          : JSON.stringify({ status: r.status, cost: r.data.featureCost }),
      });
    }

    {
      const nick = "TNT先生";
      const res = await fetch(`${base}/api/auth/me`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ nickname: nick }),
      });
      const data = await res.json();
      results.push({
        name: "API 修改昵称",
        ok: res.ok && data.user?.nickname === nick,
        detail: res.ok ? nick : JSON.stringify(data),
      });
    }
  } catch (e) {
    results.push({
      name: "API 集成",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return results;
}

async function main() {
  console.log("=== 单元测试 ===");
  const unit = unitTests();
  for (const r of unit) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);

  console.log("\n=== API 集成测试 ===");
  const api = await apiTests();
  for (const r of api) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);

  const all = [...unit, ...api];
  const failed = all.filter((r) => !r.ok);
  console.log(
    `\n合计 ${all.length}，通过 ${all.length - failed.length}，失败 ${failed.length}`,
  );
  if (failed.length) process.exit(1);
}

void main();
