import { prisma } from "@/lib/db";
import { AppError } from "@/lib/app-error";
import { SERVICE_CONFIG, type ChatServiceType } from "@/lib/constants";
import {
  DEFAULT_AGENT_PROMPTS,
  defaultAgentSeeds,
} from "@/lib/agent-config-defaults";
import { agentTools } from "@/lib/tool-registry";
import { scopeTenantId } from "@/lib/tenant-context";

export type AgentRuntimeConfig = {
  id: string | null;
  name: string;
  serviceType: ChatServiceType;
  systemPrompt: string;
  model: string;
  temperature: number;
  enabled: boolean;
  source: "database" | "fallback";
  tools: string[];
};

export type AgentConfigVersionView = {
  id: string;
  agentId: string;
  oldPrompt: string;
  newPrompt: string;
  changedAt: Date;
  changedBy: string | null;
};

export type AgentConfigView = {
  id: string;
  name: string;
  serviceType: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  versions: AgentConfigVersionView[];
};

const TOOL_NAMES = agentTools.map((tool) => tool.name);

function isChatServiceType(type: string): type is ChatServiceType {
  return Object.prototype.hasOwnProperty.call(SERVICE_CONFIG, type);
}

function fallbackConfig(serviceType: ChatServiceType): AgentRuntimeConfig {
  const seed = defaultAgentSeeds().find((row) => row.serviceType === serviceType);
  if (!seed) {
    throw new Error(`missing default agent config: ${serviceType}`);
  }
  return {
    id: null,
    name: seed.name,
    serviceType,
    systemPrompt: DEFAULT_AGENT_PROMPTS[serviceType],
    model: seed.model,
    temperature: seed.temperature,
    enabled: false,
    source: "fallback",
    tools: TOOL_NAMES,
  };
}

/** Runtime 按 tenantId + serviceType 加载 AgentConfig；缺行或关闭时回退默认 Prompt。 */
export async function loadAgentRuntimeConfig(
  serviceType: string,
  tenantId?: string | null,
): Promise<AgentRuntimeConfig> {
  if (!isChatServiceType(serviceType)) {
    throw new Error(`未知 serviceType：${serviceType}`);
  }

  const scopedTenantId = scopeTenantId(tenantId);
  const row = await prisma.agentConfig.findUnique({
    where: {
      tenantId_serviceType: {
        tenantId: scopedTenantId,
        serviceType,
      },
    },
  });

  if (!row || !row.enabled) {
    const fallback = fallbackConfig(serviceType);
    if (row && !row.enabled) {
      return {
        ...fallback,
        id: row.id,
        name: row.name,
        enabled: false,
        source: "fallback",
      };
    }
    return fallback;
  }

  return {
    id: row.id,
    name: row.name,
    serviceType,
    systemPrompt: row.systemPrompt,
    model: row.model,
    temperature: row.temperature,
    enabled: true,
    source: "database",
    tools: TOOL_NAMES,
  };
}

export async function listAgentConfigs(
  tenantId?: string | null,
): Promise<AgentConfigView[]> {
  const scopedTenantId = scopeTenantId(tenantId);
  const rows = await prisma.agentConfig.findMany({
    where: { tenantId: scopedTenantId },
    orderBy: { serviceType: "asc" },
    include: {
      versions: {
        orderBy: { changedAt: "desc" },
        take: 8,
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    serviceType: row.serviceType,
    systemPrompt: row.systemPrompt,
    model: row.model,
    temperature: row.temperature,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    versions: row.versions.map((version) => ({
      id: version.id,
      agentId: version.agentId,
      oldPrompt: version.oldPrompt,
      newPrompt: version.newPrompt,
      changedAt: version.changedAt,
      changedBy: version.changedBy,
    })),
  }));
}

export async function updateAgentConfig(
  id: string,
  patch: {
    systemPrompt?: string;
    temperature?: number;
    enabled?: boolean;
    model?: string;
    name?: string;
  },
  changedBy?: string | null,
  tenantId?: string | null,
): Promise<AgentConfigView> {
  const current = await prisma.agentConfig.findUnique({ where: { id } });
  if (!current) {
    throw new AppError("NOT_FOUND", "Agent 配置不存在。", 404);
  }
  if (tenantId && current.tenantId && current.tenantId !== scopeTenantId(tenantId)) {
    throw new AppError("NOT_FOUND", "Agent 配置不存在。", 404);
  }

  const data: {
    systemPrompt?: string;
    temperature?: number;
    enabled?: boolean;
    model?: string;
    name?: string;
  } = {};

  if (typeof patch.systemPrompt === "string") {
    const next = patch.systemPrompt.trim();
    if (!next) {
      throw new AppError("BAD_REQUEST", "Prompt 不能为空。", 400);
    }
    data.systemPrompt = next;
  }
  if (typeof patch.temperature === "number" && Number.isFinite(patch.temperature)) {
    if (patch.temperature < 0 || patch.temperature > 2) {
      throw new AppError("BAD_REQUEST", "temperature 需在 0–2。", 400);
    }
    data.temperature = patch.temperature;
  }
  if (typeof patch.enabled === "boolean") {
    data.enabled = patch.enabled;
  }
  if (typeof patch.model === "string" && patch.model.trim()) {
    data.model = patch.model.trim();
  }
  if (typeof patch.name === "string" && patch.name.trim()) {
    data.name = patch.name.trim();
  }

  if (Object.keys(data).length === 0) {
    throw new AppError("BAD_REQUEST", "没有可更新的字段。", 400);
  }

  const promptChanged =
    typeof data.systemPrompt === "string" &&
    data.systemPrompt !== current.systemPrompt;

  const updated = await prisma.$transaction(async (tx) => {
    if (promptChanged && data.systemPrompt) {
      await tx.agentConfigVersion.create({
        data: {
          agentId: current.id,
          oldPrompt: current.systemPrompt,
          newPrompt: data.systemPrompt,
          changedBy: changedBy ?? null,
        },
      });
    }
    return tx.agentConfig.update({
      where: { id },
      data,
      include: {
        versions: {
          orderBy: { changedAt: "desc" },
          take: 8,
        },
      },
    });
  });

  return {
    id: updated.id,
    name: updated.name,
    serviceType: updated.serviceType,
    systemPrompt: updated.systemPrompt,
    model: updated.model,
    temperature: updated.temperature,
    enabled: updated.enabled,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    versions: updated.versions.map((version) => ({
      id: version.id,
      agentId: version.agentId,
      oldPrompt: version.oldPrompt,
      newPrompt: version.newPrompt,
      changedAt: version.changedAt,
      changedBy: version.changedBy,
    })),
  };
}
