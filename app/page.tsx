"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CustomerPanel } from "@/components/chat/CustomerPanel";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  ModelSelector,
  type ModelServiceOption,
} from "@/components/chat/ModelSelector";
import {
  ModelSwitchToast,
  type ModelSwitchNotice,
} from "@/components/chat/ModelSwitchToast";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";
import {
  SERVICE_CONFIG,
  SERVICE_TOKEN_COST,
  WELCOME_MESSAGE,
} from "@/lib/constants";
import type { AuthUser, ChatMessage, ProductSuggestion } from "@/components/chat/types";

type ServiceType = keyof typeof SERVICE_TOKEN_COST;

const SERVICE_TYPE_STORAGE_KEY = "token_agent_service_type";
const CONVERSATION_STORAGE_KEY = "token_agent_conversation_id";

function makeWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: WELCOME_MESSAGE,
    createdAt: new Date().toISOString(),
    serviceType: "SALES",
    modelName: "销售客服",
    tokenCost: 0,
  };
}

function isServiceType(value: string | undefined | null): value is ServiceType {
  return Boolean(value && value in SERVICE_TOKEN_COST);
}

function readStoredServiceType(): ServiceType | null {
  try {
    const raw = localStorage.getItem(SERVICE_TYPE_STORAGE_KEY);
    return isServiceType(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredServiceType(type: ServiceType) {
  try {
    localStorage.setItem(SERVICE_TYPE_STORAGE_KEY, type);
  } catch {
    // ignore
  }
}

function readStoredConversationId(): string | null {
  try {
    return localStorage.getItem(CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(CONVERSATION_STORAGE_KEY, id);
    else localStorage.removeItem(CONVERSATION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function Home() {
  const { user, loading: authLoading, setUser, logout } = useAuth({
    requireAuth: true,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcomeMessage()]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [services, setServices] = useState<ModelServiceOption[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [activeServiceType, setActiveServiceType] = useState<ServiceType | null>(
    null,
  );
  const [switchNotice, setSwitchNotice] = useState<ModelSwitchNotice | null>(
    null,
  );
  const [switching, setSwitching] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const dismissSwitchNotice = useCallback(() => {
    setSwitchNotice(null);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    async function bootstrap() {
      try {
        const storedConvId = readStoredConversationId();

        const [listRes, currentRes, histRes] = await Promise.all([
          authFetch("/api/services"),
          authFetch(
            storedConvId
              ? `/api/services/select?conversationId=${encodeURIComponent(storedConvId)}`
              : "/api/services/select",
          ),
          storedConvId
            ? authFetch(`/api/conversations/${encodeURIComponent(storedConvId)}`)
            : Promise.resolve(null),
        ]);

        const listData: { services?: ModelServiceOption[] } = await listRes.json();
        const list = listData.services ?? [];
        setServices(list);

        if (histRes?.ok) {
          const histData: {
            conversation?: { id: string; serviceId?: string | null };
            messages?: ChatMessage[];
          } = await histRes.json();

          if (histData.conversation?.id) {
            setConversationId(histData.conversation.id);
            writeStoredConversationId(histData.conversation.id);
          }

          if (histData.messages && histData.messages.length > 0) {
            setMessages([
              makeWelcomeMessage(),
              ...histData.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt,
                // 历史只读消息自身快照字段，禁止用顶部当前选择覆盖
                serviceType: m.serviceType,
                modelName: m.modelName,
                tokenCost: m.tokenCost,
                tokenBalanceAfter: m.tokenBalanceAfter ?? null,
              })),
            ]);
          }
        }

        const currentData: { service?: ModelServiceOption | null } =
          await currentRes.json();

        const storedType = readStoredServiceType();
        const fromStored = storedType
          ? list.find((s) => s.type === storedType)
          : undefined;
        const initial =
          fromStored ??
          currentData.service ??
          list.find((s) => s.type === "SALES") ??
          list[0];

        if (initial?.id) {
          setActiveServiceId(initial.id);
          if (isServiceType(initial.type)) {
            setActiveServiceType(initial.type);
            writeStoredServiceType(initial.type);
          }
        }
      } catch {
        // ignore
      }
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages, isLoading]);

  function patchUser(partial: Partial<AuthUser>) {
    if (!user) return;
    setUser({ ...user, ...partial });
  }

  async function saveNickname(nickname: string): Promise<AuthUser> {
    const response = await authFetch("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname }),
    });
    const data: { user?: AuthUser; error?: string } = await response.json();
    if (!response.ok || !data.user) {
      throw new Error(data.error ?? "保存昵称失败");
    }
    setUser(data.user);
    return data.user;
  }

  async function handleModelChange(serviceId: string) {
    if (serviceId === activeServiceId || switching) return;

    const selected = services.find((s) => s.id === serviceId);
    if (!selected || !isServiceType(selected.type)) {
      setError("无效的模型通道。");
      return;
    }

    const nextType: ServiceType = selected.type;
    const nextCost: number = SERVICE_TOKEN_COST[nextType];

    setSwitching(true);
    setError(null);

    setActiveServiceId(serviceId);
    setActiveServiceType(nextType);
    writeStoredServiceType(nextType);
    console.log(`selectedServiceType=${nextType} tokenCost=${nextCost}`);

    setSwitchNotice({
      id: crypto.randomUUID(),
      type: nextType,
      name: selected.name,
      tokenCost: nextCost,
    });

    try {
      const response = await authFetch("/api/services/select", {
        method: "POST",
        body: JSON.stringify({
          serviceId,
          serviceType: nextType,
          conversationId: conversationId ?? undefined,
        }),
      });
      const data: {
        error?: string;
        service?: ModelServiceOption;
        conversation?: { id: string; serviceId: string | null };
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "切换模型失败");
      }

      if (data.conversation?.id) {
        setConversationId(data.conversation.id);
        writeStoredConversationId(data.conversation.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换模型失败");
    } finally {
      setSwitching(false);
    }
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || isLoading || !user) return;
    if (!activeServiceId || !activeServiceType) {
      setError("请先在顶部选择模型通道（SALES / LIGHT / STANDARD / PREMIUM）。");
      return;
    }

    const serviceType = activeServiceType;
    console.log(
      `selectedServiceType=${serviceType} (sending /api/chat)`,
    );

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          conversationId,
          serviceType,
          serviceId: activeServiceId,
        }),
      });

      const data: {
        reply?: string;
        conversationId?: string;
        messageId?: string;
        tokenBalance?: number;
        freeChatCount?: number;
        showProducts?: boolean;
        products?: ProductSuggestion[];
        service?: { id: string; type?: string; name?: string; tokenCost?: number };
        messageMeta?: {
          serviceType?: string;
          modelName?: string;
          tokenCost?: number;
          tokenBalanceAfter?: number;
        };
        serviceType?: string;
        lockedType?: string;
        usedServiceType?: string;
        selectedServiceType?: string;
        featureCost?: number;
        error?: string;
        message?: string;
        redirect?: string;
      } = await response.json();

      if (response.status === 400 && data.redirect === "/select-ai") {
        window.location.href = "/select-ai";
        return;
      }

      if (response.status === 402) {
        const insufficient: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            data.message ??
            "AI服务额度不足，请购买 Token 套餐后再使用高级功能。",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, insufficient]);
        setError(null);
        try {
          const packagesRes = await authFetch("/api/packages");
          const packagesData: { packages?: ProductSuggestion[] } =
            await packagesRes.json();
          if (packagesData.packages?.length) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last) return prev;
              return [
                ...prev.slice(0, -1),
                { ...last, products: packagesData.packages },
              ];
            });
          }
        } catch {
          // ignore
        }
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "请求失败，请稍后重试。");
      }

      const reply = data.reply ?? "";
      const meta = data.messageMeta;

      // 发送时已锁定的用户选择：永远优先于接口返回 / 默认模型 / 其他判断
      const lockedType = serviceType;
      const lockedCfg = SERVICE_CONFIG[lockedType];
      const apiType =
        meta?.serviceType ??
        data.usedServiceType ??
        data.serviceType ??
        data.lockedType;
      const apiCost =
        typeof meta?.tokenCost === "number"
          ? meta.tokenCost
          : typeof data.featureCost === "number"
            ? data.featureCost
            : undefined;

      console.log(
        `selectedServiceType=${lockedType} usedServiceType=${apiType ?? ""} tokenCost=${apiCost ?? ""}`,
      );

      if (!apiType || apiType !== lockedType) {
        console.warn(
          `[model-mismatch] selected=${lockedType} used=${apiType} → frontend locks to user selection`,
        );
      }

      // 展示快照：档位/名称/扣费锁定发送时选择；余额来自本条 messageMeta
      const snapServiceType = lockedType;
      const snapModelName = lockedCfg.name;
      const snapTokenCost =
        apiType === lockedType && typeof apiCost === "number"
          ? apiCost
          : lockedCfg.cost;
      const snapBalance =
        typeof meta?.tokenBalanceAfter === "number"
          ? meta.tokenBalanceAfter
          : typeof data.tokenBalance === "number"
            ? data.tokenBalance
            : null;

      const assistantMessage: ChatMessage = {
        id: data.messageId ?? crypto.randomUUID(),
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
        products: data.showProducts ? data.products : undefined,
        serviceType: snapServiceType,
        modelName: snapModelName,
        tokenCost: snapTokenCost,
        tokenBalanceAfter: snapBalance,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      const nextConvId = data.conversationId ?? conversationId;
      setConversationId(nextConvId);
      if (nextConvId) writeStoredConversationId(nextConvId);
      // 顶部选择始终保持用户已选，不被响应覆盖
      writeStoredServiceType(lockedType);
      if (data.service?.id && data.service.type === lockedType) {
        setActiveServiceId(data.service.id);
      }

      const nextPatch: Partial<AuthUser> = {};
      if (typeof data.tokenBalance === "number") {
        nextPatch.tokenBalance = data.tokenBalance;
      }
      if (typeof data.freeChatCount === "number") {
        nextPatch.freeChatCount = data.freeChatCount;
      }
      if (Object.keys(nextPatch).length > 0) {
        patchUser(nextPatch);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(input);
  }

  function handleBuy(_product: ProductSuggestion) {
    window.location.href = "/recharge";
  }

  const activeService = services.find((s) => s.id === activeServiceId);

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden bg-background">
        <motion.p
          className="text-sm text-muted"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          正在加载工作台...
        </motion.p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />

      <CustomerPanel
        user={user}
        messageCount={Math.max(0, messages.length - 1)}
        conversationId={conversationId}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onLogout={() => void logout()}
        saveNickname={saveNickname}
        onNicknameSaved={(next) => setUser(next)}
      />

      <section className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 border-b border-panel-border bg-panel/90 px-4 pb-4 pt-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="rounded-xl border border-panel-border px-3 py-2 text-xs text-muted lg:hidden"
              >
                客户
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-foreground md:text-lg">
                  Token AI 客服
                </h1>
                <p className="truncate text-xs text-muted">
                  余额 {user.tokenBalance.toLocaleString()} Token
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/select-ai"
                className="hidden rounded-xl border border-panel-border px-3 py-2 text-xs text-muted transition hover:text-foreground sm:inline-flex"
              >
                全部服务
              </Link>
              <Link
                href="/recharge"
                className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-[#042f2e] transition hover:brightness-110"
              >
                购买Token
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-xl border border-panel-border px-3 py-2 text-xs text-muted transition hover:text-foreground"
              >
                退出
              </button>
            </div>
          </div>

          <ModelSelector
            services={services}
            value={activeServiceId}
            activeType={activeServiceType}
            disabled={isLoading || switching}
            onChange={(id) => void handleModelChange(id)}
          />
        </header>

        <div className="relative min-h-0 flex-1">
          <ModelSwitchToast
            notice={switchNotice}
            onDismiss={dismissSwitchNotice}
          />

          <div
            ref={listRef}
            className="h-full overflow-y-auto overscroll-contain pt-5 pb-4 md:pt-6"
          >
            <div className="chat-thread flex flex-col gap-4 pb-2">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onBuy={handleBuy}
                  buyDisabled={isLoading}
                  userNickname={user.nickname}
                  userAvatar={user.avatar}
                />
              ))}

              <AnimatePresence>
                {isLoading && (
                  <TypingIndicator
                    serviceType={activeServiceType}
                    modelName={
                      activeServiceType
                        ? SERVICE_CONFIG[activeServiceType].name
                        : activeService?.name
                    }
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 shrink-0 border-t border-panel-border bg-panel/95 py-4 backdrop-blur">
          {error && (
            <p className="chat-thread mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="chat-thread flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                activeServiceType === "SALES"
                  ? "输入售前问题（免费）..."
                  : `向 ${activeServiceType ?? "AI"}（${activeService?.name ?? ""}）提问...`
              }
              disabled={isLoading}
              className="flex-1 rounded-2xl border border-panel-border bg-[#0a111b] px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent/50 disabled:opacity-50"
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              disabled={isLoading || !input.trim()}
              className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送
            </motion.button>
          </form>
        </div>
      </section>
    </div>
  );
}
