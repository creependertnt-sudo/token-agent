export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolContext = {
  /** 始终来自登录会话，禁止采信模型传入的 userId */
  userId: string;
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<unknown>;
};

export const EMPTY_OBJECT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};
