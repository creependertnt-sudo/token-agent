import type { ChatIntent } from "@/lib/intent";
import type { SalesDecision } from "@/lib/sales-decision";
import type { PackageRecommendResult } from "@/lib/package-recommend";
import type { FinalSalesDecision } from "@/lib/sales-decision-engine";
import type { SalesConversion } from "@/lib/sales-conversion";
import { SERVICE_CONFIG } from "@/lib/constants";

type PackageRow = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
  description: string | null;
};

type ModelRow = {
  name: string;
  description: string | null;
  contextWindow: number | null;
  provider: { name: string };
};

function recommendedLine(conversion: SalesConversion | null | undefined): string {
  const pkg = conversion?.products[0];
  if (!pkg) return "";
  return `**${pkg.name}**：${pkg.tokenAmount.toLocaleString()} Token，¥${Number(pkg.price).toFixed(2)}`;
}

function buyGuide(path: string): string {
  return `购买：打开 [${path}](${path}) 选套餐 → 确认 →「支付成功」到账后，在顶部切换 LIGHT / STANDARD / PREMIUM。`;
}

/**
 * SALES 无 API Key 时的模板兜底（服从决策引擎推进策略）。
 */
export function buildSalesTemplateReply(input: {
  message: string;
  intent: ChatIntent;
  tokenBalance: number;
  packages: PackageRow[];
  models: ModelRow[];
  knowledgeText?: string;
  salesDecision?: SalesDecision;
  packageRecommendation?: PackageRecommendResult | null;
  finalDecision?: FinalSalesDecision | null;
  conversion?: SalesConversion | null;
}): string {
  const { intent, salesDecision, packageRecommendation, conversion } = input;
  const path = conversion?.rechargePath ?? "/recharge";
  const rec = recommendedLine(conversion);
  const push = conversion?.pushStrategy ?? input.finalDecision?.pushStrategy;

  if (salesDecision) {
    const { intent: si, recommendation, clarifyingQuestions, readyToRecommend } =
      salesDecision;

    if (si === "PRODUCT_COMPARE") {
      const hasCompetitorHit =
        typeof input.knowledgeText === "string" &&
        /###\s+\S+（[a-z0-9_-]+）/.test(input.knowledgeText) &&
        !input.knowledgeText.includes("本次未命中具体竞品条目");

      const compareCore = hasCompetitorHit
        ? `不同AI服务计费方式不同，未写明的对方报价我不会猜测。

请以检索到的竞品条目为准，比较能力、计费方式和适用场景；不要编造价格差或便宜比例。

我们的特点仍是：模型档位可选、Token 套餐、按次成本可控、SALES 免费顾问。`
        : `不同AI服务计费方式不同，目前无法确认对方实时价格。

我们的特点：
- **模型档位选择**：LIGHT / STANDARD / PREMIUM 自主切换
- **Token 套餐**：按额度购买，数字以目录为准
- **成本控制**：按次固定 Token，不因问题变难自动加价
- **销售客服支持**：SALES 免费问诊，帮你选型`;

      const cta =
        (push === "STRONG" || push === "MEDIUM") && rec
          ? `\n\n结合你的场景，更建议 ${rec}。\n${buyGuide(path)}`
          : `\n\n如果告诉我您的使用场景（API 调用 / AI 客服 / 个人开发），我可以帮您选对应方案。`;

      return `${compareCore}${cta}`;
    }

    if (push === "NONE") {
      const qs =
        clarifyingQuestions.length > 0
          ? clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
          : `1. 使用场景？\n2. 是否要写代码？\n3. 预算偏好？`;
      return `收到。我先确认几项，再给你推荐方案：

${qs}

你简单回这几项就行。`;
    }

    if (push === "STRONG" && rec) {
      return `根据你的情况，建议购买 ${rec}。

${packageRecommendation?.reason ?? "该套餐与当前需求更匹配。"}

${buyGuide(path)}`;
    }

    if (push === "MEDIUM" && rec) {
      return `可以先看计费：LIGHT 5 / STANDARD 20 / PREMIUM 50 Token/次；SALES 咨询免费。

结合你的需求，更建议 ${rec}。
${packageRecommendation?.reason ? `\n${packageRecommendation.reason}\n` : ""}
这个套餐是否符合你现在的用量？需要的话走下面链接购买。

${buyGuide(path)}`;
    }

    if (
      si === "PRICE_QUERY" ||
      intent === "purchase" ||
      intent === "recharge"
    ) {
      const recLine = rec ? `\n\n当前更建议：${rec}\n` : "";
      return `可以先看计费（数字以目录为准）：

- LIGHT 5 / STANDARD 20 / PREMIUM 50 Token/次；SALES 咨询免费${recLine}
${buyGuide(path)}

若还没定通道：告诉我场景（学习 / 开发 / 企业），我帮你对一下档位。`;
    }

    if (readyToRecommend && recommendation.primary) {
      const cfg = SERVICE_CONFIG[recommendation.primary];
      const pkgLine = rec
        ? `\n额度方面更建议 ${rec}。${buyGuide(path)}`
        : `需要额度时走 [/recharge](/recharge)。`;
      return `根据你的场景，更建议 **${recommendation.primary}（${cfg.name}）**，约 ${cfg.cost} Token/次。

${recommendation.reason}

可在聊天顶栏切换到该通道。${pkgLine}
备选：${recommendation.alternatives.join(" / ") || "按需再调"}。`;
    }

    const qs =
      clarifyingQuestions.length > 0
        ? clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : `1. 使用场景？\n2. 是否要写代码？\n3. 预算偏好？`;

    return `收到。我先确认几项，再给你推荐 LIGHT / STANDARD / PREMIUM：

${qs}

你简单回这几项就行。`;
  }

  if (intent === "purchase" || intent === "recharge" || intent === "insufficient") {
    const recLine = rec ? `\n当前更建议：${rec}\n` : "";
    return `可以的，先看计费与推荐套餐：
${recLine}
${buyGuide(path)}`;
  }

  return `我是 Token AI客服。告诉我你的场景（学习/开发/企业）、是否要写代码、预算偏好，我帮你推荐通道。`;
}
