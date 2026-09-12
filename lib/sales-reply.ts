import type { ChatIntent } from "@/lib/intent";
import type { SalesDecision } from "@/lib/sales-decision";
import type { PackageRecommendResult } from "@/lib/package-recommend";
import type { FinalSalesDecision } from "@/lib/sales-decision-engine";
import type { SalesConversion } from "@/lib/sales-conversion";
import { getServiceUiLabel, SERVICE_CONFIG } from "@/lib/constants";

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
  return `购买：打开 [${path}](${path}) 选套餐 → 确认 →「支付成功」到账后，在顶部切换 Alpha / Beta / Gamma。`;
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
- **模型档位选择**：Alpha / Beta / Gamma 自主切换
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
      return `听起来你更在意效果和成本是否平衡，我会按这个前提给建议。

这种场景通常更适合 **Beta（均衡推荐）**：在成本和效果之间比较稳妥。

如果你接下来会频繁使用，更建议选择 ${rec}——适合连续调试与多轮对话，整体更划算。
${packageRecommendation?.reason ? `\n${packageRecommendation.reason}\n` : ""}
这个问题大概还需要 2～3 次对话才能完整解决；准备好额度后，我们可以顺着当前问题继续。`;
    }

    if (push === "MEDIUM" && rec) {
      return `我理解你现在是在选型，既想控制成本，又不想效果太弱。

可以先看档位：Alpha 5 / Beta 20 / Gamma 50 Token/次；咨询本身免费。结合你的需求，更建议从 **Beta** 起步。

额度方面更建议 ${rec}——适合连续调试项目、多轮对话。
${packageRecommendation?.reason ? `\n${packageRecommendation.reason}\n` : ""}
这个问题大概还需要 2～3 次对话才能完整解决。如果你愿意，我可以按你的场景再帮你收窄一档。`;
    }

    if (
      si === "PRICE_QUERY" ||
      intent === "purchase" ||
      intent === "recharge"
    ) {
      const recLine = rec
        ? `\n\n如果你会持续使用，更建议 ${rec}——适合连续调试与多轮对话。这个问题大概还需要 2～3 次对话才能完整解决。`
        : "";
      return `计费可以这样理解（数字以目录为准）：

- Alpha 5 / Beta 20 / Gamma 50 Token/次；Guide 咨询免费${recLine}

若还没定通道：告诉我场景（学习 / 开发 / 企业），我帮你对一下更合适的档位。`;
    }

    if (readyToRecommend && recommendation.primary) {
      const cfg = SERVICE_CONFIG[recommendation.primary];
      const primaryLabel = getServiceUiLabel(recommendation.primary);
      const altLabels = recommendation.alternatives
        .map((t) => getServiceUiLabel(t))
        .join(" / ");
      const pkgLine = rec
        ? `\n\n如果你接下来会频繁使用，更建议 ${rec}——适合连续调试与多轮对话。`
        : "";
      return `听起来你的场景对成本和效果都有要求，我按这个前提来建议。

这种场景更适合 **${primaryLabel}**，约 ${cfg.cost} Token/次。

${recommendation.reason}${pkgLine}

这个问题大概还需要 2～3 次对话才能完整解决。可在顶栏切换到该通道继续；需要额度时再补充即可。
备选：${altLabels || "按需再调"}。`;
    }

    const qs =
      clarifyingQuestions.length > 0
        ? clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : `1. 使用场景？\n2. 是否要写代码？\n3. 预算偏好？`;

    return `收到。我先确认几项，再给你推荐 Alpha / Beta / Gamma：

${qs}

你简单回这几项就行。`;
  }

  if (intent === "purchase" || intent === "recharge" || intent === "insufficient") {
    const recLine = rec ? `\n当前更建议：${rec}\n` : "";
    return `可以的，先看计费与推荐套餐：
${recLine}
${buyGuide(path)}`;
  }

  return `你好，我是 Mira AI 销售助手，可以帮你了解套餐、推荐通道并完成选型咨询。告诉我你的场景（学习/开发/企业）、是否要写代码、预算偏好，我帮你推荐通道。`;
}
