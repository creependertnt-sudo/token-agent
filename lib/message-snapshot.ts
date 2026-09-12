import {
  MODEL_LABEL,
  SERVICE_CONFIG,
  type ChatServiceType,
} from "@/lib/constants";

export type MessageModelSnapshot = {
  serviceType: string | null;
  modelName: string | null;
  tokenCost: number | null;
  tokenBalanceAfter?: number | null;
};

/** 正文末尾扣费页脚（兼容历史旧数据；新消息不再写入正文） */
const BILLING_FOOTER_RE =
  /\n*---\s*\n(?:已消耗\s*(\d+)\s*Token（锁定\s*([A-Z]+)\s*·\s*([^）]+)）[^]*?余额[：:]\s*([\d,]+)\s*Token\.?|通道\s*([A-Z]+)\s*·\s*([^·\n]+?)\s*·\s*免费\.?)\s*$/u;

/**
 * 从助手消息正文页脚回填模型快照（兼容迁移前旧数据）。
 * 仅作历史兜底；新消息必须以 DB / 发送时锁定字段为准。
 */
export function parseSnapshotFromContent(
  content: string,
): MessageModelSnapshot | null {
  const paid = content.match(
    /已消耗\s*(\d+)\s*Token（锁定\s*([A-Z]+)\s*·\s*([^）]+)）[^]*?余额[：:]\s*([\d,]+)/,
  );
  if (paid) {
    return {
      tokenCost: Number(paid[1]),
      serviceType: paid[2],
      modelName: paid[3].trim(),
      tokenBalanceAfter: Number(paid[4].replace(/,/g, "")),
    };
  }

  const free = content.match(/通道\s*([A-Z]+)\s*·\s*([^·\n]+?)\s*·\s*免费/);
  if (free) {
    return {
      tokenCost: 0,
      serviceType: free[1],
      modelName: free[2].trim(),
    };
  }

  return null;
}

/**
 * 去掉正文中的身份自我介绍与扣费说明。
 * Token / 档位信息只由气泡 Header 与底部状态栏展示。
 */
export function stripAssistantDisplayMeta(content: string): string {
  let text = content
    .replace(BILLING_FOOTER_RE, "")
    .replace(/\n*---\s*\n已消耗[\s\S]*$/u, "")
    .replace(/\n*---\s*\n通道[\s\S]*$/u, "")
    .replace(
      /\n*已消耗\s*\d+\s*Token（锁定[^）]*）[^\n]*余额[：:][^\n]*Token\.?\s*$/u,
      "",
    )
    .replace(/\n*通道\s*[A-Z]+\s*·\s*[^\n]*·\s*免费\.?\s*$/u, "")
    .replace(/\n*本次消耗[：:]\s*\d+\s*Token[^\n]*$/u, "")
    .replace(
      /\n{1,}已消耗\s*\d+\s*Token（锁定[^）]*）[^\n]*余额[：:][^\n]*Token\.?/gu,
      "",
    );

  // 档位截断提示 / 身份强调段
  text = text.replace(
    /\n*—{1,}\s*\n当前为\s*\*?\*?[^*\n]+\*?\*?[^\n]*/gu,
    "",
  );
  text = text.replace(/\n*—{1,}\s*\n回答已按当前通道[^\n]*/gu, "");

  // 独立成行的扣费 / 锁定声明
  text = text.replace(
    /^(?:本次服务为|当前锁定|本轮(?:唯一)?锁定|固定消耗|已消耗|本次消耗|本通道消耗|计费[：:])[^\n]*$/gmu,
    "",
  );
  text = text.replace(
    /^(?:当前余额|余额)[：:]\s*\**[\d,]+\s*Token\**\.?\s*$/gmu,
    "",
  );

  // 开场身份自我介绍（Header 已展示名称）
  text = text.replace(
    /^(?:你好[，,！!]?\s*)?我是\s*\**\s*(?:Token\s*)?(?:销售客服|AI\s*客服|[ABC]模型AI|Token AI客服|Mira AI(?:\s*(?:智能助手|销售助手))?)[^*\n]*\**[^\n]*\n+/u,
    "",
  );
  text = text.replace(
    /^(?:你好[，,！!]?\s*)?我是\s*\**Token\s*销售客服\**[^\n]*\n+/u,
    "",
  );

  // 行内重复的「固定消耗 N Token」短句（句末）
  text = text.replace(
    /[，,]?\s*(?:本轮|本次)?固定消耗\s*\d+\s*Token[。.]?/gu,
    "",
  );
  text = text.replace(
    /[（(]\s*(?:锁定\s*)?(?:SALES|LIGHT|STANDARD|PREMIUM)\s*[·•]\s*[^）)]*[）)]/gu,
    "",
  );

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** @deprecated 请用 stripAssistantDisplayMeta */
export function stripBillingFooter(content: string): string {
  return stripAssistantDisplayMeta(content);
}

/** 统一模型行：DeepSeek · PREMIUM · Gamma */
export function formatMessageModelLine(
  serviceType?: string | null,
  modelName?: string | null,
): string {
  const type = serviceType?.trim() || null;
  const canonical =
    type && type in MODEL_LABEL
      ? MODEL_LABEL[type as ChatServiceType]
      : null;
  const name = canonical || modelName?.trim() || null;
  return ["DeepSeek", type, name].filter(Boolean).join(" · ");
}

/**
 * DB / 消息字段优先；缺失时才从正文页脚解析。
 * 禁止用「当前顶部选择」覆盖。展示名统一 MODEL_LABEL。
 */
export function resolveMessageSnapshot(input: {
  serviceType?: string | null;
  modelName?: string | null;
  tokenCost?: number | null;
  tokenBalanceAfter?: number | null;
  content: string;
}): MessageModelSnapshot {
  let serviceType = input.serviceType?.trim() || null;
  let modelName = input.modelName?.trim() || null;
  let tokenCost =
    typeof input.tokenCost === "number" ? input.tokenCost : null;
  let tokenBalanceAfter =
    typeof input.tokenBalanceAfter === "number"
      ? input.tokenBalanceAfter
      : null;

  if (
    !serviceType ||
    !modelName ||
    tokenCost === null ||
    tokenBalanceAfter === null
  ) {
    const parsed = parseSnapshotFromContent(input.content);
    if (parsed) {
      serviceType = serviceType ?? parsed.serviceType;
      modelName = modelName ?? parsed.modelName;
      tokenCost = tokenCost ?? parsed.tokenCost;
      tokenBalanceAfter =
        tokenBalanceAfter ?? parsed.tokenBalanceAfter ?? null;
    }
  }

  if (serviceType && serviceType in MODEL_LABEL) {
    modelName = MODEL_LABEL[serviceType as ChatServiceType];
    if (tokenCost === null && serviceType in SERVICE_CONFIG) {
      tokenCost = SERVICE_CONFIG[serviceType as ChatServiceType].cost;
    }
  }

  return { serviceType, modelName, tokenCost, tokenBalanceAfter };
}
