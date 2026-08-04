import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  extractAndSaveMemories,
  getUserMemories,
} from "@/lib/memory";
import {
  detectChatIntent,
  shouldShowProductCards,
} from "@/lib/intent";
import { listActiveModels, listActivePackages, formatModelsForPrompt, formatPackagesForPrompt } from "@/lib/catalog";
import {
  buildAgentSystemPrompt,
  buildLockReminder,
  enforceTierReply,
  extractPromptModelIdentity,
  getLockedTokenCost,
  isChatServiceType,
  sanitizeHistoryForLockedType,
  serviceTypeToFeature,
} from "@/lib/agent-router";
import {
  resolveModelRouteByType,
  resolveOpenAIClientOptions,
} from "@/lib/model-router";
import { buildSalesTemplateReply } from "@/lib/sales-reply";
import { runSalesPipeline } from "@/lib/sales-pipeline";
import { getModelConfig } from "@/lib/model-config";
import { getModelCapability } from "@/lib/model-capability";
import {
  consumeFeatureToken,
  consumeUserToken,
  decrementFreeChatCount,
  TokenNotEnoughError,
  tokenNotEnoughResponse,
} from "@/lib/tokens";
import { SERVICE_CONFIG } from "@/lib/constants";
import { MessageRole, type AIServiceType } from "@/app/generated/prisma/enums";
import OpenAI from "openai";
import { NextResponse } from "next/server";

const serviceInclude = {
  model: {
    include: {
      provider: true,
    },
  },
} as const;

/**
 * 唯一锁定依据：请求体 serviceType。
 * 按 type 查 AIService 行（目录绑定），禁止用 Conversation / 旧选择覆盖等级。
 */
async function resolveServiceByType(serviceType: AIServiceType) {
  return prisma.aIService.findFirst({
    where: { type: serviceType, active: true },
    orderBy: { sortOrder: "asc" },
    include: serviceInclude,
  });
}

/**
 * AI 聊天：serviceType 决定 prompt / 是否调 LLM / 扣费，禁止自动升级。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json();
    const message =
      typeof body?.message === "string" ? body.message.trim() : "";
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId : undefined;

    const rawServiceType =
      typeof body?.serviceType === "string"
        ? body.serviceType.trim().toUpperCase()
        : "";

    if (!message) {
      return NextResponse.json(
        { error: "Invalid request body. 'message' must be a non-empty string." },
        { status: 400 },
      );
    }

    if (!isChatServiceType(rawServiceType)) {
      return NextResponse.json(
        {
          error:
            "请指定有效的 serviceType（SALES | LIGHT | STANDARD | PREMIUM）。",
        },
        { status: 400 },
      );
    }

    const lockedType = rawServiceType;
    const lockedConfig = SERVICE_CONFIG[lockedType];
    const lockedCost = lockedConfig.cost;

    // 一致性日志：请求选择 vs 实际使用 vs 扣费
    console.log(
      `selectedServiceType=${lockedType} usedServiceType=${lockedType} tokenCost=${lockedCost}`,
    );

    // 断言：扣费表与统一配置一致，禁止任何旁路
    if (lockedCost !== getLockedTokenCost(lockedType)) {
      return NextResponse.json(
        { error: "扣费配置不一致。" },
        { status: 500 },
      );
    }

    let conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, userId: user.id },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20,
            },
          },
        })
      : null;

    if (conversationId && !conversation) {
      return NextResponse.json(
        { error: "会话不存在或无权访问。" },
        { status: 404 },
      );
    }

    const service = await resolveServiceByType(lockedType);
    if (!service) {
      return NextResponse.json(
        {
          error: `未找到启用的 ${lockedType} 服务，请先在后台/seed 配置。`,
          redirect: "/select-ai",
        },
        { status: 400 },
      );
    }

    // 目录行 type 必须与请求一致（防御脏数据）
    if (service.type !== lockedType) {
      return NextResponse.json(
        { error: "服务目录 type 与请求 serviceType 不一致。" },
        { status: 500 },
      );
    }

    const feature = serviceTypeToFeature(lockedType);
    const modelRoute = resolveModelRouteByType(lockedType, service);

    if (
      modelRoute.serviceType !== lockedType ||
      modelRoute.tokenCost !== lockedCost
    ) {
      return NextResponse.json(
        { error: "模型路由与锁定 serviceType 不一致。" },
        { status: 500 },
      );
    }

    // intent 仅用于 SALES 商品卡展示时机，绝不参与扣费或模型选择
    const intent = detectChatIntent(message);
    const showProducts =
      lockedType === "SALES" && shouldShowProductCards(intent);

    let tokenBalance = user.tokenBalance;
    let freeChatCount = user.freeChatCount;
    let featureCost = 0;

    if (lockedCost > 0) {
      try {
        // cost = SERVICE_TOKEN_COST[userSelectedService]，禁止按回复内容计费
        const updated = feature
          ? await consumeFeatureToken(user.id, feature)
          : await consumeUserToken(user.id, lockedCost);
        tokenBalance = updated.tokenBalance;
        freeChatCount = updated.freeChatCount;
        featureCost = lockedCost;

        await prisma.tokenUsage.create({
          data: {
            userId: user.id,
            serviceId: service.id,
            amount: -featureCost,
            reason: `chat:${lockedType}`,
          },
        });
      } catch (error) {
        if (error instanceof TokenNotEnoughError) {
          return tokenNotEnoughResponse(error);
        }
        throw error;
      }
    } else {
      const updated = await decrementFreeChatCount(user.id);
      if (updated) {
        freeChatCount = updated.freeChatCount;
        tokenBalance = updated.tokenBalance;
      }
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          serviceId: service.id,
        },
        include: { messages: true },
      });
    } else if (conversation.serviceId !== service.id) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { serviceId: service.id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 20,
          },
        },
      });
    }

    const memories = await getUserMemories(user.id);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.user,
        content: message,
      },
    });

    let reply = "";
    let packages: Awaited<ReturnType<typeof listActivePackages>> = [];
    let memoryCount = memories.length;
    let usedFallback = false;
    let salesDecisionMeta:
      | {
          intent: string;
          customerType: string;
          industry?: string | null;
          budget?: string | null;
          techLevel?: string | null;
          recommended: string | null;
          readyToRecommend: boolean;
          knowledgeHitCount?: number;
          competitorHitCount?: number;
          modelCompare?: boolean;
          strategyHitCount?: number;
          ruleHit?: string | null;
        }
      | undefined;

    // SALES 需要套餐目录注入 prompt；购买意图时也可附商品卡
    if (lockedType === "SALES" || showProducts) {
      packages = await listActivePackages();
    }

    const clientOpts = modelRoute.callLlm
      ? resolveOpenAIClientOptions(modelRoute)
      : null;

    if (modelRoute.callLlm && !clientOpts) {
      // SALES：无 Key 时回退模板，仍保持 0 扣费
      if (lockedType === "SALES") {
        const pipeline = await runSalesPipeline(message);
        const models = await listActiveModels();
        usedFallback = true;
        salesDecisionMeta = pipeline.meta;
        reply = buildSalesTemplateReply({
          message,
          intent,
          tokenBalance,
          packages,
          models,
          knowledgeText: pipeline.promptContext,
          salesDecision: pipeline.decision,
        });
      } else {
        return NextResponse.json(
          {
            error: "缺少 DeepSeek API Key（环境变量 OPENAI_API_KEY）。",
          },
          { status: 500 },
        );
      }
    } else if (modelRoute.callLlm && clientOpts) {
      usedFallback = clientOpts.usedFallback;

      let salesCatalog:
        | {
            packagesText: string;
            modelsText: string;
            intent?: string;
            showProducts?: boolean;
          }
        | undefined;
      let salesPipelineContext: string | undefined;

      if (lockedType === "SALES") {
        const pipeline = await runSalesPipeline(message);
        const models = await listActiveModels();
        salesCatalog = {
          packagesText: formatPackagesForPrompt(packages),
          modelsText: formatModelsForPrompt(models),
          intent,
          showProducts,
        };
        salesPipelineContext = pipeline.promptContext;
        salesDecisionMeta = pipeline.meta;
      }

      const modelConfigRow =
        lockedType === "LIGHT" ||
        lockedType === "STANDARD" ||
        lockedType === "PREMIUM"
          ? await getModelConfig(lockedType)
          : null;
      const modelCapabilityRow =
        lockedType === "LIGHT" ||
        lockedType === "STANDARD" ||
        lockedType === "PREMIUM"
          ? await getModelCapability(lockedType)
          : null;

      const systemPrompt = buildAgentSystemPrompt({
        serviceType: lockedType,
        memories,
        tokenBalance,
        salesCatalog,
        salesPipelineContext,
        modelConfig: modelConfigRow,
        modelCapability: modelCapabilityRow,
      });

      const promptIdentity = extractPromptModelIdentity(systemPrompt);
      const expectedIdentity = `${lockedType} · ${lockedConfig.name}`;

      // 调用 DeepSeek 前：selectedServiceType / modelName / tokenCost / prompt 身份必须一致
      console.log(
        `[deepseek:pre] selectedServiceType=${lockedType} modelName=${lockedConfig.name} tokenCost=${lockedCost} promptIdentity=${promptIdentity}`,
      );

      if (promptIdentity !== expectedIdentity) {
        console.error(
          `[deepseek:identity-mismatch] expected=${expectedIdentity} got=${promptIdentity}`,
        );
        return NextResponse.json(
          { error: "系统提示词身份与 selectedServiceType 不一致。" },
          { status: 500 },
        );
      }

      if (
        !systemPrompt.includes(lockedType) ||
        !systemPrompt.includes(lockedConfig.name) ||
        systemPrompt.includes("默认 PREMIUM")
      ) {
        return NextResponse.json(
          { error: "system prompt 未正确绑定当前 serviceType。" },
          { status: 500 },
        );
      }

      const client = new OpenAI({
        apiKey: clientOpts.apiKey,
        baseURL: clientOpts.baseURL,
      });

      // LIGHT：无历史；SALES 保留咨询上下文；STANDARD/PREMIUM 清洗旧档位
      const rawWindow =
        lockedType === "LIGHT"
          ? []
          : lockedType === "SALES"
            ? conversation.messages.slice(-12)
            : lockedType === "STANDARD"
              ? conversation.messages.slice(-8)
              : conversation.messages.slice(-16);

      const historyWindow = rawWindow.map((item) => ({
        role: item.role as "user" | "assistant" | "system",
        content: sanitizeHistoryForLockedType(item.content, lockedType),
      }));

      const lockReminder = {
        role: "system" as const,
        content: buildLockReminder(lockedType),
      };

      const history = [
        { role: "system" as const, content: systemPrompt },
        ...historyWindow,
        lockReminder,
        { role: "user" as const, content: message },
      ];

      const completion = await client.chat.completions.create({
        model: clientOpts.model,
        messages: history,
        max_tokens: clientOpts.maxTokens,
        temperature: clientOpts.temperature,
      });

      reply = enforceTierReply(
        lockedType,
        completion.choices[0]?.message?.content?.trim() ?? "",
      );

      const savedMemories = await extractAndSaveMemories({
        client,
        userId: user.id,
        userMessage: message,
        assistantReply: reply,
        existingMemories: memories,
      });
      memoryCount = memories.length + savedMemories.length;
    } else {
      // 理论不可达：当前四通道均 callLlm=true
      const models = await listActiveModels();
      reply = buildSalesTemplateReply({
        message,
        intent,
        tokenBalance,
        packages,
        models,
      });
    }

    const displayName = lockedConfig.name;

    // 扣费/余额只写入消息快照字段，由气泡底部状态栏展示；禁止拼进 AI 正文
    const products = showProducts
      ? packages.map((p) => ({
          id: p.id,
          name: p.name,
          tokenAmount: p.tokenAmount,
          price: p.price,
        }))
      : [];

    // 快照必须等于本轮锁定值，禁止写库后与请求不一致
    if (featureCost !== lockedCost) {
      console.error(
        `tokenCost mismatch: featureCost=${featureCost} lockedCost=${lockedCost} type=${lockedType}`,
      );
    }

    console.log(
      `selectedServiceType=${lockedType} usedServiceType=${lockedType} tokenCost=${featureCost} modelName=${displayName}`,
    );

    const assistantRecord = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.assistant,
        content: reply,
        serviceType: lockedType,
        modelName: displayName,
        tokenCost: featureCost,
        tokenBalanceAfter: tokenBalance,
      },
    });

    return NextResponse.json({
      reply,
      conversationId: conversation.id,
      messageId: assistantRecord.id,
      tokenBalance,
      freeChatCount,
      intent,
      showProducts,
      products,
      service: {
        id: service.id,
        name: displayName,
        type: lockedType,
        tokenCost: lockedCost,
      },
      /** 本条助手消息生成时的模型快照（前端必须写入 ChatMessage，禁止用当前选择覆盖） */
      messageMeta: {
        serviceType: lockedType,
        modelName: displayName,
        tokenCost: featureCost,
        tokenBalanceAfter: tokenBalance,
      },
      modelRoute: {
        provider: modelRoute.provider,
        model: modelRoute.model,
        serviceType: modelRoute.serviceType,
        tokenCost: modelRoute.tokenCost,
        displayName: modelRoute.displayName,
        maxTokens: modelRoute.maxTokens,
        callLlm: modelRoute.callLlm,
        label: modelRoute.label,
        usedFallback,
      },
      memoryCount,
      featureCost,
      lockedType,
      lockedCost,
      serviceType: lockedType,
      selectedServiceType: lockedType,
      usedServiceType: lockedType,
      ...(salesDecisionMeta ? { salesDecision: salesDecisionMeta } : {}),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    if (error instanceof TokenNotEnoughError) {
      return tokenNotEnoughResponse(error);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 },
    );
  }
}
