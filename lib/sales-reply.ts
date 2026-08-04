import type { ChatIntent } from "@/lib/intent";
import type { SalesDecision } from "@/lib/sales-decision";
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

/**
 * SALES 无 API Key 时的模板兜底（结合销售决策）。
 */
export function buildSalesTemplateReply(input: {
  message: string;
  intent: ChatIntent;
  tokenBalance: number;
  packages: PackageRow[];
  models: ModelRow[];
  knowledgeText?: string;
  salesDecision?: SalesDecision;
}): string {
  const { intent, packages, salesDecision } = input;

  const packageBlock =
    packages.length === 0
      ? "暂无可用套餐，请稍后再试。"
      : packages
          .map(
            (p) =>
              `- **${p.name}**：${p.tokenAmount.toLocaleString()} Token，¥${Number(p.price).toFixed(2)}`,
          )
          .join("\n");

  const buyGuide = `购买：打开 [/recharge](/recharge) 选套餐 → 确认 →「支付成功」到账后，在顶部切换 LIGHT / STANDARD / PREMIUM。`;

  if (salesDecision) {
    const { intent: si, recommendation, clarifyingQuestions, readyToRecommend } =
      salesDecision;

    if (si === "PRODUCT_COMPARE") {
      return `相比市面常见 AI Agent 平台（如 Coze、Dify、FastGPT、Chatbase），我们不贬低对方，而是按你的目标说明差异：

1. **计费更透明**：LIGHT/STANDARD/PREMIUM 固定按次，不因问题变难自动加价  
2. **自主选档**：顶栏手动切换，系统不替你升级  
3. **免费售前问诊**：SALES 先帮你选型，再决定买哪一档  
4. **会话记忆与数据隔离**：按用户隔离

你更看重编排搭建，还是「可控计费的多档对话 Agent」？我可以按你的场景继续细说。`;
    }

    if (si === "PRICE_QUERY" || intent === "purchase" || intent === "recharge") {
      return `可以先看计费与套餐（数字以目录为准）：

- LIGHT 5 / STANDARD 20 / PREMIUM 50 Token/次；SALES 咨询免费  
${packageBlock}

${buyGuide}

若还没定通道：学生轻度 → LIGHT；项目开发 → STANDARD；企业架构 → PREMIUM。`;
    }

    if (readyToRecommend && recommendation.primary) {
      const cfg = SERVICE_CONFIG[recommendation.primary];
      return `根据你的场景，更建议 **${recommendation.primary}（${cfg.name}）**，约 ${cfg.cost} Token/次。

${recommendation.reason}

可在聊天顶栏切换到该通道。需要额度时走 [/recharge](/recharge)。  
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
    return `可以的，下面是当前可购套餐：

${packageBlock}

${buyGuide}`;
  }

  return `我是 Token AI客服。告诉我你的场景（学习/开发/企业）、是否要写代码、预算偏好，我帮你推荐通道。`;
}
