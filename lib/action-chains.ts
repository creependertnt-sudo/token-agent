import type { QuickAction } from "@/components/chat/types";
import { stripArrow } from "@/lib/quick-send";

/**
 * 对话推进链：Starter 点击后的分阶段任务路径。
 * 原则：分阶段释放 / 帮用户决定下一步 / 最多 3 个具体动作。
 */
export type ActionChain = {
  id: string;
  /** 承接（理解） */
  step1: string;
  /** 方向 + 轻引导（含「带你一步步做完」） */
  step2: string;
  /** 下一步动作按钮（最多 3，必须是动作句） */
  actions: string[];
};

const GUIDE = "我可以带你一步步做完这个 👇";

function chain(
  id: string,
  step1: string,
  step2Core: string,
  actions: string[],
): ActionChain {
  const step2 = step2Core.includes(GUIDE)
    ? step2Core
    : `${step2Core.replace(/[。！？]?$/u, "。")}${GUIDE}`;
  return {
    id,
    step1,
    step2,
    actions: actions.slice(0, 3),
  };
}

/**
 * 推进链映射（半模板，按 chainId 索引）。
 * 点击 Starter = 进入任务流程，而不是自由闲聊。
 */
export const ACTION_CHAINS: Record<string, ActionChain> = {
  ai_customer_opt_chain: chain(
    "ai_customer_opt_chain",
    "我先帮你快速看一下这个 AI 客服的问题 👇",
    "你的这个 AI 客服可以从对话结构、推荐策略和用户引导三个方向优化。",
    ["优化对话流程 →", "优化推荐策略 →", "给我完整方案 →"],
  ),
  ai_customer_flow_chain: chain(
    "ai_customer_flow_chain",
    "我先帮你梳理一版可用的客服流程 👇",
    "关键是：接待开场、问题分流、解决方案、收尾转化。",
    ["画出完整流程图 →", "写开场话术 →", "设计分流规则 →"],
  ),
  ai_customer_build_chain: chain(
    "ai_customer_build_chain",
    "我先帮你把 AI 客服系统拆成可落地模块 👇",
    "一般包括：对话引擎、知识库、人工接管、数据反馈。",
    ["先定最小可用版本 →", "列出技术选型 →", "给我实施步骤 →"],
  ),
  ai_customer_lift_convert_chain: chain(
    "ai_customer_lift_convert_chain",
    "我先帮你看 AI 客服怎么提升转化 👇",
    "重点通常在推荐时机、话术信任感和下一步行动按钮。",
    ["优化推荐时机 →", "改转化话术 →", "设计行动按钮 →"],
  ),
  ai_chatgpt_product_chain: chain(
    "ai_chatgpt_product_chain",
    "我先帮你拆一个类似 ChatGPT 的产品路径 👇",
    "核心是：对话体验、模型能力层、记忆与工具、商业化入口。",
    ["定一版 MVP →", "画产品结构 →", "规划变现方式 →"],
  ),
  ai_train_own_model_chain: chain(
    "ai_train_own_model_chain",
    "我先帮你理清「训练自己的 AI」到底要做什么 👇",
    "可以从数据准备、微调方式、评估指标三条线推进。",
    ["整理训练数据 →", "选微调方案 →", "设计评估标准 →"],
  ),
  ai_gpt_like_chain: chain(
    "ai_gpt_like_chain",
    "我先帮你规划一个类 GPT 系统 👇",
    "先把对话、知识、工具调用三块边界划清，再谈扩展。",
    ["定系统边界 →", "设计对话流程 →", "列出开发步骤 →"],
  ),
  product_full_plan_chain: chain(
    "product_full_plan_chain",
    "我先帮你搭一个完整方案骨架 👇",
    "方案通常包含：目标、现状、路径、里程碑和风险。",
    ["明确成功标准 →", "拆分阶段里程碑 →", "列出风险清单 →"],
  ),
  product_ux_opt_chain: chain(
    "product_ux_opt_chain",
    "我先帮你诊断产品体验问题 👇",
    "常见卡点在：首屏理解、关键路径摩擦、反馈不清晰。",
    ["找出三个卡点 →", "优化关键路径 →", "给我改版建议 →"],
  ),
  product_feature_sense_chain: chain(
    "product_feature_sense_chain",
    "我先帮你判断这个功能怎么做更合理 👇",
    "会从用户目标、使用频率、实现成本和替代方案来权衡。",
    ["澄清用户目标 →", "对比两种方案 →", "给出推荐做法 →"],
  ),
  product_mvp_chain: chain(
    "product_mvp_chain",
    "我先帮你收敛一版 MVP 👇",
    "MVP 只保留验证核心假设必需的功能，其余后置。",
    ["写下核心假设 →", "列出必做功能 →", "排出两周计划 →"],
  ),
  product_expand_chain: chain(
    "product_expand_chain",
    "我先帮你想产品还能往哪扩 👇",
    "扩展方向可以按：同场景加深、相邻场景、平台化能力。",
    ["列三个扩展方向 →", "评估哪个更值 →", "设计下一个功能 →"],
  ),
  code_opt_chain: chain(
    "code_opt_chain",
    "我先帮你分析一下这段代码 👇",
    "这段代码可以从结构、性能和可维护性三个方面优化。",
    ["帮我重构代码 →", "优化性能 →", "解释这段逻辑 →"],
  ),
  dev_code_opt_chain: chain(
    "dev_code_opt_chain",
    "我先帮你分析一下这段代码 👇",
    "这段代码可以从结构、性能和可维护性三个方面优化。",
    ["帮我重构代码 →", "优化性能 →", "解释这段逻辑 →"],
  ),
  dev_bug_chain: chain(
    "dev_bug_chain",
    "我先帮你定位这个 bug 👇",
    "先复现、再缩小范围、最后验证修复，避免盲目改。",
    ["帮我复现问题 →", "缩小可疑范围 →", "给出修复方案 →"],
  ),
  dev_login_chain: chain(
    "dev_login_chain",
    "我先帮你把登录功能拆清楚 👇",
    "通常包括：注册登录、会话态、权限校验和异常处理。",
    ["设计登录流程 →", "定技术方案 →", "写出接口清单 →"],
  ),
  dev_better_impl_chain: chain(
    "dev_better_impl_chain",
    "我先帮你找一个更好的实现方式 👇",
    "会对比可读性、扩展性和改动成本，再给推荐方案。",
    ["对比两种实现 →", "指出当前问题 →", "给出推荐写法 →"],
  ),
  dev_logic_alt_chain: chain(
    "dev_logic_alt_chain",
    "我先帮你看这段逻辑还能怎么改 👇",
    "重点看边界条件、状态流转和是否可拆成更小步骤。",
    ["重写这段逻辑 →", "补齐边界情况 →", "画状态流转 →"],
  ),
  biz_make_money_chain: chain(
    "biz_make_money_chain",
    "我先帮你想这个项目怎么赚钱 👇",
    "常见路径：订阅、按量、增值服务，关键看谁愿意付。",
    ["找付费人群 →", "设计收费点 →", "给我变现方案 →"],
  ),
  biz_monetize_chain: chain(
    "biz_monetize_chain",
    "我先帮你设计变现路径 👇",
    "先明确价值主张，再匹配定价与转化漏斗。",
    ["明确价值主张 →", "设计定价档位 →", "优化转化漏斗 →"],
  ),
  biz_pricing_design_chain: chain(
    "biz_pricing_design_chain",
    "我先帮你把定价设计得更合理 👇",
    "定价要对齐：用户感知价值、竞品锚定、成本底线。",
    ["定三档价格 →", "写套餐差异 →", "设计试用策略 →"],
  ),
  biz_pricing_chain: chain(
    "biz_pricing_chain",
    "我先帮你设计收费策略 👇",
    "策略核心是：谁付费、付什么、何时升级。",
    ["确定付费对象 →", "设计升级路径 →", "写收费话术 →"],
  ),
  biz_why_not_pay_chain: chain(
    "biz_why_not_pay_chain",
    "我先帮你分析用户为什么不愿付费 👇",
    "常见原因：价值不清、信任不足、价格锚点不对。",
    ["找出拒付原因 →", "改价值表达 →", "调整价格锚点 →"],
  ),
  biz_competitors_chain: chain(
    "biz_competitors_chain",
    "我先帮你找可参考的竞品 👇",
    "会按定位、功能、定价和差异化四个维度对比。",
    ["列出竞品名单 →", "做对比表 →", "找出差异化点 →"],
  ),
  biz_convert_chain: chain(
    "biz_convert_chain",
    "我先帮你提高用户转化 👇",
    "转化提升通常盯：入口吸引力、路径摩擦、成交话术。",
    ["优化关键入口 →", "减少路径摩擦 →", "改写成交话术 →"],
  ),
  biz_next_step_chain: chain(
    "biz_next_step_chain",
    "我先帮你决定下一步该做什么 👇",
    "按「影响大、成本低、可验证」排出优先动作。",
    ["给我优先清单 →", "定本周目标 →", "拆成可执行任务 →"],
  ),
  growth_retention_chain: chain(
    "growth_retention_chain",
    "我先帮你想怎么提高留存 👇",
    "留存关键看：首次成功体验、回访触发、持续价值。",
    ["优化首次体验 →", "设计回访触发 →", "制定留存策略 →"],
  ),
  growth_why_no_users_chain: chain(
    "growth_why_no_users_chain",
    "我先帮你分析产品为什么没人用 👇",
    "先分清是获客问题、激活问题，还是留存问题。",
    ["诊断卡在哪一层 →", "找一个破局点 →", "给我冷启动计划 →"],
  ),
  growth_strategy_chain: chain(
    "growth_strategy_chain",
    "我先帮你做一版增长策略 👇",
    "增长通常拆成：获客渠道、激活路径、裂变/留存循环。",
    ["选主获客渠道 →", "设计激活路径 →", "规划增长实验 →"],
  ),
  growth_saas_split_chain: chain(
    "growth_saas_split_chain",
    "我先帮你把 SaaS 该怎么拆讲清楚 👇",
    "可按：账号权限、计费、核心业务、运营后台拆分。",
    ["画模块拆分 →", "定开发顺序 →", "列出数据模型 →"],
  ),
  career_write_resume_chain: chain(
    "career_write_resume_chain",
    "我先帮你写一份更有竞争力的简历 👇",
    "简历要突出：目标岗位、可量化结果、项目影响力。",
    ["定目标岗位 →", "改项目描述 →", "生成一版简历 →"],
  ),
  career_resume_chain: chain(
    "career_resume_chain",
    "我先帮你优化简历表达 👇",
    "重点改：动词开头、结果量化、和岗位关键词对齐。",
    ["改一版项目经历 →", "对齐岗位关键词 →", "压缩到一页 →"],
  ),
  career_project_job_chain: chain(
    "career_project_job_chain",
    "我先帮你评估这个项目对求职的帮助 👇",
    "会看技术深度、业务结果、以及能不能讲成故事。",
    ["提炼项目亮点 →", "写面试讲解稿 →", "补作品集结构 →"],
  ),
  career_skill_up_chain: chain(
    "career_skill_up_chain",
    "我先帮你规划怎么提升技术能力 👇",
    "按目标岗位倒推：必会技能、练习项目、反馈节奏。",
    ["定能力目标 →", "列学习清单 →", "设计练习项目 →"],
  ),
  creative_startup_idea_chain: chain(
    "creative_startup_idea_chain",
    "我先帮你挖一个可落地的创业点子 👇",
    "好点子要同时满足：真实痛点、你能做、有付费可能。",
    ["给我三个点子 →", "评估哪个可行 →", "设计验证实验 →"],
  ),
  creative_product_name_chain: chain(
    "creative_product_name_chain",
    "我先帮你想产品名字 👇",
    "好名字要好记、好念、能暗示价值，并避开雷同。",
    ["给我十个名字 →", "筛选三个候选 →", "解释命名理由 →"],
  ),
  creative_fun_features_chain: chain(
    "creative_fun_features_chain",
    "我先帮你想有趣又能增长的功能 👇",
    "有趣功能最好能服务核心价值，而不是纯装饰。",
    ["列五个功能点子 →", "挑最值得做的 →", "写交互草稿 →"],
  ),
  creative_idea_chain: chain(
    "creative_idea_chain",
    "我先帮你发散一些创新点子 👇",
    "会从用户痛点、新技术组合、跨界借鉴三个方向想。",
    ["继续发散点子 →", "收敛成一个方向 →", "写成产品一句话 →"],
  ),
  creative_new_feature_chain: chain(
    "creative_new_feature_chain",
    "我先帮你想下一个新功能 👇",
    "优先选：用户高频需要、能提升留存或付费的功能。",
    ["列功能候选 →", "评估投入产出 →", "写需求说明 →"],
  ),
  learning_path_give_chain: chain(
    "learning_path_give_chain",
    "我先帮你给一条可执行的学习路线 👇",
    "路线会按：基础 → 项目 → 反馈，避免只囤课。",
    ["定学习目标 →", "排四周计划 →", "推荐练习项目 →"],
  ),
  learning_path_chain: chain(
    "learning_path_chain",
    "我先帮你规划学习路线 👇",
    "先对齐目标水平，再拆阶段任务和检查点。",
    ["评估当前水平 →", "拆分阶段任务 →", "设每周检查点 →"],
  ),
  learning_quick_start_chain: chain(
    "learning_quick_start_chain",
    "我先帮你快速上手这项技术 👇",
    "最快路径是：最小概念 + 一个小项目 + 对照文档。",
    ["讲最小概念 →", "带做一个小项目 →", "给练习清单 →"],
  ),
  learning_what_first_chain: chain(
    "learning_what_first_chain",
    "我先帮你决定该先学什么 👇",
    "按目标倒推：先学高频刚需，后学锦上添花。",
    ["明确学习目标 →", "排出学习顺序 →", "今天先学什么 →"],
  ),
};

/** 分类兜底 chainId */
const CATEGORY_FALLBACK_CHAIN_ID: Record<string, string> = {
  ai: "ai_chatgpt_product_chain",
  product: "product_full_plan_chain",
  dev: "dev_code_opt_chain",
  business: "biz_make_money_chain",
  growth: "growth_strategy_chain",
  career: "career_write_resume_chain",
  creative: "creative_startup_idea_chain",
  learning: "learning_path_give_chain",
};

/** 默认：starterId → `${starterId}_chain` */
export function defaultChainIdForStarter(starterId: string): string {
  if (starterId === "dev_code_opt") return "code_opt_chain";
  return `${starterId}_chain`;
}

export function getActionChain(chainId: string): ActionChain | null {
  if (!chainId) return null;
  return ACTION_CHAINS[chainId] ?? null;
}

export function resolveChainId(opts: {
  chainId?: string | null;
  starterId?: string | null;
  category?: string | null;
}): string | null {
  if (opts.chainId && ACTION_CHAINS[opts.chainId]) return opts.chainId;
  if (opts.starterId) {
    const derived = defaultChainIdForStarter(opts.starterId);
    if (ACTION_CHAINS[derived]) return derived;
  }
  if (opts.category && CATEGORY_FALLBACK_CHAIN_ID[opts.category]) {
    return CATEGORY_FALLBACK_CHAIN_ID[opts.category]!;
  }
  return null;
}

/** actions → QuickAction（最多 3 个，动作句） */
export function chainActionsToQuickActions(
  actions: string[],
  chainId: string,
): QuickAction[] {
  return actions.slice(0, 3).map((raw, i) => {
    const prompt = stripArrow(raw);
    return {
      id: `chain-${chainId}-${i}`,
      label: prompt,
      prompt,
    };
  });
}

/** @deprecated 请用 chainActionsToQuickActions */
export function chainStepsToQuickActions(
  step3: string[],
  chainId: string,
): QuickAction[] {
  return chainActionsToQuickActions(step3, chainId);
}

/** step2 气泡正文：承接 + 方向引导 */
export function buildActionChainStep2Content(chain: ActionChain): string {
  return `${chain.step1}\n\n${chain.step2}`;
}

/** 后端：检测到 meta.chainId 时的系统提示附录 */
export const ACTION_CHAIN_CONTINUE_PROMPT = `【推进链跟进模式】
当前用户处于「任务推进链」中（meta.chainId 存在）。请：
1. 优先围绕当前任务继续回答，不要切换话题
2. 进入该建议动作的下一步讲解（具体、可执行）
3. 不要一次性给完整长文，分阶段推进
4. 结尾自然带出 2~3 个具体「下一步动作」（动作句，不要空泛）
5. 帮用户决定下一步，而不是让用户自己想「然后怎么办」`;
