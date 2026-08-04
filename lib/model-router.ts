import type { AIServiceType } from "@/app/generated/prisma/enums";
import {
  SERVICE_GENERATION_LIMITS,
  type ChatServiceType,
} from "@/lib/constants";
import {
  getLockedTokenCost,
  getServiceDisplayName,
  isChatServiceType,
} from "@/lib/agent-router";

/** 目录行信息（仅标签展示，不参与路由决策） */
export type AIServiceForRoute = {
  id?: string;
  name: string;
  slug?: string;
  type: AIServiceType;
  tokenCost?: number;
  modelId?: string | null;
  description?: string | null;
  model?: {
    id: string;
    name: string;
    slug: string;
    provider: {
      id: string;
      name: string;
      slug: string;
    };
  } | null;
};

export type ModelRoute = {
  provider: string | null;
  model: string | null;
  serviceType: AIServiceType;
  tokenCost: number;
  displayName: string;
  maxTokens: number;
  temperature: number;
  callLlm: boolean;
  baseURL: string | null;
  apiKeyEnv: string | null;
  label: string;
};

const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL =
  process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat";
const DEEPSEEK_API_KEY_ENV = "OPENAI_API_KEY";

/**
 * 仅按 serviceType 解析。名称/扣费一律 SERVICE_CONFIG[serviceType]。
 */
export function resolveModelRouteByType(
  serviceType: AIServiceType,
  _catalog?: Pick<AIServiceForRoute, "name" | "model"> | null,
): ModelRoute {
  if (!isChatServiceType(serviceType)) {
    throw new Error(`未知的 AIService.type：${serviceType}`);
  }

  const tokenCost = getLockedTokenCost(serviceType);
  const displayName = getServiceDisplayName(serviceType);
  const limits = SERVICE_GENERATION_LIMITS[serviceType];

  // SALES 也走 DeepSeek，但 tokenCost 恒为 0（免费销售顾问）
  return {
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    serviceType,
    tokenCost,
    displayName,
    maxTokens: limits.maxTokens,
    temperature: limits.temperature,
    callLlm: true,
    baseURL: DEEPSEEK_BASE_URL,
    apiKeyEnv: DEEPSEEK_API_KEY_ENV,
    label:
      serviceType === "SALES"
        ? `${displayName}（SALES·销售顾问 LLM·0 Token）→ deepseek/${DEEPSEEK_MODEL}`
        : `${displayName}（锁定 ${serviceType} / ${tokenCost} Token）→ deepseek/${DEEPSEEK_MODEL}`,
  };
}

export function resolveModelRoute(service: AIServiceForRoute): ModelRoute {
  return resolveModelRouteByType(service.type, service);
}

export function resolveApiKey(route: ModelRoute): string | null {
  if (!route.callLlm || !route.apiKeyEnv) return null;
  return process.env[route.apiKeyEnv] ?? null;
}

export function resolveOpenAIClientOptions(route: ModelRoute): {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  temperature: number;
  usedFallback: boolean;
} | null {
  if (!route.callLlm || !route.model || !route.baseURL || !route.apiKeyEnv) {
    return null;
  }

  const apiKey = process.env[route.apiKeyEnv];
  if (!apiKey) return null;

  return {
    apiKey,
    baseURL: route.baseURL,
    model: route.model,
    maxTokens: route.maxTokens,
    temperature: route.temperature,
    usedFallback: false,
  };
}

export type { ChatServiceType };
