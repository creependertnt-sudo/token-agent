import path from "path";

/** Parent tables first so FK inserts succeed. */
export const SQLITE_EXPORT_TABLES = [
  "Tenant",
  "User",
  "AIProvider",
  "TokenPackage",
  "SalesKnowledge",
  "CompetitorKnowledge",
  "SalesStrategy",
  "CustomerProfile",
  "ModelRecommendRule",
  "ModelConfig",
  "ModelCapability",
  "AIModel",
  "AIService",
  "CustomerMemory",
  "AgentMemory",
  "RateLimitWindow",
  "Conversation",
  "Order",
  "TokenUsage",
  "TokenTransaction",
  "UserSelectedService",
  "Message",
  "SalesConversion",
  "AgentTrace",
  "ToolCallLog",
  "ChatAnalytics",
  "ConversionAnalytics",
  "SalesFunnelLog",
  "AgentErrorLog",
  "AgentLog",
  "AgentRun",
  "AgentToolCall",
  "AgentFeedback",
  "AgentConfig",
  "AgentConfigVersion",
] as const;

export type SqliteExportTable = (typeof SQLITE_EXPORT_TABLES)[number];

export const PRISMA_DELEGATE: Record<SqliteExportTable, string> = {
  Tenant: "tenant",
  User: "user",
  AIProvider: "aIProvider",
  TokenPackage: "tokenPackage",
  SalesKnowledge: "salesKnowledge",
  CompetitorKnowledge: "competitorKnowledge",
  SalesStrategy: "salesStrategy",
  CustomerProfile: "customerProfile",
  ModelRecommendRule: "modelRecommendRule",
  ModelConfig: "modelConfig",
  ModelCapability: "modelCapability",
  AIModel: "aIModel",
  AIService: "aIService",
  CustomerMemory: "customerMemory",
  AgentMemory: "agentMemory",
  RateLimitWindow: "rateLimitWindow",
  Conversation: "conversation",
  Order: "order",
  TokenUsage: "tokenUsage",
  TokenTransaction: "tokenTransaction",
  UserSelectedService: "userSelectedService",
  Message: "message",
  SalesConversion: "salesConversion",
  AgentTrace: "agentTrace",
  ToolCallLog: "toolCallLog",
  ChatAnalytics: "chatAnalytics",
  ConversionAnalytics: "conversionAnalytics",
  SalesFunnelLog: "salesFunnelLog",
  AgentErrorLog: "agentErrorLog",
  AgentLog: "agentLog",
  AgentRun: "agentRun",
  AgentToolCall: "agentToolCall",
  AgentFeedback: "agentFeedback",
  AgentConfig: "agentConfig",
  AgentConfigVersion: "agentConfigVersion",
};

const BOOLEAN_FIELDS = new Set([
  "active",
  "enableReasoning",
  "success",
  "shown",
  "clicked",
  "paid",
  "purchased",
  "toolSuccess",
  "enabled",
]);

export type SqliteDump = {
  exportedAt: string;
  source: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export function sqliteDumpPath(): string {
  return path.join(process.cwd(), "exports", "sqlite-export.json");
}

export function normalizeRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = value;
      continue;
    }
    if (BOOLEAN_FIELDS.has(key)) {
      out[key] = value === true || value === 1 || value === "1";
      continue;
    }
    out[key] = value;
  }
  return out;
}
