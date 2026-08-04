/**
 * 客户需求信号抽取（行业/预算/需求/技术）。
 * 推荐档位由 ModelRecommendRule 数据库规则决定，本文件不再写死推荐理由。
 */
export type BudgetLevel = "low" | "medium" | "high" | null;
export type TechLevel = "beginner" | "intermediate" | "expert" | null;

export type CustomerDemandSignals = {
  industry: string | null;
  budget: BudgetLevel;
  needs: string[];
  techLevel: TechLevel;
  /** 仅信号摘要，不含硬编码推荐 */
  promptBlock: string;
};

const INDUSTRY_RULES: Array<{ re: RegExp; label: string }> = [
  { re: /电商|商城|零售|跨境/, label: "电商零售" },
  { re: /教育|培训|学校|课程|作业/, label: "教育培训" },
  { re: /金融|银行|支付|保险/, label: "金融" },
  { re: /医疗|医院|健康/, label: "医疗健康" },
  { re: /游戏|娱乐/, label: "游戏娱乐" },
  { re: /制造|工厂|工业/, label: "制造业" },
  { re: /saas|软件|互联网|科技|ai\b|人工智能/, label: "互联网/科技" },
  { re: /政务|政府|公共/, label: "政务" },
  { re: /媒体|内容|自媒体|营销/, label: "内容营销" },
  { re: /建筑|地产|装修/, label: "房地产/建筑" },
];

export function extractCustomerDemandSignals(
  message: string,
): CustomerDemandSignals {
  const t = message.trim().toLowerCase();
  const needs: string[] = [];

  let industry: string | null = null;
  for (const rule of INDUSTRY_RULES) {
    if (rule.re.test(t)) {
      industry = rule.label;
      break;
    }
  }

  let budget: BudgetLevel = null;
  if (/便宜|省钱|学生|试用|尝鲜|入门|预算低|穷|免费优先/.test(t)) {
    budget = "low";
  } else if (/企业预算|不差钱|高端|顶级|愿意付费|预算充足/.test(t)) {
    budget = "high";
  } else if (/中等|一般预算|性价比/.test(t)) {
    budget = "medium";
  }

  if (/网站|官网|landing/.test(t)) needs.push("建站/官网");
  if (/后台|管理端|admin/.test(t)) needs.push("后台系统");
  if (/app|小程序|移动端/.test(t)) needs.push("移动应用");
  if (/客服|机器人|bot/.test(t)) needs.push("智能客服");
  if (/文案|翻译|写作|润色/.test(t)) needs.push("文案/翻译");
  if (/代码|开发|编程|api/.test(t)) needs.push("代码开发");
  if (/数据库|schema|表结构/.test(t)) needs.push("数据库设计");
  if (/架构|微服务|分布式|高并发/.test(t)) needs.push("系统架构");
  if (/算法|模型训练|深度学习/.test(t)) needs.push("复杂算法");
  if (/分析|报告|调研/.test(t)) needs.push("分析报告");
  if (/套餐|充值|购买|价格/.test(t)) needs.push("采购/充值");
  if (needs.length === 0 && t.length > 0) needs.push("综合咨询");

  let techLevel: TechLevel = null;
  if (/小白|不会代码|非技术|新手|入门/.test(t)) {
    techLevel = "beginner";
  } else if (/架构师|专家|高并发|分布式|微服务|企业级|复杂算法/.test(t)) {
    techLevel = "expert";
  } else if (/程序员|开发者|工程师|写代码|做项目|数据库/.test(t)) {
    techLevel = "intermediate";
  } else if (/学生|作业|翻译|文案/.test(t)) {
    techLevel = "beginner";
  }

  const promptBlock = `【客户需求信号】
行业：${industry ?? "未识别（可追问）"}
预算：${budget ?? "未识别（可追问）"}
需求要点：${needs.join("、") || "未识别"}
技术水平：${techLevel ?? "未识别（可追问）"}
说明：档位推荐请以 ModelRecommendRule + ModelConfig/ModelCapability 为准，禁止臆造能力。`;

  return { industry, budget, needs, techLevel, promptBlock };
}

/** @deprecated 使用 extractCustomerDemandSignals；推荐由规则表完成 */
export function analyzeCustomerDemand(message: string) {
  const s = extractCustomerDemandSignals(message);
  return {
    industry: s.industry,
    budget: s.budget,
    needs: s.needs,
    techLevel: s.techLevel,
    recommendedModel: null as "LIGHT" | "STANDARD" | "PREMIUM" | null,
    recommendReason: "由 ModelRecommendRule 决定",
    confidence: "low" as const,
    promptBlock: s.promptBlock,
  };
}

export type CustomerDemandAnalysis = ReturnType<typeof analyzeCustomerDemand>;
