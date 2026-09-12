import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  extractAndSaveMemories,
  getUserMemories,
  selectImportantMemories,
  enforceMemoryQuota,
} from "@/lib/memory";
import {
  detectChatIntent,
} from "@/lib/intent";
import { listActiveModels, formatModelsForPrompt } from "@/lib/catalog";
import {
  buildAgentSystemPrompt,
  buildLockReminder,
  enforceTierReply,
  extractPromptModelIdentity,
  getLockedTokenCost,
  isChatServiceType,
  sanitizeHistoryForLockedType,
} from "@/lib/agent-router";
import { ACTION_CHAIN_CONTINUE_PROMPT } from "@/lib/action-chains";
import {
  resolveModelRouteByType,
  resolveOpenAIClientOptions,
} from "@/lib/model-router";
import { buildSalesTemplateReply } from "@/lib/sales-reply";
import { runSalesPipeline, type SalesPipelineResult } from "@/lib/sales-pipeline";
import { TOOL_USAGE_GUIDE } from "@/lib/tool-registry";
import { loadAgentRuntimeConfig, runAgentRuntime } from "@/lib/agent-runtime";
import { scopeTenantId } from "@/lib/tenant-context";
import { detectToolQueryMode } from "@/lib/tool-query-mode";
import {
  createAgentTrace,
  finishAgentTrace,
} from "@/lib/observability/agent-trace";
import { recordCaughtAgentError } from "@/lib/observability/error-trace";
import { startAgentRun, finishAgentRun } from "@/lib/agent-observability/runs";
import { createRequestId } from "@/lib/request-context";
import { publicErrorMessage } from "@/lib/error-handler";
import { inferMemoryUsage } from "@/lib/agent-observability/memory";
import {
  getLatestRecommendedPackage,
  recordSalesConversionShown,
} from "@/lib/sales-conversion-log";
import { getModelConfig, resolveEnableReasoning } from "@/lib/model-config";
import { getModelCapability } from "@/lib/model-capability";
import {
  extractFinalAssistantContent,
  takeShortTermMessages,
  chronologicalRecent,
  SHORT_TERM_FETCH_MAX_MESSAGES,
} from "@/lib/chat-memory";
import { extractAndUpdateCustomerMemory } from "@/lib/customer-memory";
import { resolveUserQuota, CONTEXT_HISTORY_ROUNDS } from "@/lib/user-quota";
import {
  assertUserRateLimit,
  RateLimitError,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  beginTokenTransaction,
  confirmTokenTransaction,
  failTokenTransaction,
  decrementFreeChatCount,
  TokenNotEnoughError,
  tokenNotEnoughResponse,
  type TokenTxHold,
} from "@/lib/tokens";
import { SERVICE_CONFIG } from "@/lib/constants";
import { createSseResponse } from "@/lib/chat-sse";
import { MessageRole, type AIServiceType } from "@/app/generated/prisma/enums";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function logDevAnalytics(input: {
  intent: string;
  tools: string;
  packageId: string;
  strategy: string;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(
    `[analytics]\nintent=${input.intent}\ntools=${input.tools}\npackage=${input.packageId}\nstrategy=${input.strategy}`,
  );
}

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
  let hold: TokenTxHold | null = null;
  let consumeCommitted = false;
  let handedToStream = false;
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
    const actionChainContinue = Boolean(body?.actionChainContinue);
    const meta =
      body?.meta && typeof body.meta === "object"
        ? (body.meta as { chainId?: unknown })
        : null;
    const chainId =
      typeof body?.chainId === "string"
        ? body.chainId
        : typeof meta?.chainId === "string"
          ? meta.chainId
          : undefined;
    const inActionChain = Boolean(actionChainContinue || chainId);

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

    const quota = await resolveUserQuota(user.id);
    try {
      await assertUserRateLimit(user.id, quota);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return rateLimitResponse(error);
      }
      throw error;
    }

    let conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, userId: user.id },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: SHORT_TERM_FETCH_MAX_MESSAGES,
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

    // intent 仅用于 SALES 商品卡/话术辅助；扣费与模型选择只认 lockedType
    const intent = detectChatIntent(message);
    let showProducts = false;
    let products: Array<{
      id: string;
      name: string;
      tokenAmount: number;
      price: number;
    }> = [];

    let tokenBalance = user.tokenBalance;
    let freeChatCount = user.freeChatCount;
    let featureCost = 0;

    if (lockedCost > 0) {
      try {
        hold = await beginTokenTransaction({
          userId: user.id,
          amount: lockedCost,
          reason: `chat:${lockedType}`,
          serviceId: service.id,
        });
        tokenBalance = hold.tokenBalance;
        freeChatCount = hold.freeChatCount;
        featureCost = lockedCost;
      } catch (error) {
        if (error instanceof TokenNotEnoughError) {
          const recommended = await getLatestRecommendedPackage(user.id);
          return tokenNotEnoughResponse(
            error,
            recommended
              ? { showProducts: true, products: [recommended] }
              : undefined,
          );
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
            orderBy: { createdAt: "desc" },
            take: SHORT_TERM_FETCH_MAX_MESSAGES,
          },
        },
      });
    }

    const recentMessages = chronologicalRecent(conversation.messages);

    const allMemories = await getUserMemories(user.id);
    const memories = selectImportantMemories(
      allMemories,
      quota.memoryPromptLimit,
    );

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.user,
        content: message,
      },
    });

    const clientOpts = modelRoute.callLlm
      ? resolveOpenAIClientOptions(modelRoute)
      : null;

    if (modelRoute.callLlm && !clientOpts && lockedType !== "SALES") {
      return NextResponse.json(
        {
          error: "缺少 DeepSeek API Key（环境变量 OPENAI_API_KEY）。",
        },
        { status: 500 },
      );
    }

    const requestId = createRequestId();
    const conversationIdForStream = conversation.id;
    const obsStarted = Date.now();
    const agentTrace = await createAgentTrace({
      userId: user.id,
      conversationId: conversation.id,
      serviceType: lockedType,
      intent,
      model: clientOpts?.model ?? modelRoute.model ?? null,
    });
    const agentRun = await startAgentRun({
      userId: user.id,
      serviceType: lockedType,
      modelType: clientOpts?.model ?? lockedType,
      intent,
      memoryInjectedCount: memories.length,
      memoryCategory: memories[0]?.category ?? null,
      requestId,
    });
    let streamLlmDuration = 0;
    let streamToolDuration = 0;
    handedToStream = true;
    return createSseResponse(async (emit) => {
      let reply = "";
      const packages: Array<{
        id: string;
        name: string;
        tokenAmount: number;
        price: number;
        description: string | null;
      }> = [];
      let memoryCount = memories.length;
      let usedFallback = false;
      let salesDecisionMeta: SalesPipelineResult["meta"] | undefined;
      let streamHold = hold;
      let streamCommitted = false;
      let streamBalance = tokenBalance;
      let streamFree = freeChatCount;
      let streamShowProducts = showProducts;
      let streamProducts = products;
      let streamToolNames: string[] = [];

      try {
        if (modelRoute.callLlm && !clientOpts) {
          const pipeline = await runSalesPipeline(message, {
            userId: user.id,
            tokenBalance: streamBalance,
            chatIntent: intent,
          });
          const models = await listActiveModels();
          usedFallback = true;
          salesDecisionMeta = pipeline.meta;
          streamShowProducts = pipeline.conversion.showProducts;
          streamProducts = pipeline.conversion.products;
          reply = buildSalesTemplateReply({
            message,
            intent,
            tokenBalance: streamBalance,
            packages,
            models,
            knowledgeText: pipeline.promptContext,
            salesDecision: pipeline.decision,
            packageRecommendation: pipeline.packageRecommend,
            finalDecision: pipeline.finalDecision,
            conversion: pipeline.conversion,
          });
          if (reply) emit("delta", { text: reply });
          try {
            await extractAndUpdateCustomerMemory({
              userId: user.id,
              userMessage: message,
              intent: pipeline.meta.intent,
              industry: pipeline.analysis.industry,
              needs: pipeline.analysis.needs,
              budget: pipeline.analysis.budget,
              recommendedModel: pipeline.meta.recommended,
            });
          } catch (memoryError) {
            console.error("Memory write failed:", memoryError);
          }
        } else if (modelRoute.callLlm && clientOpts) {
          usedFallback = clientOpts.usedFallback;

          let salesCatalog:
            | {
                packagesText: string;
                modelsText: string;
                intent?: string;
                showProducts?: boolean;
                pushStrategy?: string;
                conversionHint?: string;
                rechargePath?: string;
              }
            | undefined;
          let salesPipelineContext: string | undefined;
          let salesAnalysisForMemory: {
            industry: string | null;
            needs: string[];
            budget: string | null;
            recommended: string | null;
            intent: string | null;
          } | null = null;

          if (lockedType === "SALES") {
            const pipeline = await runSalesPipeline(message, {
              userId: user.id,
              tokenBalance: streamBalance,
              chatIntent: intent,
            });
            const models = await listActiveModels();
            streamShowProducts = pipeline.conversion.showProducts;
            streamProducts = pipeline.conversion.products;
            salesCatalog = {
              packagesText: "",
              modelsText: formatModelsForPrompt(models),
              intent,
              showProducts: streamShowProducts,
              pushStrategy: pipeline.conversion.pushStrategy,
              conversionHint: pipeline.conversion.promptHint,
              rechargePath: pipeline.conversion.rechargePath,
            };
            salesPipelineContext = pipeline.promptContext;
            salesDecisionMeta = pipeline.meta;
            salesAnalysisForMemory = {
              industry: pipeline.analysis.industry,
              needs: pipeline.analysis.needs,
              budget: pipeline.analysis.budget,
              recommended: pipeline.meta.recommended,
              intent: pipeline.meta.intent,
            };
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
          const enableReasoning = await resolveEnableReasoning(lockedType);
          const memoryRounds = CONTEXT_HISTORY_ROUNDS;
          const agentConfig = await loadAgentRuntimeConfig(
            lockedType,
            scopeTenantId(user.tenantId),
          );

          const systemPrompt = buildAgentSystemPrompt({
            serviceType: lockedType,
            memories,
            tokenBalance: streamBalance,
            salesCatalog,
            salesPipelineContext,
            modelConfig: modelConfigRow,
            modelCapability: modelCapabilityRow,
            configPrompt: agentConfig.systemPrompt,
          });

          const promptIdentity = extractPromptModelIdentity(systemPrompt);
          const expectedIdentity = `${lockedType} · ${lockedConfig.name}`;

          console.log(
            `[deepseek:pre] selectedServiceType=${lockedType} modelName=${lockedConfig.name} tokenCost=${lockedCost} promptIdentity=${promptIdentity}`,
          );

          if (promptIdentity !== expectedIdentity) {
            throw new Error("系统提示词身份与 selectedServiceType 不一致。");
          }

          if (
            !systemPrompt.includes(lockedType) ||
            !systemPrompt.includes(lockedConfig.name) ||
            systemPrompt.includes("默认 PREMIUM")
          ) {
            throw new Error("system prompt 未正确绑定当前 serviceType。");
          }

          const client = new OpenAI({
            apiKey: clientOpts.apiKey,
            baseURL: clientOpts.baseURL,
          });

          const rawWindow = takeShortTermMessages(
            recentMessages,
            CONTEXT_HISTORY_ROUNDS,
          );

          const historyWindow = rawWindow.map((item) => ({
            role: item.role as "user" | "assistant" | "system",
            content: sanitizeHistoryForLockedType(
              extractFinalAssistantContent({ content: item.content }),
              lockedType,
            ),
          }));

          const lockReminder = {
            role: "system" as const,
            content: buildLockReminder(lockedType),
          };

          const history = [
            {
              role: "system" as const,
              content: `${systemPrompt}

${TOOL_USAGE_GUIDE}${
                inActionChain
                  ? `

${ACTION_CHAIN_CONTINUE_PROMPT}${
                      chainId ? `\n当前 chainId：${chainId}` : ""
                    }`
                  : ""
              }`,
            },
            ...historyWindow,
            lockReminder,
            { role: "user" as const, content: message },
          ];

          console.log(
            `[llm] serviceType=${lockedType} enableReasoning=${enableReasoning} memoryRounds=${memoryRounds} historyMsgs=${historyWindow.length} memories=${memories.length}/${allMemories.length} stream=1 tools=1`,
          );

          const toolQueryMode = detectToolQueryMode(message);
          const agentOut = await runAgentRuntime({
            client,
            model: clientOpts.model,
            messages: history,
            maxTokens: clientOpts.maxTokens,
            temperature: clientOpts.temperature,
            thinkingEnabled: enableReasoning,
            ctx: { userId: user.id },
            toolQueryMode,
            traceId: agentTrace?.id ?? null,
            agentRunId: agentRun?.id ?? null,
            serviceType: lockedType,
            tenantId: scopeTenantId(user.tenantId),
            onDelta: (text) => emit("delta", { text }),
          });
          streamToolNames = agentOut.toolNames;
          streamLlmDuration = agentOut.llmDuration;
          streamToolDuration = agentOut.toolDuration;
          console.log(
            `[tools] queryMode=${toolQueryMode ? "1" : "0"} ${agentOut.toolNames.join(",") || "-"}`,
          );

          reply = enforceTierReply(
            lockedType,
            extractFinalAssistantContent({ content: agentOut.content }),
          );
          if (!reply.trim()) {
            throw new Error("AI 未返回内容。");
          }

          try {
            const savedMemories = await extractAndSaveMemories({
              client,
              userId: user.id,
              userMessage: message,
              assistantReply: reply,
              existingMemories: allMemories,
            });
            await enforceMemoryQuota(user.id, quota.maxMemories);
            memoryCount = memories.length + savedMemories.length;

            await extractAndUpdateCustomerMemory({
              userId: user.id,
              userMessage: message,
              intent: salesAnalysisForMemory?.intent ?? null,
              industry: salesAnalysisForMemory?.industry ?? null,
              needs: salesAnalysisForMemory?.needs ?? null,
              budget: salesAnalysisForMemory?.budget ?? null,
              recommendedModel: salesAnalysisForMemory?.recommended ?? null,
            });
          } catch (memoryError) {
            console.error("Memory write failed:", memoryError);
          }
        } else {
          const models = await listActiveModels();
          reply = buildSalesTemplateReply({
            message,
            intent,
            tokenBalance: streamBalance,
            packages,
            models,
          });
          if (reply) emit("delta", { text: reply });
        }

        const displayName = lockedConfig.name;

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
            conversationId: conversationIdForStream,
            role: MessageRole.assistant,
            content: reply,
            serviceType: lockedType,
            modelName: displayName,
            tokenCost: featureCost,
            tokenBalanceAfter: streamBalance,
          },
        });

        if (streamHold) {
          const confirmed = await confirmTokenTransaction(streamHold.id, {
            serviceId: service.id,
            reason: `chat:${lockedType}`,
          });
          streamBalance = confirmed.tokenBalance;
          streamFree = confirmed.freeChatCount;
          streamCommitted = true;
          consumeCommitted = true;
        }

        let conversionRecordId: string | null = null;
        if (
          lockedType === "SALES" &&
          streamShowProducts &&
          streamProducts[0]?.id
        ) {
          const recorded = await recordSalesConversionShown({
            userId: user.id,
            conversationId: conversationIdForStream,
            packageId: streamProducts[0].id,
            strategy: salesDecisionMeta?.pushStrategy ?? "SOFT",
          });
          conversionRecordId = recorded.id;
        }

        await finishAgentTrace(agentTrace?.id, {
          status: "SUCCESS",
          latency: Date.now() - obsStarted,
          model: clientOpts?.model ?? modelRoute.model ?? null,
          intent: salesDecisionMeta?.intent ?? intent,
          conversationId: conversationIdForStream,
        });

        void prisma.chatAnalytics
          .create({
            data: {
              userId: user.id,
              intent: String(salesDecisionMeta?.intent ?? intent),
            },
          })
          .catch((error) => {
            console.error("[chat-analytics]", error);
          });

        logDevAnalytics({
          intent: String(salesDecisionMeta?.intent ?? intent),
          tools: streamToolNames.join(",") || "-",
          packageId: streamProducts[0]?.id ?? "-",
          strategy: String(salesDecisionMeta?.pushStrategy ?? "-"),
        });

        const memoryUsage = inferMemoryUsage({
          injectedCount: memories.length,
          toolNames: streamToolNames,
          categories: memories.map((m) => String(m.category)),
        });
        await finishAgentRun(agentRun?.id, {
          success: true,
          intent: salesDecisionMeta?.intent ?? intent,
          modelType: clientOpts?.model ?? lockedType,
          toolsUsed: streamToolNames,
          duration: Date.now() - obsStarted,
          toolDuration: streamToolDuration,
          llmDuration: streamLlmDuration,
          memoryUsedCount: memoryUsage.memoryUsedCount,
          memoryCategory: memoryUsage.memoryCategory,
        });

        emit("done", {
          reply,
          conversationId: conversationIdForStream,
          messageId: assistantRecord.id,
          tokenBalance: streamBalance,
          freeChatCount: streamFree,
          intent,
          showProducts: streamShowProducts,
          products: streamProducts,
          conversionId: conversionRecordId,
          service: {
            id: service.id,
            name: displayName,
            type: lockedType,
            tokenCost: lockedCost,
          },
          messageMeta: {
            serviceType: lockedType,
            modelName: displayName,
            tokenCost: featureCost,
            tokenBalanceAfter: streamBalance,
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
        await finishAgentTrace(agentTrace?.id, {
          status: "FAILED",
          latency: Date.now() - obsStarted,
          model: clientOpts?.model ?? modelRoute.model ?? null,
          intent,
          conversationId: conversationIdForStream,
        });
        await recordCaughtAgentError(error, requestId);
        await finishAgentRun(agentRun?.id, {
          success: false,
          error,
          intent,
          modelType: clientOpts?.model ?? lockedType,
          toolsUsed: streamToolNames,
          duration: Date.now() - obsStarted,
          toolDuration: streamToolDuration,
          llmDuration: streamLlmDuration,
        });
        if (streamHold && !streamCommitted) {
          try {
            await failTokenTransaction(streamHold.id);
            streamCommitted = true;
            consumeCommitted = true;
          } catch (releaseError) {
            console.error("Token refund failed:", releaseError);
          }
        }
        throw error;
      }
    });
  } catch (error) {
    console.error("Chat API error:", error);
    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }
    if (error instanceof TokenNotEnoughError) {
      return tokenNotEnoughResponse(error);
    }
    return NextResponse.json(
      {
        error: publicErrorMessage(error),
      },
      { status: 500 },
    );
  } finally {
    if (hold && !consumeCommitted && !handedToStream) {
      try {
        await failTokenTransaction(hold.id);
      } catch (releaseError) {
        console.error("Token refund failed:", releaseError);
      }
    }
  }
}
