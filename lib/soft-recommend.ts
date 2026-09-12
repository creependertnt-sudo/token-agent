import {
  SERVICE_UI_LABEL,
  type ChatServiceType,
} from "@/lib/constants";

export type SoftRecommend = {
  id: string;
  /** 一行主建议，像顾问口吻 */
  title: string;
  /** 补充说明，如预计轮次 */
  body?: string;
  /** 可选软操作（非购买） */
  actionLabel?: string;
  /** 点击后一键发送的文案 */
  actionPrompt?: string;
  /** 若需切模型，仅作本轮/后续建议目标 */
  suggestServiceType?: ChatServiceType;
};

const COMPLEX_HINT =
  /方案|架构|系统|项目|平台|简历|路线|实现|拆解|完整|多模块|前后端|数据库|部署|优化/;

function isComplexTask(userMessage: string, reply: string): boolean {
  const blob = `${userMessage}\n${reply}`;
  if (userMessage.trim().length >= 72) return true;
  if (reply.trim().length >= 520) return true;
  if (COMPLEX_HINT.test(blob) && reply.trim().length >= 180) return true;
  return /(?:^|\n)\s*(?:#{1,3}\s|[-*]\s|\d+[、.．]\s)/m.test(reply);
}

function estimateMoreRounds(userMessage: string, reply: string): string {
  const complex = isComplexTask(userMessage, reply);
  if (complex && /完整|架构|系统|平台|路线/.test(`${userMessage}${reply}`)) {
    return "这个大概还需要 3～5 次对话，我们可以一步步推进。";
  }
  if (complex) {
    return "这个大概还需要 2～3 次对话，我可以继续帮你细化。";
  }
  return "如果还想更落地，我们再聊 1～2 轮通常就够了。";
}

/**
 * 软推荐：顾问式提醒，不出现购买/强推。
 * 触发：对话 ≥ 2 轮，或判定为复杂任务。
 */
export function buildSoftRecommend(input: {
  sendCount: number;
  serviceType: ChatServiceType;
  userMessage: string;
  assistantReply: string;
  alreadyShown: boolean;
}): SoftRecommend | null {
  const { sendCount, serviceType, userMessage, assistantReply, alreadyShown } =
    input;

  // Guide / 销售通道不做这套软推荐，避免和转化卡叠在一起
  if (serviceType === "SALES") return null;
  if (alreadyShown) return null;

  const complex = isComplexTask(userMessage, assistantReply);
  if (sendCount < 2 && !complex) return null;

  const roundsLine = estimateMoreRounds(userMessage, assistantReply);
  const beta = SERVICE_UI_LABEL.STANDARD;
  const gamma = SERVICE_UI_LABEL.PREMIUM;

  // Alpha 做复杂任务 → 轻推 Beta
  if (serviceType === "LIGHT" && (complex || sendCount >= 2)) {
    return {
      id: "soft-try-beta",
      title: `建议你用 ${beta} 会更合适`,
      body: roundsLine,
      actionLabel: `用 ${beta} 继续`,
      actionPrompt: `请用 ${beta} 继续深化刚才的内容，帮我把下一步做得更具体。`,
      suggestServiceType: "STANDARD",
    };
  }

  // Beta 做很重的任务 → 轻提 Gamma，但仍偏顾问
  if (serviceType === "STANDARD" && complex && sendCount >= 2) {
    return {
      id: "soft-consider-gamma",
      title: `若后面要做完整实现，${gamma} 会更从容`,
      body: roundsLine,
      actionLabel: "先按现在继续",
      actionPrompt: "请先按当前深度继续，把下一步拆清楚就好。",
    };
  }

  // 同档续聊：只给轮次预期，不推升级
  if (sendCount >= 2) {
    return {
      id: "soft-rounds",
      title: "我们可以继续往下推进",
      body: roundsLine,
      actionLabel: "继续下一步",
      actionPrompt: "请继续下一步，尽量具体可执行。",
    };
  }

  if (complex) {
    return {
      id: "soft-complex-rounds",
      title: "这是个可以拆开做的任务",
      body: roundsLine,
      actionLabel: "先拆步骤",
      actionPrompt: "请先帮我拆成清晰步骤，标出眼下最该做的一步。",
    };
  }

  return null;
}
