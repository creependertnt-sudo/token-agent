import type { ChatIntent } from "@/lib/intent";
import type {
  FinalSalesDecision,
  PushStrategy,
} from "@/lib/sales-decision-engine";

export type ConversionProduct = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

export type CtaIntensity = "buy" | "suggest" | "educate" | "qualify";

export type SalesConversion = {
  showProducts: boolean;
  products: ConversionProduct[];
  ctaIntensity: CtaIntensity;
  promptHint: string;
  rechargePath: string;
  pushStrategy: PushStrategy;
};

const PRICE_LIKE = new Set([
  "PRICE_QUERY",
  "purchase",
  "recharge",
  "insufficient",
]);

function hasPackageId(
  pkg: FinalSalesDecision["finalPackage"],
): pkg is NonNullable<FinalSalesDecision["finalPackage"]> & { id: string } {
  return Boolean(pkg?.id);
}

/**
 * 决策引擎 → 转化动作：何时出商品卡、出哪一张、购买引导强度。
 * 禁止按关键词甩出全部套餐。
 */
export function buildSalesConversion(input: {
  finalDecision: FinalSalesDecision | null;
  salesIntent: string;
  chatIntent?: ChatIntent | string | null;
}): SalesConversion {
  const push: PushStrategy = input.finalDecision?.pushStrategy ?? "NONE";
  const pkg = input.finalDecision?.finalPackage ?? null;
  const product: ConversionProduct | null = hasPackageId(pkg)
    ? {
        id: pkg.id,
        name: pkg.name,
        tokenAmount: pkg.tokenAmount,
        price: pkg.price,
      }
    : null;

  const askedPrice =
    PRICE_LIKE.has(input.salesIntent) ||
    PRICE_LIKE.has(String(input.chatIntent ?? ""));

  let showProducts = false;
  let ctaIntensity: CtaIntensity = "qualify";

  if (!product || push === "NONE") {
    showProducts = false;
    ctaIntensity = "qualify";
  } else if (push === "STRONG") {
    showProducts = true;
    ctaIntensity = "buy";
  } else if (push === "MEDIUM") {
    showProducts = true;
    ctaIntensity = "suggest";
  } else if (push === "SOFT" && askedPrice) {
    showProducts = true;
    ctaIntensity = "educate";
  } else {
    showProducts = false;
    ctaIntensity = "educate";
  }

  const rechargePath =
    showProducts && product
      ? `/recharge?package=${encodeURIComponent(product.id)}`
      : "/recharge";

  return {
    showProducts,
    products: showProducts && product ? [product] : [],
    ctaIntensity,
    rechargePath,
    pushStrategy: push,
    promptHint: formatConversionHint({
      push,
      product,
      rechargePath,
      showProducts,
      ctaIntensity,
    }),
  };
}

function formatConversionHint(input: {
  push: PushStrategy;
  product: ConversionProduct | null;
  rechargePath: string;
  showProducts: boolean;
  ctaIntensity: CtaIntensity;
}): string {
  const pkgLine = input.showProducts && input.product
    ? `${input.product.name}（${input.product.tokenAmount.toLocaleString()} Token，¥${input.product.price}）`
    : "本轮不展示套餐";

  const action =
    input.ctaIntensity === "buy"
      ? "直接推荐最终套餐并引导购买，附购买链接。"
      : input.ctaIntensity === "suggest"
        ? "先解释适配原因，再推荐最终套餐，询问是否符合需求。"
        : input.ctaIntensity === "educate"
          ? "先讲清计费与适用场景；用户已问价时只提最终套餐，不要罗列目录。"
          : "先问诊，不要推销套餐。";

  return `【转化动作】
推进策略：${input.push}
展示商品卡：${input.showProducts ? "是（仅最终套餐 1 张）" : "否"}
最终套餐：${pkgLine}
购买链接：${input.rechargePath}
执行：${action}
硬规则：禁止列出全部套餐；禁止把未推荐的套餐做成卡片；数字必须来自最终套餐。`;
}

export function formatSalesConversionForPrompt(
  conversion: SalesConversion,
): string {
  return conversion.promptHint;
}

/** 只注入最终推荐套餐；禁止完整目录。 */
export function formatCurrentRecommendedPackageForPrompt(input: {
  name: string;
  tokenAmount: number;
  price: number;
  reason: string;
} | null): string {
  if (!input) {
    return `【当前推荐套餐】
本轮不推荐套餐。禁止列出任何 Token 套餐名称、价格或目录。`;
  }

  return `【当前推荐套餐】
${input.name}
${input.tokenAmount.toLocaleString()} Token
价格 ¥${input.price}
原因：
${input.reason}

硬规则：只允许引用上述这一套餐。禁止提及或罗列其他套餐名称与价格。禁止输出基础/标准/企业套餐对照表。`;
}
