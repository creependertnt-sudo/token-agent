import { finalizeSalesDecision } from "../lib/sales-decision-engine";
import { buildSalesConversion } from "../lib/sales-conversion";
import { estimateUsage } from "../lib/usage-estimator";
import { extractCustomerDemandSignals } from "../lib/customer-analysis";
import { runSalesPipeline } from "../lib/sales-pipeline";
import { prisma } from "../lib/db";
import {
  getLatestRecommendedPackage,
  markSalesConversionClicked,
  markSalesConversionPaid,
  recordSalesConversionShown,
} from "../lib/sales-conversion-log";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const pkg = {
  id: "pkg_std",
  name: "标准套餐",
  tokenAmount: 50_000,
  price: 99,
};

const heavyUsage = estimateUsage({
  message: "公司 50 个人高并发 API",
  signals: extractCustomerDemandSignals("公司 50 个人高并发 API"),
  memory: null,
  tokenBalance: 100,
  recentOrders: [{ packageName: "基础套餐", tokenAmount: 10_000 }],
  consumedTokens: 12_000,
});

assert(heavyUsage.exceedHistory === true, "consumed exceeds last package");

const strong = finalizeSalesDecision({
  customerLevel: "VIP",
  usageEstimate: heavyUsage,
  upsell: true,
  recommendedPackage: pkg,
});
const strongCta = buildSalesConversion({
  finalDecision: strong,
  salesIntent: "ENTERPRISE_PLAN",
});
assert(strongCta.pushStrategy === "STRONG", "vip strong");
assert(strongCta.showProducts === true, "strong shows card");
assert(strongCta.products.length === 1, "strong one card");
assert(strongCta.products[0]?.id === "pkg_std", "strong recommended id");
assert(strongCta.rechargePath.includes("pkg_std"), "deep link");

const none = finalizeSalesDecision({
  customerLevel: "LOW_VALUE",
  usageEstimate: null,
  upsell: false,
  recommendedPackage: null,
});
const noneCta = buildSalesConversion({
  finalDecision: none,
  salesIntent: "GENERAL_CHAT",
});
assert(noneCta.pushStrategy === "NONE", "no package → none");
assert(noneCta.showProducts === false, "none hides cards");
assert(noneCta.products.length === 0, "none empty products");

const soft = finalizeSalesDecision({
  customerLevel: "LOW_VALUE",
  usageEstimate: estimateUsage({
    message: "多少钱",
    signals: extractCustomerDemandSignals("多少钱"),
    memory: null,
    tokenBalance: 0,
    recentOrders: [],
  }),
  upsell: false,
  recommendedPackage: pkg,
});
const softChat = buildSalesConversion({
  finalDecision: soft,
  salesIntent: "GENERAL_CHAT",
});
assert(softChat.showProducts === false, "soft general hides cards");

const softPrice = buildSalesConversion({
  finalDecision: soft,
  salesIntent: "PRICE_QUERY",
});
assert(softPrice.showProducts === true, "soft price shows one card");
assert(softPrice.products.length === 1, "soft price one card");
assert(softPrice.ctaIntensity === "educate", "soft price educate");

const medium = finalizeSalesDecision({
  customerLevel: "POTENTIAL",
  usageEstimate: null,
  upsell: false,
  recommendedPackage: pkg,
});
const mediumCta = buildSalesConversion({
  finalDecision: medium,
  salesIntent: "PRICE_QUERY",
  chatIntent: "purchase",
});
assert(mediumCta.pushStrategy === "MEDIUM", "potential medium");
assert(mediumCta.showProducts === true, "medium shows card");

async function checkPipeline() {
  const hello = await runSalesPipeline("你好");
  assert(hello.conversion.pushStrategy !== "STRONG", "hello not strong");
  assert(hello.conversion.showProducts === false, "hello no cards");
  assert(hello.promptContext.includes("【转化动作】"), "prompt has conversion");
  assert(
    !hello.promptContext.includes("【套餐目录 TokenPackage】"),
    "hello must not include full catalog",
  );
  assert(
    !hello.promptContext.includes("【实时套餐目录"),
    "hello must not include live catalog",
  );
  assert(
    hello.promptContext.includes("本轮不推荐套餐"),
    "hello should hide package offer",
  );

  const buy = await runSalesPipeline("我想买token", { chatIntent: "purchase" });
  assert(buy.meta.intent === "PRICE_QUERY", `buy intent ${buy.meta.intent}`);
  assert(buy.conversion.showProducts === true, "buy shows card");
  assert(buy.conversion.products.length === 1, "buy one card");
  assert(
    (buy.conversion.products[0]?.name ?? "").includes("基础"),
    `buy package ${buy.conversion.products[0]?.name}`,
  );
  assert(buy.conversion.rechargePath.includes("?package="), "buy recharge query");
  assert(buy.promptContext.includes("【当前推荐套餐】"), "buy recommended block");
  assert(
    !buy.promptContext.includes("【套餐目录 TokenPackage】"),
    "buy must not include full catalog",
  );

  const ent = await runSalesPipeline("我们公司50个人要用高并发API");
  assert(ent.conversion.pushStrategy === "STRONG", "enterprise strong");
  assert(ent.conversion.showProducts === true, "enterprise cards");
  assert(ent.conversion.products.length === 1, "enterprise one package");
  assert(
    (ent.conversion.products[0]?.name ?? "").includes("企业"),
    `ent package ${ent.conversion.products[0]?.name}`,
  );
  assert(
    !ent.promptContext.includes("【套餐目录 TokenPackage】"),
    "ent must not include full catalog",
  );

  console.log("OK sales-conversion", {
    hello: hello.meta.pushStrategy,
    buy: buy.meta.recommendedPackage,
    ent: ent.meta.recommendedPackage,
  });

  const user = await prisma.user.findFirst({ select: { id: true } });
  const pkgRow = await prisma.tokenPackage.findFirst({
    where: { active: true },
    orderBy: { tokenAmount: "asc" },
  });
  if (user && pkgRow) {
    const shown = await recordSalesConversionShown({
      userId: user.id,
      packageId: pkgRow.id,
      strategy: "MEDIUM",
    });
    const rec = await getLatestRecommendedPackage(user.id);
    assert(rec?.id === pkgRow.id, "402 latest recommended package");
    await markSalesConversionClicked({
      userId: user.id,
      conversionId: shown.id,
    });
    await markSalesConversionPaid({
      userId: user.id,
      packageId: pkgRow.id,
    });
    const paid = await prisma.salesConversion.findUnique({
      where: { id: shown.id },
    });
    assert(paid?.status === "PAID", `expected PAID got ${paid?.status}`);
    await prisma.salesConversion.delete({ where: { id: shown.id } });
    console.log("OK sales-conversion log SHOWN→CLICKED→PAID");
  }

  await prisma.$disconnect();
}

checkPipeline().catch((e) => {
  console.error(e);
  process.exit(1);
});
