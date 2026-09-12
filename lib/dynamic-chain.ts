/**
 * 动态推进链：任务类型识别 + 模板骨架 + 上下文填充。
 * 模板控制结构，内容随用户输入变化。
 */

export type TaskType =
  | "optimize"
  | "build"
  | "debug"
  | "analyze"
  | "plan"
  | "unknown";

export type ChainTemplate = {
  step1: (ctx: string) => string;
  step2: (ctx: string) => string;
  actions: (ctx: string) => string[];
};

/** 生成结果（可直接交给 runDynamicChain） */
export type DynamicActionChain = {
  id: string;
  taskType: TaskType;
  context: string;
  step1: string;
  step2: string;
  actions: string[];
};

const GUIDE = "我可以带你一步步做完这个 👇";

/**
 * 第4-1：任务类型识别 — AI 之前先理解用户在干嘛。
 */
export function detectTaskType(text: string): TaskType {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "unknown";

  if (/优化|改进|提升|重构/.test(t)) return "optimize";
  if (/bug|报错|修复|调试|错误/i.test(t)) return "debug";
  if (/分析|诊断|看看|评估/.test(t)) return "analyze";
  if (/方案|计划|规划|路线|步骤/.test(t)) return "plan";
  if (/做|搭建|写|实现|开发|设计一个|做一个/.test(t)) return "build";

  return "unknown";
}

/**
 * 第4-3：提取上下文关键词 — 让输出针对当前内容。
 */
export function extractContext(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "这个问题";

  if (/客服/.test(t)) return "AI客服";
  if (/代码|函数|组件|逻辑/.test(t)) return "这段代码";
  if (/项目|产品|系统/.test(t)) return "这个项目";
  if (/简历/.test(t)) return "这份简历";
  if (/定价|收费|变现|赚钱/.test(t)) return "变现方案";
  if (/学习|路线/.test(t)) return "学习计划";

  return "这个问题";
}

/**
 * 第4-2：推进链模板（骨架）— 模板控结构，不写死全文。
 */
export const CHAIN_TEMPLATES: Record<TaskType, ChainTemplate> = {
  optimize: {
    step1: (ctx) => `我先帮你看看这个${ctx}可以怎么优化 👇`,
    step2: (ctx) =>
      `一般可以从结构、策略和体验三个方向优化这个${ctx}。${GUIDE}`,
    actions: () => [
      "优化核心结构 →",
      "优化实现方式 →",
      "给我完整优化方案 →",
    ],
  },
  build: {
    step1: (ctx) => `我可以帮你把这个${ctx}搭建出来 👇`,
    step2: (ctx) =>
      `我们可以把${ctx}分成几个步骤来做，这样会更清晰。${GUIDE}`,
    actions: () => [
      "先设计整体结构 →",
      "一步步实现功能 →",
      "给我完整实现方案 →",
    ],
  },
  debug: {
    step1: (ctx) => `我先帮你定位这个${ctx}里的问题 👇`,
    step2: (ctx) =>
      `排查${ctx}通常按：复现 → 缩小范围 → 验证修复。${GUIDE}`,
    actions: () => [
      "帮我复现问题 →",
      "缩小可疑范围 →",
      "给出修复方案 →",
    ],
  },
  analyze: {
    step1: (ctx) => `我先帮你分析一下这个${ctx} 👇`,
    step2: (ctx) =>
      `分析${ctx}时，我会抓住关键信号、原因和下一步动作。${GUIDE}`,
    actions: () => [
      "指出关键问题 →",
      "解释原因 →",
      "给我改进建议 →",
    ],
  },
  plan: {
    step1: (ctx) => `我先帮你把这个${ctx}拆成可执行计划 👇`,
    step2: (ctx) =>
      `计划会按目标、阶段和检查点来排，避免一次做太多。${GUIDE}`,
    actions: () => [
      "明确成功标准 →",
      "拆分阶段步骤 →",
      "给我完整方案 →",
    ],
  },
  unknown: {
    step1: (ctx) => `我先帮你把这个${ctx}理清楚 👇`,
    step2: (ctx) =>
      `我们可以先定方向，再选一个最该做的下一步。${GUIDE}`,
    actions: () => [
      "先明确目标 →",
      "给我一个方向 →",
      "下一步我该做什么 →",
    ],
  },
};

/**
 * 第4-4：根据输入动态生成推进链。
 */
export function generateActionChain(text: string): DynamicActionChain {
  const type = detectTaskType(text);
  const ctx = extractContext(text);
  const template = CHAIN_TEMPLATES[type] ?? CHAIN_TEMPLATES.optimize;

  return {
    id: `dynamic_${type}_${Date.now().toString(36)}`,
    taskType: type,
    context: ctx,
    step1: template.step1(ctx),
    step2: template.step2(ctx),
    actions: template.actions(ctx).slice(0, 3),
  };
}

/**
 * 是否应用推进链（自由输入入口）。
 * 能识别任务类型，或命中明确任务词 → 触发。
 */
export function shouldTriggerChain(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  if (detectTaskType(t) !== "unknown") return true;
  return /帮我|请|怎么|如何|我想/.test(t) && t.length >= 4;
}
