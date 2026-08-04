import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const DEEPSEEK_PROVIDER = {
  name: "DeepSeek",
  slug: "deepseek",
  website: "https://www.deepseek.com",
  description: "DeepSeek 大语言模型，当前平台统一推理后端。",
} as const;

const MODELS = [
  {
    name: "DeepSeek Lite",
    slug: "deepseek-lite",
    description: "轻量快速，适合简单问答与短文本任务。",
    contextWindow: 64000,
  },
  {
    name: "DeepSeek Standard",
    slug: "deepseek-standard",
    description: "均衡能力，适合专业分析与结构化输出。",
    contextWindow: 128000,
  },
  {
    name: "DeepSeek Premium",
    slug: "deepseek-premium",
    description: "高能力档位，适合复杂任务与详细方案。",
    contextWindow: 128000,
  },
] as const;

const PACKAGES = [
  {
    key: "basic",
    name: "基础套餐",
    tokenAmount: 10000,
    price: 9.9,
    description: "适合个人尝鲜与轻度使用",
    sortOrder: 1,
  },
  {
    key: "standard",
    name: "标准套餐",
    tokenAmount: 50000,
    price: 44,
    description: "性价比之选，适合高频个人/小团队",
    sortOrder: 2,
  },
  {
    key: "enterprise",
    name: "企业套餐",
    tokenAmount: 100000,
    price: 79,
    description: "批量采购，适合企业与代理商",
    sortOrder: 3,
  },
] as const;

/** AIService → AIModel；SALES 不绑定 */
const SERVICES: Array<{
  id: string;
  name: string;
  slug: string;
  description: string;
  type: "SALES" | "LIGHT" | "STANDARD" | "PREMIUM";
  tokenCost: number;
  sortOrder: number;
  modelSlug: string | null;
}> = [
  {
    id: "svc_sales",
    name: "Token销售客服",
    slug: "sales",
    description: "Token AI 免费销售顾问：需求问诊、模型推荐、知识库 RAG；0 Token",
    type: "SALES",
    tokenCost: 0,
    sortOrder: 1,
    modelSlug: null,
  },
  {
    id: "svc_light",
    name: "A模型AI",
    slug: "light",
    description: "快速思考，适合简单任务，低消耗（对应 DeepSeek Lite）",
    type: "LIGHT",
    tokenCost: 5,
    sortOrder: 2,
    modelSlug: "deepseek-lite",
  },
  {
    id: "svc_standard",
    name: "B模型AI",
    slug: "standard",
    description: "中等能力，适合综合任务，中等消耗（对应 DeepSeek Standard）",
    type: "STANDARD",
    tokenCost: 20,
    sortOrder: 3,
    modelSlug: "deepseek-standard",
  },
  {
    id: "svc_premium",
    name: "C模型AI",
    slug: "premium",
    description: "最高能力，适合复杂任务，高消耗（对应 DeepSeek Premium）",
    type: "PREMIUM",
    tokenCost: 50,
    sortOrder: 4,
    modelSlug: "deepseek-premium",
  },
];

const SALES_KNOWLEDGE: Array<{
  category: string;
  title: string;
  content: string;
  keywords: string;
}> = [
  {
    category: "product",
    title: "Token AI 平台介绍",
    content: `Token AI 客服是面向个人与团队的 AI Agent 工作台。
核心能力：
1) 四通道分层：SALES（免费销售顾问）、LIGHT（A模型）、STANDARD（B模型）、PREMIUM（C模型）
2) Token 是平台 AI 服务额度；SALES 咨询免费，付费通道按次固定扣费
3) 用户可在顶栏自主切换通道，系统不会因问题变难自动升级扣费
4) 支持会话记忆与按用户数据隔离
5) 适合售前咨询、开发辅助、技术方案设计等场景
购买入口：/recharge；通道切换：聊天顶栏。`,
    keywords: "Token AI,介绍,平台,产品,是什么,客服,agent,工作台",
  },
  {
    category: "model_diff",
    title: "A/B/C 模型（LIGHT/STANDARD/PREMIUM）区别",
    content: `四通道差异：

SALES（销售客服）· 免费
- 职责：了解需求、推荐通道、介绍套餐与购买、竞品说明
- 不负责写完整代码或企业级架构

LIGHT / A模型AI · 5 Token/次 · 轻量快速
- 适合：简单问答、文案修改、翻译、基础代码解释
- 画像：普通学生、轻度使用、低频问答

STANDARD / B模型AI · 20 Token/次 · 均衡开发
- 适合：项目规划、数据库设计、普通代码开发、技术分析
- 画像：程序员开发项目、中等复杂度任务

PREMIUM / C模型AI · 50 Token/次 · 高级推理
- 适合：大型系统架构、复杂算法、企业级方案、深度技术分析
- 画像：企业架构师、高难度方案

推荐原则：先问需求/场景/预算/技术水平，再推荐；不要一上来甩套餐。`,
    keywords:
      "模型,区别,LIGHT,STANDARD,PREMIUM,A模型,B模型,C模型,适合,推荐,哪个",
  },
  {
    category: "pricing",
    title: "Token 套餐与计费说明",
    content: `计费规则：
- SALES：免费，不消耗 Token
- LIGHT：5 Token/次
- STANDARD：20 Token/次
- PREMIUM：50 Token/次
按通道固定扣费，不因问题复杂自动加价。

常见套餐（以数据库实时目录为准，seed 默认）：
- 基础套餐：10,000 Token，约 ¥9.9，适合个人尝鲜
- 标准套餐：50,000 Token，约 ¥44，适合高频个人/小团队
- 企业套餐：100,000 Token，约 ¥79，适合企业与代理

购买流程：打开 /recharge → 选择套餐 → 确认 → 模拟支付成功 → 余额到账 → 顶栏切换付费通道。
仅在用户明确问价格/购买/充值时详细列出套餐。`,
    keywords:
      "套餐,价格,多少钱,Token,充值,购买,计费,费用,基础套餐,标准套餐,企业套餐",
  },
  {
    category: "competitor",
    title: "市面 AI Agent 竞品对比（产品视角）",
    content: `相比市面常见 AI Agent 平台，Token AI 优势在于：

1. 模型选择：SALES / LIGHT / STANDARD / PREMIUM 分层清晰，职责明确
2. Token 计费透明度：每通道固定费用，不会因问题变难就自动加价升级
3. 用户自主选择模型：顶栏手动切换，系统不替用户升级
4. 数据隔离：按用户隔离会话与记忆
5. 会话记忆：可记住偏好与业务事实，咨询更连贯
6. 企业扩展能力：可扩展套餐、服务目录与多档 Agent

回答时不攻击具体竞品品牌，强调「透明、可控、可分层」的产品价值。`,
    keywords: "竞品,对比,区别,其他AI,Agent,优势,市面,和其他",
  },
  {
    category: "faq",
    title: "常见客户问题 FAQ",
    content: `Q: 我想做一个网站，该买哪个？
A: 先确认项目类型、是否要写代码、使用频率和预算，再推荐。多数个人建站开发选 STANDARD；只要问答/文案选 LIGHT；企业级架构选 PREMIUM。

Q: 哪个模型适合我？
A: 学生轻度 → LIGHT；程序员做项目 → STANDARD；企业架构/复杂方案 → PREMIUM。

Q: SALES 收费吗？
A: 不收费。SALES 是免费销售顾问。

Q: 会不会问题很难就自动扣更多 Token？
A: 不会。扣费只跟你选择的通道有关。

Q: 怎么购买？
A: /recharge 选套餐支付；到账后在顶栏切换 LIGHT/STANDARD/PREMIUM。

Q: 和其他 AI Token Agent 有什么区别？
A: 见竞品对比：分层模型、固定计费、自主切换、数据隔离、会话记忆、可扩展。`,
    keywords: "FAQ,常见,怎么,如何,问题,适合我,网站,收费吗,自动升级",
  },
  {
    category: "competitor",
    title: "与 Coze（扣子）的差异说明",
    content: `Coze（扣子）擅长可视化 Bot 编排与插件生态，适合快速搭对话机器人与工作流。
Token AI 不贬低 Coze。若客户目标是：
- 透明按次计费、自主切换 LIGHT/STANDARD/PREMIUM → 更匹配 Token AI
- 免费售前顾问帮选型 → 用 SALES
- 以编排/插件市场为主 → 可继续评估 Coze
话术：先认同「要搭 Agent」的目标，再问更在意编排效率还是计费可控。`,
    keywords: "Coze,扣子,竞品,对比,编排,bot",
  },
  {
    category: "competitor",
    title: "与 Dify 的差异说明",
    content: `Dify 擅长 LLMOps / 工作流与知识库应用搭建，开发者友好。
Token AI 不贬低 Dify。差异沟通：
- 要「多档对话 Agent + 固定 Token 计费 + 顶栏自选档位」→ Token AI
- 要「可视化工作流/RAG 应用工厂」→ 可评估 Dify
话术：强调我们卖的是可控计费的分层客服/开发 Agent，不是否定 Dify 的编排价值。`,
    keywords: "Dify,竞品,对比,工作流,RAG,LLMOps",
  },
  {
    category: "competitor",
    title: "与 FastGPT 的差异说明",
    content: `FastGPT 常见定位是知识库问答与流程编排，适合文档型 Bot。
Token AI 不贬低 FastGPT。若客户要：
- 文档知识库问答为主 → FastGPT 类产品可评估
- 按能力档位计费的开发/架构对话助手 + 售前问诊 → Token AI
话术：先问「更需要知识库问答，还是多档开发助手」。`,
    keywords: "FastGPT,竞品,对比,知识库,问答",
  },
  {
    category: "competitor",
    title: "与 Chatbase 的差异说明",
    content: `Chatbase 常见定位是网站/文档聊天机器人托管，偏客户支持 Bot。
Token AI 不贬低 Chatbase。差异：
- 网站客服 Bot 嵌入 → Chatbase 类可评估
- 分层 AI 工作台（销售顾问 + A/B/C 开发档位）+ Token 额度 → Token AI
话术：按「客服 Bot」还是「开发/方案 Agent」匹配需求。`,
    keywords: "Chatbase,竞品,对比,网站客服,chatbot",
  },
  {
    category: "script",
    title: "销售话术：不攻击竞品",
    content: `原则：
1. 不说竞品「不好/垃圾/骗人」
2. 用「相比市面常见方案，我们更适合…」
3. 先复述客户目标，再给匹配点
4. 结束时给下一步：问诊 / 推荐通道 / /recharge

示例：
「Coze/Dify 很适合做编排和知识库应用。如果您更希望按次透明计费、自己切换 LIGHT/STANDARD/PREMIUM，并先用免费顾问帮您选型，可以看看 Token AI。」`,
    keywords: "话术,竞品,不攻击,对比,销售,script",
  },
  {
    category: "script",
    title: "销售话术：问诊后推荐模型",
    content: `问诊四问：需求、场景、预算、技术水平。
推荐模板：
- 学生/轻度 → LIGHT（A模型，5 Token）
- 个人开发/项目 → STANDARD（B模型，20 Token）
- 企业架构/复杂方案 → PREMIUM（C模型，50 Token）
句式：「根据你的场景，更建议 …，因为 …。可在顶栏切换；需要额度再充值。」
禁止：未问诊就甩整页套餐。`,
    keywords: "话术,推荐,问诊,LIGHT,STANDARD,PREMIUM,script",
  },
];

async function main() {
  // 1) 解绑服务模型，便于删除旧厂商/模型
  await prisma.aIService.updateMany({ data: { modelId: null } });

  // 2) 清空旧目录（保留 AIService / Package / 用户数据）
  await prisma.aIModel.deleteMany();
  await prisma.aIProvider.deleteMany();

  // 3) DeepSeek 厂商
  const provider = await prisma.aIProvider.create({
    data: { ...DEEPSEEK_PROVIDER },
  });

  // 4) DeepSeek 三档模型
  for (const model of MODELS) {
    await prisma.aIModel.create({
      data: {
        providerId: provider.id,
        name: model.name,
        slug: model.slug,
        description: model.description,
        contextWindow: model.contextWindow,
        active: true,
      },
    });
  }

  const models = await prisma.aIModel.findMany();
  const modelBySlug = new Map(models.map((m) => [m.slug, m]));

  // 5) AIService 绑定
  for (const svc of SERVICES) {
    const modelId = svc.modelSlug
      ? (modelBySlug.get(svc.modelSlug)?.id ?? null)
      : null;

    await prisma.aIService.upsert({
      where: { slug: svc.slug },
      create: {
        id: svc.id,
        name: svc.name,
        slug: svc.slug,
        description: svc.description,
        type: svc.type,
        tokenCost: svc.tokenCost,
        sortOrder: svc.sortOrder,
        active: true,
        modelId,
      },
      update: {
        name: svc.name,
        description: svc.description,
        type: svc.type,
        tokenCost: svc.tokenCost,
        sortOrder: svc.sortOrder,
        active: true,
        modelId,
      },
    });
  }

  // 6) 套餐保持
  for (const pkg of PACKAGES) {
    await prisma.tokenPackage.upsert({
      where: { key: pkg.key },
      create: { ...pkg, active: true },
      update: {
        name: pkg.name,
        tokenAmount: pkg.tokenAmount,
        price: pkg.price,
        description: pkg.description,
        sortOrder: pkg.sortOrder,
        active: true,
      },
    });
  }

  // 7) SALES 知识库（RAG）
  await prisma.salesKnowledge.deleteMany();
  for (const item of SALES_KNOWLEDGE) {
    await prisma.salesKnowledge.create({ data: item });
  }

  // 8) ModelCapability（兼容旧表）+ ModelConfig（权威 A/B/C 配置）
  await prisma.modelCapability.deleteMany();
  await prisma.modelConfig.deleteMany();

  const MODEL_CONFIGS = [
    {
      serviceType: "LIGHT",
      grade: "A",
      name: "A模型AI",
      capability:
        "快速、低成本、简单任务：短问答、文案修改、翻译、基础概念解释。",
      suitableFor:
        "简单问答；文案润色；翻译；作业答疑；轻度解释；预算敏感的尝鲜场景",
      limitations:
        "不做完整项目开发；不做大型系统架构；不做复杂算法与企业级方案；回答应短而快",
      tokenCost: 5,
      maxContext: 4096,
      systemInstructions:
        "以短答、低延迟风格回复。复杂或架构类问题只给极简要点，并建议用户切换 STANDARD 或 PREMIUM。全文宜短，禁止长篇架构文。",
      keywords: "LIGHT,A,A模型,轻量,快速,低成本,翻译,文案,学生",
      sortOrder: 1,
    },
    {
      serviceType: "STANDARD",
      grade: "B",
      name: "B模型AI",
      capability:
        "通用生产力、中等推理：项目规划、数据库设计、普通代码开发、技术分析。",
      suitableFor:
        "项目规划；数据库设计；普通代码开发；技术方案；中等复杂度分析；个人开发者与小团队",
      limitations:
        "不输出超大型分布式总方案；不替代 C 档做极深企业架构与复杂算法论文级方案",
      tokenCost: 20,
      maxContext: 16384,
      systemInstructions:
        "提供结构化、可执行的中等深度回答。不要写成 PREMIUM 级超长总方案；保持 B 档边界。",
      keywords: "STANDARD,B,B模型,生产力,开发,数据库,项目,中等推理",
      sortOrder: 2,
    },
    {
      serviceType: "PREMIUM",
      grade: "C",
      name: "C模型AI",
      capability:
        "高级推理、架构设计、复杂任务：大型系统架构、复杂算法、企业级方案、深度技术分析。",
      suitableFor:
        "大型系统架构；复杂算法；企业级方案；高并发设计；深度技术分析；架构师与企业团队",
      limitations:
        "仅翻译/改文案等轻度任务性价比偏低，宜引导至 A 档；费用高于 A/B",
      tokenCost: 50,
      maxContext: 65536,
      systemInstructions:
        "允许完整详细方案、多方案对比与风险点。你不是 STANDARD 或 LIGHT；发挥 C 档深度推理。",
      keywords: "PREMIUM,C,C模型,高级推理,架构,企业,算法,复杂",
      sortOrder: 3,
    },
  ] as const;

  for (const row of MODEL_CONFIGS) {
    await prisma.modelConfig.create({ data: { ...row } });
    await prisma.modelCapability.create({
      data: {
        serviceType: row.serviceType,
        name: row.name,
        tokenCost: row.tokenCost,
        positioning: row.capability,
        suitableFor: row.suitableFor,
        notSuitableFor: row.limitations,
        persona: `${row.grade}档 · 上下文约 ${row.maxContext}`,
        keywords: row.keywords,
        sortOrder: row.sortOrder,
      },
    });
  }

  // 9) CompetitorKnowledge
  await prisma.competitorKnowledge.deleteMany();
  const COMPETITORS = [
    {
      name: "Coze",
      slug: "coze",
      summary: "可视化 Bot 编排与插件生态，适合快速搭建对话机器人与工作流。",
      strengths: "编排效率高、插件生态、上手快、适合运营向 Bot。",
      differences:
        "Token AI 更强调按次透明计费与 LIGHT/STANDARD/PREMIUM 自主选档，并提供免费 SALES 售前问诊；Coze 更偏编排与插件。",
      talkTrack:
        "Coze 很适合搭编排型 Bot。如果您更希望计费可控、自己切换能力档位，并先用免费顾问帮选型，可以看看 Token AI。",
      keywords: "Coze,扣子,编排,bot,插件",
    },
    {
      name: "Dify",
      slug: "dify",
      summary: "LLMOps / 工作流与知识库应用搭建平台，开发者友好。",
      strengths: "工作流、知识库、可观测与应用工厂能力强。",
      differences:
        "Token AI 侧重分层对话 Agent 与固定 Token 计费；Dify 侧重可视化工作流与 RAG 应用构建。",
      talkTrack:
        "Dify 很适合做工作流和知识库应用。若您要的是可切换档位的开发/架构对话助手 + 售前选型，Token AI 更贴合。",
      keywords: "Dify,工作流,RAG,LLMOps",
    },
    {
      name: "FastGPT",
      slug: "fastgpt",
      summary: "常见定位为知识库问答与流程编排，适合文档型 Bot。",
      strengths: "文档知识库问答、流程配置相对直接。",
      differences:
        "文档问答为主时可评估 FastGPT；多档开发助手 + 计费分层 + 售前顾问更匹配 Token AI。",
      talkTrack:
        "如果核心是文档知识库问答，FastGPT 值得评估；若还要按能力档位做开发/架构对话，可对比 Token AI。",
      keywords: "FastGPT,知识库,问答",
    },
    {
      name: "Chatbase",
      slug: "chatbase",
      summary: "常见定位为网站/文档聊天机器人托管，偏客户支持 Bot。",
      strengths: "网站嵌入客服 Bot、文档训练聊天机器人方便。",
      differences:
        "网站客服 Bot 可评估 Chatbase；分层 AI 工作台（销售顾问 + A/B/C）与 Token 额度体系是 Token AI 的侧重点。",
      talkTrack:
        "若目标是网站客服 Bot，Chatbase 很常见；若要分层开发 Agent 与透明 Token 计费，可以看 Token AI。",
      keywords: "Chatbase,网站客服,chatbot",
    },
  ] as const;

  for (const row of COMPETITORS) {
    await prisma.competitorKnowledge.create({ data: { ...row } });
  }

  // 10) CustomerProfile
  await prisma.customerProfile.deleteMany();
  const PROFILES = [
    {
      code: "STUDENT",
      name: "学生/轻度用户",
      description: "学习、作业、翻译、轻度问答，预算敏感。",
      matchKeywords: "学生,作业,课程,翻译,文案,轻度,尝鲜,试用",
      typicalNeeds: "问答、翻译、文案、入门解释",
      talkTrack: "先认同学习场景，推荐低成本档，说明可随时升级。",
      defaultRecommend: "LIGHT",
      clarifyingQuestions: "主要用来学习问答还是写作业？；预算是否希望尽量省？",
      sortOrder: 1,
    },
    {
      code: "INDIVIDUAL_DEV",
      name: "个人开发者",
      description: "写代码、做项目、数据库与中等技术方案。",
      matchKeywords: "程序员,开发者,工程师,写代码,做项目,个人开发",
      typicalNeeds: "代码开发、项目规划、数据库设计",
      talkTrack: "围绕开发效率推荐均衡档，复杂架构再升 C。",
      defaultRecommend: "STANDARD",
      clarifyingQuestions: "项目偏前端/后端还是全栈？；是否需要架构级方案？",
      sortOrder: 2,
    },
    {
      code: "STARTUP_TEAM",
      name: "创业小团队",
      description: "小团队交付产品，要性价比与开发效率。",
      matchKeywords: "创业,团队,startup,小公司,工作室",
      typicalNeeds: "后台、官网、MVP、中等开发",
      talkTrack: "推荐 STANDARD 覆盖日常开发；关键架构节点再用 PREMIUM。",
      defaultRecommend: "STANDARD",
      clarifyingQuestions: "团队规模大概多少？；当前最急的是开发还是架构？",
      sortOrder: 3,
    },
    {
      code: "ENTERPRISE",
      name: "企业客户",
      description: "企业采购、合规、高并发或大型架构。",
      matchKeywords: "企业,公司,采购,私有化,合规,招投标,架构师",
      typicalNeeds: "企业方案、架构、高并发、合规咨询",
      talkTrack: "强调深度方案与可控计费，主推 PREMIUM，并了解采购流程。",
      defaultRecommend: "PREMIUM",
      clarifyingQuestions: "使用人数与场景？；是否有私有化/合规要求？",
      sortOrder: 4,
    },
    {
      code: "UNKNOWN",
      name: "未明确客户",
      description: "信息不足，需要问诊。",
      matchKeywords: "",
      typicalNeeds: "待确认",
      talkTrack: "先问诊场景/预算/技术水平，再推荐档位。",
      defaultRecommend: "",
      clarifyingQuestions:
        "使用场景更偏学习、个人开发还是企业？；是否需要写代码或做架构？；预算更在意省着用还是方案深度？",
      sortOrder: 99,
    },
  ] as const;
  for (const row of PROFILES) {
    await prisma.customerProfile.create({ data: { ...row } });
  }

  // 11) SalesStrategy
  await prisma.salesStrategy.deleteMany();
  const STRATEGIES = [
    {
      code: "model_select_default",
      intent: "MODEL_SELECT",
      customerType: "*",
      name: "模型选型",
      guidelines:
        "根据 CustomerProfile + ModelRecommendRule 推荐 LIGHT/STANDARD/PREMIUM；用 ModelConfig/ModelCapability 解释理由；引导顶栏切换。",
      talkTrack: "根据你的场景，更建议 …；需要的话我也可以对比各档差异（数据来自配置表）。",
      forbidden: "禁止编造未入库的能力；禁止自称付费模型身份",
      priority: 100,
    },
    {
      code: "price_query_default",
      intent: "PRICE_QUERY",
      customerType: "*",
      name: "价格咨询",
      guidelines:
        "先确认场景再给价；引用 TokenPackage 与 ModelConfig.tokenCost；明确购买意图再引导 /recharge。",
      talkTrack: "各档按次计费，我先帮你看场景再给合适套餐。",
      forbidden: "不要一上来甩完整价目表",
      priority: 100,
    },
    {
      code: "product_compare_default",
      intent: "PRODUCT_COMPARE",
      customerType: "*",
      name: "竞品对比",
      guidelines:
        "只使用 CompetitorKnowledge；先认同客户目标，再讲差异化；不攻击竞品。",
      talkTrack: "对方也有适用场景；若你要透明按次计费+自主选档，Token AI 更贴合。",
      forbidden: "禁止贬低 Coze/Dify/FastGPT/Chatbase",
      priority: 100,
    },
    {
      code: "tech_requirement_default",
      intent: "TECH_REQUIREMENT",
      customerType: "*",
      name: "技术需求",
      guidelines:
        "未就绪先问诊；就绪后按规则推荐档位并说明适用场景来自数据库。",
      talkTrack: "我先确认项目类型与技术深度，再建议对应通道。",
      forbidden: "禁止直接替用户写完整架构长文（那是付费档职责）",
      priority: 90,
    },
    {
      code: "enterprise_plan_default",
      intent: "ENTERPRISE_PLAN",
      customerType: "*",
      name: "企业方案",
      guidelines: "主推 PREMIUM；了解人数/合规/私有化；可结合套餐谈采购。",
      talkTrack: "企业场景通常更适合 C 档深度方案，我帮你对齐需求与预算。",
      forbidden: "禁止承诺未上线的私有化交付细节",
      priority: 100,
    },
    {
      code: "general_chat_default",
      intent: "GENERAL_CHAT",
      customerType: "*",
      name: "一般咨询",
      guidelines: "先建立信任与问诊，再进入推荐；保持 Token AI客服 身份。",
      talkTrack: "我是 Token AI客服，可以帮你选型与了解套餐。",
      forbidden: "禁止无脑甩套餐",
      priority: 50,
    },
    {
      code: "student_light",
      intent: "*",
      customerType: "STUDENT",
      name: "学生友好",
      guidelines: "强调低成本 LIGHT；说明可升级。",
      talkTrack: "学习场景通常 A 档就够用，写代码再升 B。",
      forbidden: "",
      priority: 80,
    },
  ] as const;
  for (const row of STRATEGIES) {
    await prisma.salesStrategy.create({ data: { ...row } });
  }

  // 12) ModelRecommendRule
  await prisma.modelRecommendRule.deleteMany();
  const RULES = [
    {
      name: "企业/架构→PREMIUM",
      priority: 100,
      customerType: "*",
      intent: "*",
      budgetLevel: "*",
      techLevel: "expert",
      matchKeywords: "架构,高并发,分布式,微服务,企业级,复杂算法",
      requireKeywords: "",
      excludeKeywords: "",
      recommendServiceType: "PREMIUM",
      reasonTemplate:
        "高技术水平或大型架构/企业场景，匹配 C 模型（PREMIUM）。能力细节见 ModelConfig。",
      confidence: "high",
    },
    {
      name: "企业客户→PREMIUM",
      priority: 95,
      customerType: "ENTERPRISE",
      intent: "*",
      budgetLevel: "*",
      techLevel: "*",
      matchKeywords: "",
      requireKeywords: "",
      excludeKeywords: "",
      recommendServiceType: "PREMIUM",
      reasonTemplate: "企业客户画像默认匹配 PREMIUM（C）。",
      confidence: "high",
    },
    {
      name: "高预算深度→PREMIUM",
      priority: 85,
      customerType: "*",
      intent: "*",
      budgetLevel: "high",
      techLevel: "*",
      matchKeywords: "方案,架构,深度",
      requireKeywords: "",
      excludeKeywords: "翻译,文案",
      recommendServiceType: "PREMIUM",
      reasonTemplate: "预算充足且目标偏深度方案，优先 PREMIUM。",
      confidence: "medium",
    },
    {
      name: "轻度/低预算→LIGHT",
      priority: 90,
      customerType: "*",
      intent: "*",
      budgetLevel: "low",
      techLevel: "*",
      matchKeywords: "翻译,文案,问答,作业,轻度,学生",
      requireKeywords: "",
      excludeKeywords: "架构,高并发,微服务",
      recommendServiceType: "LIGHT",
      reasonTemplate: "轻度/入门或低预算非重开发场景，匹配 A 模型（LIGHT）。",
      confidence: "high",
    },
    {
      name: "学生画像→LIGHT",
      priority: 88,
      customerType: "STUDENT",
      intent: "*",
      budgetLevel: "*",
      techLevel: "*",
      matchKeywords: "",
      requireKeywords: "",
      excludeKeywords: "架构,企业级",
      recommendServiceType: "LIGHT",
      reasonTemplate: "学生/轻度用户画像，默认 LIGHT。",
      confidence: "high",
    },
    {
      name: "开发/项目→STANDARD",
      priority: 80,
      customerType: "*",
      intent: "*",
      budgetLevel: "*",
      techLevel: "intermediate",
      matchKeywords: "代码,开发,数据库,项目,后台,网站",
      requireKeywords: "",
      excludeKeywords: "",
      recommendServiceType: "STANDARD",
      reasonTemplate: "中等开发/项目规划场景，匹配 B 模型（STANDARD）。",
      confidence: "high",
    },
    {
      name: "个人开发者→STANDARD",
      priority: 78,
      customerType: "INDIVIDUAL_DEV",
      intent: "*",
      budgetLevel: "*",
      techLevel: "*",
      matchKeywords: "",
      requireKeywords: "",
      excludeKeywords: "",
      recommendServiceType: "STANDARD",
      reasonTemplate: "个人开发者画像，默认 STANDARD。",
      confidence: "high",
    },
    {
      name: "创业团队→STANDARD",
      priority: 78,
      customerType: "STARTUP_TEAM",
      intent: "*",
      budgetLevel: "*",
      techLevel: "*",
      matchKeywords: "",
      requireKeywords: "",
      excludeKeywords: "",
      recommendServiceType: "STANDARD",
      reasonTemplate: "创业小团队日常交付，默认 STANDARD。",
      confidence: "medium",
    },
    {
      name: "技术需求开发向→STANDARD",
      priority: 70,
      customerType: "*",
      intent: "TECH_REQUIREMENT",
      budgetLevel: "*",
      techLevel: "*",
      matchKeywords: "代码,开发,数据库,后台,网站,api",
      requireKeywords: "",
      excludeKeywords: "高并发,分布式,企业级架构",
      recommendServiceType: "STANDARD",
      reasonTemplate: "技术需求偏中等开发，推荐 STANDARD。",
      confidence: "medium",
    },
  ] as const;
  for (const row of RULES) {
    await prisma.modelRecommendRule.create({ data: { ...row } });
  }

  const counts = {
    providers: await prisma.aIProvider.count(),
    models: await prisma.aIModel.count(),
    services: await prisma.aIService.count(),
    packages: await prisma.tokenPackage.count(),
    salesKnowledge: await prisma.salesKnowledge.count(),
    modelCapability: await prisma.modelCapability.count(),
    modelConfig: await prisma.modelConfig.count(),
    competitorKnowledge: await prisma.competitorKnowledge.count(),
    customerProfile: await prisma.customerProfile.count(),
    salesStrategy: await prisma.salesStrategy.count(),
    modelRecommendRule: await prisma.modelRecommendRule.count(),
  };
  console.log("Seed completed:", counts);

  const bindings = await prisma.aIService.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      type: true,
      slug: true,
      model: { select: { slug: true, name: true } },
    },
  });
  console.log(
    "Service → Model:",
    bindings.map((b) => `${b.type} → ${b.model?.name ?? "(null)"}`),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
