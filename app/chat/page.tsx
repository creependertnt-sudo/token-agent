"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";
import { consumeChatSse, type ChatSseDone } from "@/lib/chat-sse";
import {
  SERVICE_CONFIG,
  SERVICE_TOKEN_COST,
  SERVICE_UI_LABEL,
  MODEL_LABEL,
  WELCOME_MESSAGE,
  type ChatServiceType,
} from "@/lib/constants";
import type { AuthUser, ChatMessage, ProductSuggestion, SoftRecommend } from "@/components/chat/types";
import type { ModelServiceOption } from "@/components/chat/ModelSelector";
import { ChatHeader } from "@/components/chat/conversion/ChatHeader";
import { MessageList } from "@/components/chat/conversion/MessageList";
import { ThinkingBar } from "@/components/chat/conversion/ThinkingBar";
import { TokenBar, LowBalanceGuide } from "@/components/chat/conversion/TokenBar";
import { InputBar } from "@/components/chat/conversion/InputBar";
import { PurchaseModal } from "@/components/chat/conversion/PurchaseModal";
import { RenameChatModal } from "@/components/chat/conversion/RenameChatModal";
import { DeleteChatModal } from "@/components/chat/conversion/DeleteChatModal";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import {
  ModelSwitchIndicator,
  type ModelSwitchNotice,
} from "@/components/chat/ModelSwitchIndicator";
import { track } from "@/lib/track";
import {
  STREAM_LONG_SEGMENT_CHARS,
  STREAM_UI_INTERVAL_MS,
  createThrottledUpdater,
  nextStreamRevealEnd,
  sleep,
  streamTailPauseMs,
  thinkDelayMs,
} from "@/lib/chat-immersion";
import { appendSafeMarkdownStream, escapeDuringStream, unescapeAfterStream } from "@/lib/markdown-stream";
import { generateChatTitle } from "@/lib/chat-title";
import {
  getChatHistoryById,
  getLatestChatHistory,
  isProjectTopic,
  listChatHistory,
  makeResumeAssistantContent,
  removeChatHistory,
  renameChatHistory,
  setActiveHistoryId,
  setChatHistoryPinned,
  upsertChatHistory,
  type ChatHistoryEntry,
} from "@/lib/chat-history";
import { useChatShell } from "@/components/app-shell/ChatShellContext";
import {
  beginTtsPlayback,
  createVoiceTextBuffer,
  drainVoiceTextBuffer,
  enqueuePreparedTtsTexts,
  getRecordingPreviewBlob,
  getTtsQueueLength,
  isTtsPlaying,
  playTts,
  recordAudio,
  setTtsLifecycleHandlers,
  setTtsNaturalizeOptions,
  startRecording,
  stopLiveTranscriptPreview,
  startLiveTranscriptPreview,
  stopTts,
  transcribeBlobPreview,
  type VoiceStatus,
} from "@/app/chat/voice";
import { generateQuickActions, resetQuickActionPickMemory } from "@/lib/quick-actions";
import { buildSoftRecommend } from "@/lib/soft-recommend";
import {
  PROMPT_RECOMMEND_PACKAGE,
  PROMPT_TRY_BETA,
  getContextualStarterBundle,
  type QuickSendOptions,
  type StarterBundle,
} from "@/lib/quick-send";
import {
  buildActionChainStep2Content,
  chainActionsToQuickActions,
  resolveChainId,
  type ActionChain,
} from "@/lib/action-chains";
import {
  generateActionChain,
  shouldTriggerChain,
} from "@/lib/dynamic-chain";
import { polishChainStep2 } from "@/lib/chain-polish";
import { enhanceStarterBundle } from "@/lib/starter-enhance";
import styles from "@/components/chat/conversion/chat.module.css";

/** 第4-7：step2 AI 轻润色开关（失败自动 fallback） */
const ENABLE_CHAIN_STEP2_POLISH = true;

const SERVICE_TYPE_STORAGE_KEY = "token_agent_service_type";
const CONVERSATION_STORAGE_KEY = "token_agent_conversation_id";
const VOICE_MODE_STORAGE_KEY = "voice_mode_enabled";

/** 第 3 次有效对话后的留存钩子（仅插一次） */
const RETENTION_HOOK =
  "如果你想，我可以把刚才的内容整理成一版完整方案，也可以继续往下优化。你更想先做哪边？";

/** 项目类话题第 2 轮步骤引导 */
const PROJECT_STEP_HOOK =
  "这件事可以拆成几步来做，我可以一步步带你推进。";

function isServiceType(value: string | undefined | null): value is ChatServiceType {
  return Boolean(value && value in SERVICE_TOKEN_COST);
}

function readStoredServiceType(): ChatServiceType | null {
  try {
    const raw = localStorage.getItem(SERVICE_TYPE_STORAGE_KEY);
    return isServiceType(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredServiceType(type: ChatServiceType) {
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

function makeWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: WELCOME_MESSAGE,
    createdAt: new Date().toISOString(),
    serviceType: "SALES",
    modelName: MODEL_LABEL.SALES,
    tokenCost: 0,
    showQuickActions: false,
  };
}

function makeSystemTip(content: string): ChatMessage {
  return {
    id: `sys-${crypto.randomUUID()}`,
    role: "system",
    content,
    createdAt: new Date().toISOString(),
  };
}

function makeResumeAssistant(title: string | null): ChatMessage {
  return {
    id: `resume-${crypto.randomUUID()}`,
    role: "assistant",
    content: makeResumeAssistantContent(title),
    createdAt: new Date().toISOString(),
    serviceType: "SALES",
    modelName: MODEL_LABEL.SALES,
    tokenCost: 0,
    showQuickActions: false,
  };
}

function hasResumeTip(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      (m.content.includes("我可以接着帮你完善") ||
        m.content.includes("我可以继续帮你完善")),
  );
}

export default function ChatPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcomeMessage()]);
  const [starterSends, setStarterSends] = useState<StarterBundle>(() =>
    getContextualStarterBundle(),
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [services, setServices] = useState<ModelServiceOption[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [activeServiceType, setActiveServiceType] =
    useState<ChatServiceType | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendCount, setSendCount] = useState(0);
  const [switchNotice, setSwitchNotice] = useState<ModelSwitchNotice | null>(
    null,
  );
  const [packages, setPackages] = useState<ProductSuggestion[]>([]);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [purchaseProduct, setPurchaseProduct] =
    useState<ProductSuggestion | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseConfirming, setPurchaseConfirming] = useState(false);
  const [purchaseFromLowBalance, setPurchaseFromLowBalance] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameInitialTitle, setRenameInitialTitle] = useState("新对话");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [deleteChatTitle, setDeleteChatTitle] = useState<string | null>(null);
  /** 思考阶段：延迟未结束 / 首段未出 */
  const [showThinking, setShowThinking] = useState(false);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ChatHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryIdState] = useState<string | null>(
    null,
  );
  /** idle | leave(淡出) | enter(淡入) */
  const [surfaceMotion, setSurfaceMotion] = useState<
    "idle" | "leave" | "enter"
  >("idle");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isVoiceDraft, setIsVoiceDraft] = useState(false);
  const surfaceTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 贴底跟随；用户上滑后暂停，回到底部再恢复 */
  const stickToBottomRef = useRef(true);
  const scrollThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastStickScrollAtRef = useRef(0);
  /** 全文渲染后再播 TTS 的延后句柄（可被打断取消） */
  const ttsDeferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localHistoryIdRef = useRef<string | null>(null);
  const historyHydratedRef = useRef(false);
  /** 切换进入的会话：未发送前不写 chatList，避免改消息/置顶 */
  const historySelectReadonlyRef = useRef(false);
  /** 本轮发送待在 assistant 完成后再 touch updatedAt */
  const pendingHistoryTouchRef = useRef(false);
  const projectHookShownRef = useRef(false);
  /** 本会话是否已出过软推荐（避免连刷） */
  const softRecommendShownRef = useRef(false);
  /** 「查看置顶」循环索引 */
  const pinnedFocusIndexRef = useRef(-1);
  const pinnedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Starter AI 润色世代：避免快速新建对话时旧请求覆盖 */
  const starterEnhanceGenRef = useRef(0);
  /** 推进链 step2 延时句柄 */
  const actionChainTimerRef = useRef<number | null>(null);
  /** 录音中 / 识别中（局部 UI，不参与 TTS 判定） */
  const voiceRecordingRef = useRef(false);
  const voiceFinishingRef = useRef(false);
  const voicePreviewGenRef = useRef(0);
  const voicePreviewBusyRef = useRef(false);
  const livePreviewStopRef = useRef<(() => void) | null>(null);
  /** 最终 STT 原文：仅未改动时视为纯语音发送 */
  const voiceSttTextRef = useRef("");
  /** 录音预览文字（未锁定） */
  const voicePreviewTextRef = useRef("");
  const sendMessageRef = useRef<
    (
      raw: string,
      opts?: {
        serviceType?: ChatServiceType;
        serviceId?: string;
        isVoiceInput?: boolean;
        skipUserAppend?: boolean;
        baseMessages?: ChatMessage[];
        actionChainContinue?: boolean;
        chainId?: string;
      },
    ) => Promise<void>
  >(async () => {});
  const { registerChatShell } = useChatShell();

  useEffect(() => {
    return () => {
      if (surfaceTimerRef.current != null) {
        window.clearTimeout(surfaceTimerRef.current);
      }
      if (actionChainTimerRef.current != null) {
        window.clearTimeout(actionChainTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      setVoiceModeEnabled(localStorage.getItem(VOICE_MODE_STORAGE_KEY) === "true");
    } catch {
      setVoiceModeEnabled(false);
    }
  }, []);

  /** 先展示规则 Starter，再轻量 AI 润色 1~2 条文案（失败保留原文） */
  function applyStarterBundle(base?: StarterBundle) {
    const bundle = base ?? getContextualStarterBundle();
    setStarterSends(bundle);
    const gen = ++starterEnhanceGenRef.current;
    void enhanceStarterBundle(bundle).then((next) => {
      if (gen !== starterEnhanceGenRef.current) return;
      setStarterSends(next);
    });
  }

  useEffect(() => {
    applyStarterBundle(starterSends);
    // 仅挂载时润色首屏；后续由新建对话触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTtsLifecycleHandlers({
      onSpeaking: () => setVoiceStatus("speaking"),
      onIdle: () => {
        setVoiceStatus((prev) =>
          prev === "speaking" || prev === "thinking" ? "idle" : prev,
        );
      },
    });
    return () => {
      setTtsLifecycleHandlers({});
      stopTts();
      stopLiveTranscriptPreview();
      livePreviewStopRef.current = null;
      voicePreviewGenRef.current += 1;
    };
  }, []);

  function setVoiceMode(enabled: boolean) {
    setVoiceModeEnabled(enabled);
    try {
      localStorage.setItem(VOICE_MODE_STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      // ignore
    }
    if (!enabled) {
      if (ttsDeferTimerRef.current != null) {
        clearTimeout(ttsDeferTimerRef.current);
        ttsDeferTimerRef.current = null;
      }
      stopTts();
      stopLiveTranscriptPreview();
      livePreviewStopRef.current = null;
      setIsVoiceDraft(false);
      setVoiceStatus("idle");
    }
  }

  function clearVoiceDraft() {
    stopLiveTranscriptPreview();
    livePreviewStopRef.current = null;
    voicePreviewGenRef.current += 1;
    voiceSttTextRef.current = "";
    voicePreviewTextRef.current = "";
    setInput("");
    setIsVoiceDraft(false);
    setVoiceStatus("idle");
  }

  function handleInputChange(next: string) {
    setInput(next);
    // 手改文案 → 退出语音草稿，本轮发送不再播 TTS
    if (isVoiceDraft) setIsVoiceDraft(false);
  }

  /** 录音中预览：只更新输入框，不锁定 STT 原文 */
  function applyVoicePreviewText(text: string) {
    voicePreviewTextRef.current = text;
    setInput(text);
    setIsVoiceDraft(true);
  }

  /** 松手最终 STT：锁定原文，供发送时判断是否纯语音 */
  function commitVoiceSttText(text: string) {
    const trimmed = text.trim();
    voiceSttTextRef.current = trimmed;
    voicePreviewTextRef.current = trimmed;
    setInput(trimmed);
    setIsVoiceDraft(Boolean(trimmed));
  }

  async function runVoicePreview() {
    if (!voiceRecordingRef.current || voicePreviewBusyRef.current) return;
    const blob = getRecordingPreviewBlob();
    if (!blob || blob.size < 1600) return;

    const gen = voicePreviewGenRef.current;
    voicePreviewBusyRef.current = true;
    try {
      const text = await transcribeBlobPreview(blob);
      if (gen !== voicePreviewGenRef.current) return;
      if (!voiceRecordingRef.current) return;
      if (text.trim()) applyVoicePreviewText(text);
    } finally {
      voicePreviewBusyRef.current = false;
    }
  }

  const patchUser = useCallback(
    (partial: Partial<AuthUser>) => {
      if (!user) return;
      setUser({ ...user, ...partial });
    },
    [setUser, user],
  );

  useEffect(() => {
    if (authLoading || !user) return;

    async function bootstrap() {
      try {
        const recent = listChatHistory();
        setHistoryEntries(recent);

        const latest = getLatestChatHistory();
        let restoredFromLocal = false;
        let preferredServiceType: ChatServiceType | null = null;

        if (latest && latest.messages.some((m) => m.role === "user")) {
          restoredFromLocal = true;
          localHistoryIdRef.current = latest.id;
          setActiveHistoryId(latest.id);
          setActiveHistoryIdState(latest.id);
          setChatTitle(latest.title);
          setSendCount(latest.sendCount);
          setConversationId(latest.conversationId);
          if (latest.conversationId) {
            writeStoredConversationId(latest.conversationId);
          }
          if (latest.serviceType && isServiceType(latest.serviceType)) {
            preferredServiceType = latest.serviceType;
            writeStoredServiceType(latest.serviceType);
          }
          projectHookShownRef.current = latest.sendCount >= 2;
          softRecommendShownRef.current = latest.messages.some((m) =>
            Boolean(m.softRecommend),
          );

          let restored = latest.messages;
          // 仅当历史里还没有承接句时插入；写入历史后下次刷新不再重复
          if (!hasResumeTip(restored)) {
            restored = [...restored, makeResumeAssistant(latest.title)];
          }
          setMessages(restored);
        }

        const storedConvId =
          latest?.conversationId ?? readStoredConversationId();
        const [listRes, currentRes, histRes, packagesRes] = await Promise.all([
          authFetch("/api/services"),
          authFetch(
            storedConvId
              ? `/api/services/select?conversationId=${encodeURIComponent(storedConvId)}`
              : "/api/services/select",
          ),
          !restoredFromLocal && storedConvId
            ? authFetch(`/api/conversations/${encodeURIComponent(storedConvId)}`)
            : Promise.resolve(null),
          authFetch("/api/packages"),
        ]);

        const listData: { services?: ModelServiceOption[] } = await listRes.json();
        const list = listData.services ?? [];
        setServices(list);

        if (packagesRes.ok) {
          const pkgData: { packages?: ProductSuggestion[] } =
            await packagesRes.json();
          setPackages(pkgData.packages ?? []);
        }

        if (!restoredFromLocal && histRes?.ok) {
          const histData: {
            conversation?: { id: string };
            messages?: ChatMessage[];
          } = await histRes.json();
          if (histData.conversation?.id) {
            setConversationId(histData.conversation.id);
            writeStoredConversationId(histData.conversation.id);
          }
          if (histData.messages && histData.messages.length > 0) {
            const hydrated = histData.messages.map((m, idx, arr) => {
              if (m.role !== "assistant" || m.serviceType === "SALES") {
                return { ...m, showQuickActions: false, quickActions: [] };
              }
              if (m.quickActions?.length) {
                return {
                  ...m,
                  showQuickActions: true,
                  quickActions: m.quickActions,
                };
              }
              const prevUser = [...arr.slice(0, idx)]
                .reverse()
                .find((x) => x.role === "user");
              const userCount = arr
                .slice(0, idx + 1)
                .filter((x) => x.role === "user").length;
              const quickActions = generateQuickActions({
                lastUserMessage: prevUser?.content ?? "",
                lastAssistantMessage: m.content,
                messageCount: Math.max(1, userCount),
                serviceType: m.serviceType,
              });
              return {
                ...m,
                showQuickActions: quickActions.length > 0,
                quickActions,
              };
            });
            setMessages([makeWelcomeMessage(), ...hydrated]);
          }
        }

        const currentData: { service?: ModelServiceOption | null } =
          await currentRes.json();
        const storedType = preferredServiceType ?? readStoredServiceType();
        const fromStored = storedType
          ? list.find((s) => s.type === storedType)
          : undefined;
        const initial =
          fromStored ??
          (latest?.serviceId
            ? list.find((s) => s.id === latest.serviceId)
            : undefined) ??
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
      } finally {
        historyHydratedRef.current = true;
      }
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!historyHydratedRef.current) return;
    // 仅切换对话：不修改 chatList
    if (historySelectReadonlyRef.current) return;
    if (isLoading || showThinking) return;
    if (!messages.some((m) => m.role === "user")) return;

    if (!localHistoryIdRef.current) {
      localHistoryIdRef.current = crypto.randomUUID();
    }

    // 仅在本轮 assistant 回复完成后刷新 updatedAt；静默同步不改排序
    const touchUpdatedAt = pendingHistoryTouchRef.current;
    if (touchUpdatedAt) pendingHistoryTouchRef.current = false;

    const list = upsertChatHistory(
      {
        id: localHistoryIdRef.current,
        title: chatTitle ?? "新对话",
        messages,
        conversationId,
        serviceType: activeServiceType,
        serviceId: activeServiceId,
        sendCount,
      },
      { touchUpdatedAt },
    );
    setHistoryEntries(list);
    setActiveHistoryIdState(localHistoryIdRef.current);
  }, [
    messages,
    chatTitle,
    conversationId,
    activeServiceType,
    activeServiceId,
    sendCount,
    isLoading,
    showThinking,
  ]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 80;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 贴底跟随：最多 100ms 一次；不跟 ThinkingBar 联动，避免与收尾 setState 同帧叠滚动
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (!listRef.current) return;

    const SCROLL_MS = 100;
    const doScroll = () => {
      if (!stickToBottomRef.current) return;
      const node = listRef.current;
      if (!node) return;
      lastStickScrollAtRef.current = Date.now();
      // 直接写 scrollTop，避免 behavior:"smooth" 叠动画造成抖动
      node.scrollTop = node.scrollHeight;
    };

    const elapsed = Date.now() - lastStickScrollAtRef.current;
    if (elapsed >= SCROLL_MS) {
      doScroll();
      return;
    }

    if (scrollThrottleTimerRef.current != null) return;
    scrollThrottleTimerRef.current = setTimeout(() => {
      scrollThrottleTimerRef.current = null;
      doScroll();
    }, SCROLL_MS - elapsed);
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (scrollThrottleTimerRef.current != null) {
        clearTimeout(scrollThrottleTimerRef.current);
        scrollThrottleTimerRef.current = null;
      }
    };
  }, []);

  async function handleModelChange(serviceId: string) {
    if (serviceId === activeServiceId || isLoading) return;
    const selected = services.find((s) => s.id === serviceId);
    if (!selected || !isServiceType(selected.type)) {
      setError("无效的对话模式。");
      return;
    }

    const nextType = selected.type;
    setActiveServiceId(serviceId);
    setActiveServiceType(nextType);
    writeStoredServiceType(nextType);
    setError(null);
    track("switch_model", { type: nextType });

    const cost = SERVICE_CONFIG[nextType].cost;
    // 单状态覆盖：快速切换不排队、不叠加
    setSwitchNotice({
      id: crypto.randomUUID(),
      type: nextType,
      name: SERVICE_UI_LABEL[nextType],
      tokenCost: cost,
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
        conversation?: { id: string };
      } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "切换模式失败");
      if (data.conversation?.id) {
        setConversationId(data.conversation.id);
        writeStoredConversationId(data.conversation.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换模式失败");
    }
  }

  function switchToStandard() {
    const std = services.find((s) => s.type === "STANDARD");
    if (!std) {
      setError("Beta 暂不可用。");
      return;
    }
    setActiveServiceId(std.id);
    setActiveServiceType("STANDARD");
    writeStoredServiceType("STANDARD");
    track("switch_model", { type: "STANDARD" });
    void authFetch("/api/services/select", {
      method: "POST",
      body: JSON.stringify({
        serviceId: std.id,
        serviceType: "STANDARD",
        conversationId: conversationId ?? undefined,
      }),
    });
    handleQuickSend(PROMPT_TRY_BETA, {
      serviceType: "STANDARD",
      serviceId: std.id,
    });
  }

  async function openPackages() {
    if (
      user &&
      activeServiceType &&
      activeServiceType !== "SALES" &&
      user.tokenBalance < SERVICE_CONFIG[activeServiceType].cost
    ) {
      setPurchaseFromLowBalance(true);
    }
    setPackagesOpen(true);
    if (packages.length > 0) return;
    try {
      const res = await authFetch("/api/packages");
      const data: { packages?: ProductSuggestion[] } = await res.json();
      if (res.ok) setPackages(data.packages ?? []);
    } catch {
      // ignore
    }
  }

  function recommendPackage() {
    const sales = services.find((s) => s.type === "SALES");
    if (!sales) {
      setError("Guide 暂不可用。");
      return;
    }
    // 切到 Guide 身份后一键开聊，不跳转、不填输入框
    if (activeServiceId !== sales.id) {
      setActiveServiceId(sales.id);
      setActiveServiceType("SALES");
      writeStoredServiceType("SALES");
      track("switch_model", { type: "SALES" });
      void authFetch("/api/services/select", {
        method: "POST",
        body: JSON.stringify({
          serviceId: sales.id,
          serviceType: "SALES",
          conversationId: conversationId ?? undefined,
        }),
      });
    }
    handleQuickSend(PROMPT_RECOMMEND_PACKAGE, {
      serviceType: "SALES",
      serviceId: sales.id,
    });
  }

  function buyPrimaryPackage() {
    const first =
      packages[0] ??
      messages.flatMap((m) => m.products ?? []).find(Boolean);
    if (first) {
      openPurchase(first);
      return;
    }
    void openPackages();
  }

  function bumpSurfaceEnter() {
    if (surfaceTimerRef.current != null) {
      window.clearTimeout(surfaceTimerRef.current);
    }
    setSurfaceMotion("enter");
    surfaceTimerRef.current = window.setTimeout(() => {
      setSurfaceMotion("idle");
      surfaceTimerRef.current = null;
    }, 120);
  }

  function loadHistoryEntry(entry: ChatHistoryEntry) {
    if (isLoading || purchaseConfirming) return;
    if (entry.id === localHistoryIdRef.current) return;

    // 只切换当前会话，不改 chatList / updatedAt
    historySelectReadonlyRef.current = true;
    pendingHistoryTouchRef.current = false;
    pinnedFocusIndexRef.current = -1;
    localHistoryIdRef.current = entry.id;
    setActiveHistoryId(entry.id);
    setActiveHistoryIdState(entry.id);
    setChatTitle(entry.title);
    setSendCount(entry.sendCount);
    setConversationId(entry.conversationId);
    if (entry.conversationId) writeStoredConversationId(entry.conversationId);
    if (entry.serviceType && isServiceType(entry.serviceType)) {
      writeStoredServiceType(entry.serviceType);
      setActiveServiceType(entry.serviceType);
      const svc =
        services.find((s) => s.id === entry.serviceId) ??
        services.find((s) => s.type === entry.serviceType);
      if (svc) setActiveServiceId(svc.id);
    }
    projectHookShownRef.current = entry.sendCount >= 2;
    softRecommendShownRef.current = entry.messages.some((m) =>
      Boolean(m.softRecommend),
    );
    setError(null);
    setPackagesOpen(false);
    stickToBottomRef.current = true;

    let restored = entry.messages.length
      ? entry.messages
      : [makeWelcomeMessage()];
    if (
      restored.some((m) => m.role === "user") &&
      !hasResumeTip(restored)
    ) {
      restored = [...restored, makeResumeAssistant(entry.title)];
    }
    setMessages(restored);
    setHistoryEntries(listChatHistory());
    bumpSurfaceEnter();
  }

  function applyFreshChat(opts?: { clearedTip?: boolean }) {
    localHistoryIdRef.current = null;
    historySelectReadonlyRef.current = false;
    pendingHistoryTouchRef.current = false;
    pinnedFocusIndexRef.current = -1;
    setActiveHistoryId(null);
    setActiveHistoryIdState(null);
    setChatTitle("新对话");
    setSendCount(0);
    setConversationId(null);
    writeStoredConversationId(null);
    setError(null);
    setPackagesOpen(false);
    setPurchaseOpen(false);
    setPurchaseProduct(null);
    setInput("");
    projectHookShownRef.current = false;
    softRecommendShownRef.current = false;
    if (actionChainTimerRef.current != null) {
      window.clearTimeout(actionChainTimerRef.current);
      actionChainTimerRef.current = null;
    }
    resetQuickActionPickMemory();
    applyStarterBundle();
    stickToBottomRef.current = true;
    setHistoryEntries(listChatHistory());
    if (opts?.clearedTip) {
      setMessages([
        makeWelcomeMessage(),
        makeSystemTip("已经帮你重新开始了一个新对话"),
      ]);
    } else {
      setMessages([makeWelcomeMessage()]);
    }
    bumpSurfaceEnter();
  }

  function startNewChat() {
    if (isLoading || purchaseConfirming) return;
    if (surfaceTimerRef.current != null) {
      window.clearTimeout(surfaceTimerRef.current);
    }
    setSurfaceMotion("leave");
    surfaceTimerRef.current = window.setTimeout(() => {
      applyFreshChat();
      surfaceTimerRef.current = null;
    }, 120);
  }

  function clearCurrentChat() {
    if (isLoading || purchaseConfirming) return;
    const currentId = localHistoryIdRef.current;
    if (currentId) {
      setHistoryEntries(removeChatHistory(currentId));
    }
    if (surfaceTimerRef.current != null) {
      window.clearTimeout(surfaceTimerRef.current);
    }
    setSurfaceMotion("leave");
    surfaceTimerRef.current = window.setTimeout(() => {
      applyFreshChat({ clearedTip: true });
      surfaceTimerRef.current = null;
    }, 120);
  }

  function openTopUp() {
    setPurchaseFromLowBalance(true);
    buyPrimaryPackage();
  }

  /**
   * 统一一键发送：点击 = 直接继续对话。
   * - 调用 sendMessage，不填入输入框
   * - 可带 suggestServiceType：先切模型再发送（转化入口）
   * - 发送后隐藏来源消息的推荐按钮
   */
  function hideQuickActions(messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, usedActions: true } : m,
      ),
    );
  }

  /**
   * 第4-6：运行动态推进链。
   * step1 立即出现 → 400ms 后 step2（可选润色）+ actions（最多 3）。
   */
  function runDynamicChain(chain: ActionChain, userText: string) {
    if (isLoading || purchaseConfirming || !user) return;
    if (!activeServiceId || !activeServiceType) {
      setError("请先选择对话模式。");
      return;
    }

    if (actionChainTimerRef.current != null) {
      window.clearTimeout(actionChainTimerRef.current);
      actionChainTimerRef.current = null;
    }

    setInput("");
    setIsVoiceDraft(false);
    voiceSttTextRef.current = "";
    voicePreviewTextRef.current = "";
    stopVoicePlayback();
    setError(null);

    const starterText = userText.trim();
    let titleNow = chatTitle;
    if (!titleNow) {
      titleNow = generateChatTitle(starterText);
      setChatTitle(titleNow);
    }
    if (!localHistoryIdRef.current) {
      localHistoryIdRef.current = crypto.randomUUID();
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: starterText,
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    const step1Message: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: chain.step1,
      createdAt: new Date().toISOString(),
      streaming: false,
      thinking: false,
      serviceType: activeServiceType,
      modelName: MODEL_LABEL[activeServiceType],
      showQuickActions: false,
      quickActions: [],
      chainMeta: { chainId: chain.id, step: 1 },
    };

    const base = messages.filter((m) => m.id !== "welcome");
    const nextMessages = [...base, userMessage, step1Message];
    setMessages(nextMessages);

    const nextSendCount = sendCount + 1;
    setSendCount(nextSendCount);
    stickToBottomRef.current = true;
    historySelectReadonlyRef.current = false;
    pendingHistoryTouchRef.current = true;

    const list = upsertChatHistory(
      {
        id: localHistoryIdRef.current,
        title: titleNow,
        messages: nextMessages,
        conversationId,
        serviceType: activeServiceType,
        serviceId: activeServiceId,
        sendCount: nextSendCount,
      },
      { touchUpdatedAt: true },
    );
    setHistoryEntries(list);
    setActiveHistoryIdState(localHistoryIdRef.current);

    const chainSnapshot: ActionChain = {
      id: chain.id,
      step1: chain.step1,
      step2: chain.step2,
      actions: [...chain.actions],
    };

    actionChainTimerRef.current = window.setTimeout(() => {
      actionChainTimerRef.current = null;
      void (async () => {
        const polishedStep2 = await polishChainStep2(
          chainSnapshot.step2,
          ENABLE_CHAIN_STEP2_POLISH,
        );
        const finalChain: ActionChain = {
          ...chainSnapshot,
          step2: polishedStep2,
        };
        const quickActions = chainActionsToQuickActions(
          finalChain.actions,
          finalChain.id,
        );
        const step2Content = buildActionChainStep2Content(finalChain);
        setMessages((prev) => {
          const patched = prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: step2Content,
                  showQuickActions: quickActions.length > 0,
                  quickActions,
                  usedActions: false,
                  chainMeta: { chainId: finalChain.id, step: 2 },
                }
              : m,
          );
          if (localHistoryIdRef.current) {
            upsertChatHistory(
              {
                id: localHistoryIdRef.current,
                title: titleNow,
                messages: patched,
                conversationId,
                serviceType: activeServiceType,
                serviceId: activeServiceId,
                sendCount: nextSendCount,
              },
              { touchUpdatedAt: false },
            );
          }
          return patched;
        });
      })();
    }, 400);
  }

  /** Starter / 自由输入 → 按文案动态生成推进链 */
  function handleStarterClick(text: string, preferredChainId?: string | null) {
    const dynamic = generateActionChain(text);
    const chain: ActionChain = {
      id: preferredChainId || dynamic.id,
      step1: dynamic.step1,
      step2: dynamic.step2,
      actions: dynamic.actions,
    };
    runDynamicChain(chain, text);
  }

  function handleQuickSend(text: string, opts?: QuickSendOptions) {
    const trimmed = text.trim();
    if (!trimmed || isLoading || purchaseConfirming) return;

    // 第4-5：Starter 点击 → 动态推进链（跟进动作走正常 sendMessage）
    if (!opts?.actionChainContinue && (opts?.chainId || opts?.starterId)) {
      const preferredId = resolveChainId({
        chainId: opts?.chainId,
        starterId: opts?.starterId,
        category: opts?.starterCategory,
      });
      handleStarterClick(trimmed, preferredId);
      return;
    }

    // 禁止把推荐文案填进 textarea；直接开聊
    setInput("");
    setIsVoiceDraft(false);
    voiceSttTextRef.current = "";
    voicePreviewTextRef.current = "";
    stopVoicePlayback();

    let nextType = opts?.serviceType;
    let nextId = opts?.serviceId;

    if (nextType && !nextId) {
      const target = services.find((s) => s.type === nextType);
      if (target) nextId = target.id;
    }

    if (
      nextType &&
      nextId &&
      (nextType === "LIGHT" ||
        nextType === "STANDARD" ||
        nextType === "PREMIUM" ||
        nextType === "SALES")
    ) {
      if (activeServiceId !== nextId) {
        setActiveServiceId(nextId);
        setActiveServiceType(nextType);
        writeStoredServiceType(nextType);
        track("switch_model", { type: nextType, source: "quick_send" });
        void authFetch("/api/services/select", {
          method: "POST",
          body: JSON.stringify({
            serviceId: nextId,
            serviceType: nextType,
            conversationId: conversationId ?? undefined,
          }),
        });
      }
    }

    void sendMessageRef.current?.(trimmed, {
      serviceType: nextType,
      serviceId: nextId,
      isVoiceInput: false,
      actionChainContinue: opts?.actionChainContinue,
      chainId: opts?.chainId,
    });

    if (opts?.messageId) {
      hideQuickActions(opts.messageId);
    }
  }

  function handleSoftRecommendAction(tip: SoftRecommend) {
    const prompt = tip.actionPrompt?.trim();
    if (!prompt) return;

    const suggest = tip.suggestServiceType;
    if (suggest === "STANDARD" || suggest === "PREMIUM" || suggest === "LIGHT") {
      const target = services.find((s) => s.type === suggest);
      if (target) {
        setActiveServiceId(target.id);
        setActiveServiceType(suggest);
        writeStoredServiceType(suggest);
        track("switch_model", { type: suggest, source: "soft_recommend" });
        void authFetch("/api/services/select", {
          method: "POST",
          body: JSON.stringify({
            serviceId: target.id,
            serviceType: suggest,
            conversationId: conversationId ?? undefined,
          }),
        });
        handleQuickSend(prompt, {
          serviceType: suggest,
          serviceId: target.id,
        });
        return;
      }
    }

    handleQuickSend(prompt);
  }

  function handleMessageAction(
    messageId: string,
    action: "pin" | "copy" | "regenerate",
  ) {
    if (action === "pin") {
      historySelectReadonlyRef.current = false;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, pinned: !m.pinned } : m,
        ),
      );
      return;
    }

    if (action === "copy") {
      const msg = messages.find((m) => m.id === messageId);
      const text = msg?.content?.trim();
      if (!text) return;
      void navigator.clipboard?.writeText(text).catch(() => {
        setError("复制失败，请重试");
      });
      return;
    }

    if (action === "regenerate") {
      if (isLoading || purchaseConfirming) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0 || messages[idx]?.role !== "assistant") return;

      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === "user") {
          userIdx = i;
          break;
        }
      }
      if (userIdx < 0) return;

      const userMsg = messages[userIdx]!;
      const assistantMsg = messages[idx]!;
      const baseMessages = messages.slice(0, idx);
      const snapType =
        typeof assistantMsg.serviceType === "string" &&
        isServiceType(assistantMsg.serviceType)
          ? assistantMsg.serviceType
          : undefined;
      const snapId =
        snapType &&
        (services.find((s) => s.id === activeServiceId)?.type === snapType
          ? activeServiceId
          : services.find((s) => s.type === snapType)?.id);

      void sendMessageRef.current?.(userMsg.content, {
        serviceType: snapType,
        serviceId: snapId ?? undefined,
        skipUserAppend: true,
        baseMessages,
        isVoiceInput: false,
      });
    }
  }

  function openRenameModal(chatId: string) {
    const entry =
      getChatHistoryById(chatId) ??
      historyEntries.find((e) => e.id === chatId) ??
      null;
    const title =
      entry?.title ??
      (chatId === localHistoryIdRef.current || chatId === activeHistoryId
        ? chatTitle
        : null) ??
      "新对话";
    setRenameChatId(chatId);
    setRenameInitialTitle(title);
    setRenameOpen(true);
  }

  function closeRenameModal() {
    setRenameOpen(false);
    setRenameChatId(null);
  }

  function saveRenameModal(chatId: string, nextTitle: string) {
    const title = nextTitle.replace(/\s+/g, " ").trim().slice(0, 32);
    if (!title) return;

    const stored = getChatHistoryById(chatId);
    const isCurrent =
      localHistoryIdRef.current === chatId || activeHistoryId === chatId;

    if (stored) {
      setHistoryEntries(renameChatHistory(chatId, title));
    } else if (isCurrent) {
      renameChatTitle(title);
      closeRenameModal();
      return;
    }

    if (isCurrent) setChatTitle(title);
    closeRenameModal();
  }

  function toggleChatPinned(chatId: string) {
    const entry =
      getChatHistoryById(chatId) ??
      historyEntries.find((e) => e.id === chatId);
    if (!entry) return;
    const list = setChatHistoryPinned(chatId, !entry.pinned);
    setHistoryEntries(list);
  }

  function scrollToPinnedMessage(messageId: string) {
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (!el) return;

    stickToBottomRef.current = false;
    el.scrollIntoView({ block: "center", behavior: "auto" });

    el.classList.remove(styles.pinnedFlash);
    requestAnimationFrame(() => {
      el.classList.add(styles.pinnedFlash);
    });
    if (pinnedFlashTimerRef.current != null) {
      clearTimeout(pinnedFlashTimerRef.current);
    }
    pinnedFlashTimerRef.current = setTimeout(() => {
      el.classList.remove(styles.pinnedFlash);
      pinnedFlashTimerRef.current = null;
    }, 600);
  }

  function focusPinnedMessages() {
    const pinnedIds = messages
      .filter((m) => m.pinned && m.role !== "system")
      .map((m) => m.id);
    if (pinnedIds.length === 0) return;

    const next =
      (pinnedFocusIndexRef.current + 1 + pinnedIds.length) % pinnedIds.length;
    pinnedFocusIndexRef.current = next;
    scrollToPinnedMessage(pinnedIds[next]!);
  }

  function openDeleteModal(chatId: string) {
    const entry =
      getChatHistoryById(chatId) ??
      historyEntries.find((e) => e.id === chatId) ??
      null;
    setDeleteChatId(chatId);
    setDeleteChatTitle(
      entry?.title ??
        (chatId === localHistoryIdRef.current ? chatTitle : null),
    );
    setDeleteOpen(true);
  }

  function closeDeleteModal() {
    setDeleteOpen(false);
    setDeleteChatId(null);
    setDeleteChatTitle(null);
  }

  function confirmDeleteChat(chatId: string) {
    if (isLoading || purchaseConfirming) return;
    const wasCurrent =
      localHistoryIdRef.current === chatId || activeHistoryId === chatId;
    const list = removeChatHistory(chatId);
    setHistoryEntries(list);
    closeDeleteModal();

    if (!wasCurrent) return;

    // 当前对话已删：切到最近一个，避免迷失
    localHistoryIdRef.current = null;
    pendingHistoryTouchRef.current = false;
    const latest = list[0];
    if (latest) {
      loadHistoryEntry(latest);
      return;
    }
    applyFreshChat({ clearedTip: true });
  }

  function stopVoicePlayback() {
    if (ttsDeferTimerRef.current != null) {
      clearTimeout(ttsDeferTimerRef.current);
      ttsDeferTimerRef.current = null;
    }
    stopTts();
    if (!voiceRecordingRef.current && !voiceFinishingRef.current) {
      setVoiceStatus((prev) =>
        prev === "speaking" || prev === "thinking" ? "idle" : prev,
      );
    }
  }

  async function beginVoiceHold() {
    if (!voiceModeEnabled) return;
    if (
      isLoading ||
      purchaseConfirming ||
      voiceFinishingRef.current ||
      voiceRecordingRef.current
    ) {
      return;
    }
    if (voiceStatus === "recognizing" || voiceStatus === "thinking") return;

    if (ttsDeferTimerRef.current != null) {
      clearTimeout(ttsDeferTimerRef.current);
      ttsDeferTimerRef.current = null;
    }
    stopTts();
    stopLiveTranscriptPreview();
    livePreviewStopRef.current = null;
    voiceRecordingRef.current = true;
    voicePreviewGenRef.current += 1;
    const previewGen = voicePreviewGenRef.current;
    voiceSttTextRef.current = "";
    voicePreviewTextRef.current = "";
    setInput("");
    setIsVoiceDraft(true);
    setVoiceStatus("recording");
    setError(null);

    // 优先浏览器实时听写；不可用时回退分段 STT 预览
    const stopLive = startLiveTranscriptPreview({
      onUpdate: (text) => {
        if (!voiceRecordingRef.current) return;
        if (previewGen !== voicePreviewGenRef.current) return;
        applyVoicePreviewText(text);
      },
    });
    livePreviewStopRef.current = stopLive;

    try {
      await startRecording({
        onMaxDuration: () => {
          void endVoiceHold();
        },
        onChunk: () => {
          // 无实时听写时，用分段 STT 兜底预览
          if (livePreviewStopRef.current) return;
          void runVoicePreview();
        },
      });
    } catch (err) {
      voiceRecordingRef.current = false;
      stopLiveTranscriptPreview();
      livePreviewStopRef.current = null;
      setIsVoiceDraft(false);
      setInput("");
      setVoiceStatus("idle");
      setError(err instanceof Error ? err.message : "无法开始录音");
    }
  }

  async function endVoiceHold() {
    if (!voiceRecordingRef.current || voiceFinishingRef.current) return;
    voiceRecordingRef.current = false;
    voiceFinishingRef.current = true;
    voicePreviewGenRef.current += 1;
    stopLiveTranscriptPreview();
    livePreviewStopRef.current = null;
    setVoiceStatus("recognizing");

    try {
      const text = await recordAudio();
      if (!text.trim()) {
        // 无最终 STT：保留预览，但不视为可播 TTS 的纯语音
        const preview = voicePreviewTextRef.current.trim();
        setIsVoiceDraft(Boolean(preview));
        voiceSttTextRef.current = "";
        setVoiceStatus("idle");
        return;
      }
      commitVoiceSttText(text);
      setVoiceStatus("idle");
    } catch (err) {
      setVoiceStatus("idle");
      setError(err instanceof Error ? err.message : "语音识别失败");
      // 预览稿仍保留；未锁定 STT → 发送不会播 TTS
      const preview = voicePreviewTextRef.current.trim();
      setIsVoiceDraft(Boolean(preview));
      voiceSttTextRef.current = "";
    } finally {
      voiceFinishingRef.current = false;
    }
  }

  useEffect(() => {
    registerChatShell({
      historyEntries,
      activeHistoryId,
      openHistory: loadHistoryEntry,
      startNewChat,
      clearCurrentChat,
      openTopUp,
      toggleChatPinned,
      openRenameChat: openRenameModal,
      openDeleteChat: openDeleteModal,
    });
    return () => registerChatShell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    historyEntries,
    activeHistoryId,
    isLoading,
    purchaseConfirming,
    services,
    registerChatShell,
  ]);

  function renameChatTitle(nextTitle: string) {
    const title = nextTitle.replace(/\s+/g, " ").trim().slice(0, 32);
    if (!title) return;
    setChatTitle(title);
    if (!localHistoryIdRef.current) {
      localHistoryIdRef.current = crypto.randomUUID();
    }
    historySelectReadonlyRef.current = false;
    // 无用户消息时先不入库；有对话则立刻同步标题（不刷新 updatedAt）
    if (!messages.some((m) => m.role === "user")) return;
    const list = upsertChatHistory(
      {
        id: localHistoryIdRef.current,
        title,
        messages,
        conversationId,
        serviceType: activeServiceType,
        serviceId: activeServiceId,
        sendCount,
      },
      { touchUpdatedAt: false },
    );
    setHistoryEntries(list);
    setActiveHistoryIdState(localHistoryIdRef.current);
  }

  function openPurchase(product: ProductSuggestion) {
    track("click_package", { packageId: product.id });
    track("click_buy");
    setPurchaseProduct(product);
    setPurchaseOpen(true);
    setError(null);
  }

  function closePurchase() {
    if (purchaseConfirming) return;
    setPurchaseOpen(false);
    setPurchaseProduct(null);
  }

  async function confirmPurchase() {
    if (!purchaseProduct || purchaseConfirming) return;
    setPurchaseConfirming(true);
    setError(null);

    const started = Date.now();
    try {
      const createRes = await authFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          packageId: purchaseProduct.id,
          conversionId: purchaseProduct.conversionId ?? undefined,
        }),
      });
      const createData: { order?: { id: string }; error?: string } =
        await createRes.json();
      if (!createRes.ok || !createData.order?.id) {
        throw new Error(createData.error ?? "创建订单失败");
      }

      const payRes = await authFetch(
        `/api/orders/${encodeURIComponent(createData.order.id)}/pay`,
        { method: "POST" },
      );
      const payData: {
        error?: string;
        user?: { tokenBalance?: number; freeChatCount?: number };
        order?: { tokenAmount?: number };
      } = await payRes.json();
      if (!payRes.ok) {
        throw new Error(payData.error ?? "支付失败");
      }

      const elapsed = Date.now() - started;
      const wait = Math.max(0, 520 - elapsed);
      if (wait > 0) {
        await new Promise((r) => window.setTimeout(r, wait));
      }

      const credited =
        typeof payData.order?.tokenAmount === "number"
          ? payData.order.tokenAmount
          : purchaseProduct.tokenAmount;

      track("buy_success", {
        amount: purchaseProduct.price,
        tokens: credited,
        packageId: purchaseProduct.id,
      });

      if (typeof payData.user?.tokenBalance === "number") {
        patchUser({
          tokenBalance: payData.user.tokenBalance,
          ...(typeof payData.user.freeChatCount === "number"
            ? { freeChatCount: payData.user.freeChatCount }
            : {}),
        });
      } else {
        patchUser({
          tokenBalance: (user?.tokenBalance ?? 0) + credited,
        });
      }

      setPackagesOpen(false);
      setPurchaseOpen(false);
      setPurchaseProduct(null);

      // 一条提示即可，避免购买前后重复念叨
      const tip = "现在可以继续刚才的对话了 👇";
      setMessages((prev) => {
        const cleaned = prev.filter(
          (m) =>
            !(
              m.role === "system" &&
              (m.content.includes("补充后可以继续") ||
                m.content.includes("刚才的问题可以继续") ||
                m.content.includes("现在可以继续刚才的对话") ||
                m.content.includes("已补充"))
            ),
        );
        return [...cleaned, makeSystemTip(tip)];
      });
      setPurchaseFromLowBalance(false);

      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "购买失败");
    } finally {
      setPurchaseConfirming(false);
    }
  }

  async function sendMessage(
    rawMessage: string,
    opts?: {
      serviceType?: ChatServiceType;
      serviceId?: string;
      /** 麦克风确认发送 → 回复后播 TTS */
      isVoiceInput?: boolean;
      /** 重新生成：不追加 user，基于 baseMessages 只挂 assistant */
      skipUserAppend?: boolean;
      baseMessages?: ChatMessage[];
      /** 推进链建议动作跟进 */
      actionChainContinue?: boolean;
      /** 推进链 id（后端围绕当前任务继续） */
      chainId?: string;
    },
  ) {
    const message = rawMessage.trim();
    if (!message || isLoading || !user) return;

    const serviceType = opts?.serviceType ?? activeServiceType;
    const serviceId = opts?.serviceId ?? activeServiceId;
    /** 本轮闭包内锁定：是否播报回复 TTS（勿被后续状态改写） */
    const shouldSpeak = Boolean(opts?.isVoiceInput);
    const skipUserAppend = Boolean(opts?.skipUserAppend);
    const baseMessages = opts?.baseMessages ?? messages;
    const actionChainContinue = Boolean(opts?.actionChainContinue);
    const chainId = opts?.chainId;

    if (!serviceId || !serviceType) {
      setError("请先选择对话模式。");
      return;
    }

    // 第4-5：新对话自由输入 → 可触发动态推进链（跟进动作 / 重生成除外）
    if (!actionChainContinue && !skipUserAppend) {
      const realCount = baseMessages.filter((m) => m.id !== "welcome").length;
      if (realCount === 0 && shouldTriggerChain(message)) {
        handleStarterClick(message, null);
        return;
      }
    }

    // 新一轮发送：允许打断上一轮播报
    if (ttsDeferTimerRef.current != null) {
      clearTimeout(ttsDeferTimerRef.current);
      ttsDeferTimerRef.current = null;
    }
    stopTts();
    setVoiceStatus((s) =>
      s === "speaking" || s === "thinking" ? "idle" : s,
    );

    const cost = SERVICE_CONFIG[serviceType].cost;

    if (cost > 0 && user.tokenBalance < cost) {
      setPackagesOpen(true);
      setPurchaseFromLowBalance(true);
      // LowBalanceGuide 已说明，避免再插一条同义 system tip
      return;
    }

    track("send_message", {
      modelType: serviceType,
      cost,
      regenerate: skipUserAppend,
    });

    // 默认标题：用户第一句话前 12 字（仅首次）
    let titleNow = chatTitle;
    if (!titleNow) {
      titleNow = generateChatTitle(message);
      setChatTitle(titleNow);
    }
    if (!localHistoryIdRef.current) {
      localHistoryIdRef.current = crypto.randomUUID();
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      thinking: true,
      serviceType,
      modelName: MODEL_LABEL[serviceType],
    };

    const nextMessages = skipUserAppend
      ? [...baseMessages, placeholder]
      : [...baseMessages, userMessage, placeholder];
    // 扣费说明已在输入区 costHint / 模型切换提示里出现，不再插 system tip

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);
    setShowThinking(true);
    if (shouldSpeak) setVoiceStatus("thinking");
    const nextSendCount = sendCount + 1;
    setSendCount(nextSendCount);
    stickToBottomRef.current = true;

    // 发送成功：写入 chatList 并刷新 updatedAt；回复完成后再 touch 一次
    historySelectReadonlyRef.current = false;
    pendingHistoryTouchRef.current = true;
    const list = upsertChatHistory(
      {
        id: localHistoryIdRef.current,
        title: titleNow,
        messages: nextMessages,
        conversationId,
        serviceType,
        serviceId,
        sendCount: nextSendCount,
      },
      { touchUpdatedAt: true },
    );
    setHistoryEntries(list);
    setActiveHistoryIdState(localHistoryIdRef.current);

    const thinkStartedAt = Date.now();
    const thinkMs = thinkDelayMs();
    /** SSE 全文缓冲（done 兜底） */
    let streamBuffer = "";
    /** 已通过 Markdown 安全门、可展示 */
    let displayText = "";
    /** 半截 Markdown，等成对后再并入 display */
    let pendingText = "";
    let thinkGateTimer: ReturnType<typeof setTimeout> | null = null;
    /** 首段立刻出字；之后走 100ms 节流 */
    let firstChunkPending = true;
    /** 已揭示到的长度（相对 displayText） */
    let shownLen = 0;
    /** B-3：短 delta 攒够再挂节流，减少 setState */
    let shortDeltaAcc = 0;
    /** ThinkingBar 只切 start→end 一次 */
    let thinkingEnded = false;

    const endThinking = () => {
      if (thinkingEnded) return;
      thinkingEnded = true;
      setShowThinking(false);
    };

    const clearTtsDefer = () => {
      if (ttsDeferTimerRef.current != null) {
        clearTimeout(ttsDeferTimerRef.current);
        ttsDeferTimerRef.current = null;
      }
    };

    /**
     * 仅在完整回复落盘后播 TTS；流式中绝不触发。
     * 用闭包内 shouldSpeak，避免被后续状态改写。
     */
    const startReplyTts = (finalText: string) => {
      if (!shouldSpeak) return;
      clearTtsDefer();
      const text = finalText.trim();
      if (!text) {
        setVoiceStatus("idle");
        return;
      }
      ttsDeferTimerRef.current = setTimeout(() => {
        ttsDeferTimerRef.current = null;
        setTtsNaturalizeOptions({ serviceType });
        beginTtsPlayback();
        const parts = drainVoiceTextBuffer(
          createVoiceTextBuffer(),
          text,
          true,
        );
        if (parts.length > 0) {
          enqueuePreparedTtsTexts(parts);
        } else {
          void playTts(text);
        }
      }, 50);
    };

    const withReplyHooks = (reply: string) => {
      let trimmed = reply.trim();
      if (!trimmed) return trimmed;

      const topicTitle = chatTitle ?? generateChatTitle(message);
      if (
        nextSendCount === 2 &&
        !projectHookShownRef.current &&
        isProjectTopic(topicTitle, [...messages, userMessage])
      ) {
        if (!trimmed.includes("一步步带你推进")) {
          trimmed = `${trimmed}\n\n${PROJECT_STEP_HOOK}`;
        }
        projectHookShownRef.current = true;
      }

      if (nextSendCount === 3) {
        if (
          !(
            trimmed.includes("完整方案") &&
            (trimmed.includes("往下优化") || trimmed.includes("往哪个方向"))
          )
        ) {
          trimmed = `${trimmed}\n\n${RETENTION_HOOK}`;
        }
      }

      return trimmed;
    };

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        // 流式场景：只替换最后一条，旧消息保持同一引用
        if (last?.id === assistantId) {
          return [...prev.slice(0, -1), { ...last, ...patch }];
        }
        return prev.map((m) =>
          m.id === assistantId ? { ...m, ...patch } : m,
        );
      });
    };

    const paintStreamContent = (nextShown: number) => {
      if (!displayText || nextShown <= 0) return;
      shownLen = Math.min(nextShown, displayText.length);
      endThinking();
      // 流式写入：escape 后入库，避免误入 Markdown 解析；UI 侧再还原成可读纯文本
      const visibleRaw = displayText.slice(0, shownLen);
      patchAssistant({
        content: escapeDuringStream(visibleRaw),
        thinking: false,
        streaming: true,
        serviceType,
        modelName: MODEL_LABEL[serviceType],
      });
    };

    /** 中段节流：长文每次只推进一段，短文跟满可展示缓冲 */
    const paintStreamPartial = () => {
      if (!displayText) return;
      const waitThink = thinkMs - (Date.now() - thinkStartedAt);
      if (waitThink > 0) {
        if (thinkGateTimer == null) {
          thinkGateTimer = setTimeout(() => {
            thinkGateTimer = null;
            paintStreamPartial();
          }, waitThink);
        }
        return;
      }

      let next = displayText.length;
      if (displayText.length > STREAM_LONG_SEGMENT_CHARS) {
        next = nextStreamRevealEnd(displayText, shownLen);
      }
      paintStreamContent(next);
      // 缓冲仍超前：继续节流追赶，形成分段节奏
      if (shownLen < displayText.length) {
        streamUi.schedule();
      }
    };

    const streamUi = createThrottledUpdater(
      STREAM_UI_INTERVAL_MS,
      paintStreamPartial,
    );

    /** 首段：过思考门后立刻出字（不等 100ms） */
    const paintFirstChunkNow = () => {
      if (!displayText || !firstChunkPending) return;
      const waitThink = thinkMs - (Date.now() - thinkStartedAt);
      if (waitThink > 0) {
        if (thinkGateTimer == null) {
          thinkGateTimer = setTimeout(() => {
            thinkGateTimer = null;
            paintFirstChunkNow();
          }, waitThink);
        }
        return;
      }
      firstChunkPending = false;
      const firstEnd =
        displayText.length > STREAM_LONG_SEGMENT_CHARS
          ? nextStreamRevealEnd(displayText, 0)
          : displayText.length;
      paintStreamContent(firstEnd);
      if (shownLen < displayText.length) {
        streamUi.schedule();
      }
    };

    const clearStreamUiTimers = () => {
      streamUi.cancel();
      if (thinkGateTimer != null) {
        clearTimeout(thinkGateTimer);
        thinkGateTimer = null;
      }
    };

    const applyDone = async (data: ChatSseDone) => {
      const meta = data.messageMeta;
      const snapTokenCost =
        typeof meta?.tokenCost === "number"
          ? meta.tokenCost
          : typeof data.featureCost === "number"
            ? data.featureCost
            : SERVICE_CONFIG[serviceType].cost;
      const snapBalance =
        typeof meta?.tokenBalanceAfter === "number"
          ? meta.tokenBalanceAfter
          : typeof data.tokenBalance === "number"
            ? data.tokenBalance
            : null;

      const memoryHint =
        typeof data.memoryCount === "number" && data.memoryCount > 0
          ? "我会结合你刚才提到的方向，优先给更落地的建议。"
          : null;

      const products = data.showProducts
        ? (data.products ?? []).map((p) => ({
            ...p,
            conversionId: data.conversionId,
          }))
        : undefined;

      const nextConvId = data.conversationId ?? conversationId;
      setConversationId(nextConvId);
      if (nextConvId) writeStoredConversationId(nextConvId);
      writeStoredServiceType(serviceType);

      const nextPatch: Partial<AuthUser> = {};
      if (typeof data.tokenBalance === "number") {
        nextPatch.tokenBalance = data.tokenBalance;
      }
      if (typeof data.freeChatCount === "number") {
        nextPatch.freeChatCount = data.freeChatCount;
      }
      if (Object.keys(nextPatch).length > 0) patchUser(nextPatch);

      const fullReply = unescapeAfterStream((data.reply ?? "").trim());
      const hooked = withReplyHooks(fullReply);

      clearStreamUiTimers();
      // 收尾前若仍在思考窗口内，等满再落文
      const remainingThink = Math.max(
        0,
        thinkMs - (Date.now() - thinkStartedAt),
      );
      if (remainingThink > 0) await sleep(remainingThink);
      // 结尾停顿：不要立刻 finalize，留一口气
      await sleep(streamTailPauseMs());

      endThinking();
      // 收尾：一次性 unescape 全文落盘，清空 pending；此后才允许 ChatMarkdown
      displayText = hooked;
      pendingText = "";
      shownLen = displayText.length;
      const quickActions = generateQuickActions({
        lastUserMessage: message,
        lastAssistantMessage: hooked,
        messageCount: nextSendCount,
        serviceType,
      });
      const softRecommend = buildSoftRecommend({
        sendCount: nextSendCount,
        serviceType,
        userMessage: message,
        assistantReply: hooked,
        alreadyShown: softRecommendShownRef.current,
      });
      if (softRecommend) softRecommendShownRef.current = true;
      patchAssistant({
        content: displayText,
        streaming: false,
        thinking: false,
        // 软推荐场景不挂购买商品卡，避免像推销
        products: softRecommend ? undefined : products,
        serviceType,
        modelName: MODEL_LABEL[serviceType],
        tokenCost: snapTokenCost,
        tokenBalanceAfter: snapBalance,
        showQuickActions: quickActions.length > 0,
        quickActions,
        softRecommend: softRecommend ?? null,
        memoryHint,
      });
      startReplyTts(hooked);
    };

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({
          message,
          conversationId,
          serviceType,
          serviceId,
          actionChainContinue,
          chainId: chainId || undefined,
          meta:
            chainId || actionChainContinue
              ? {
                  chainId: chainId || undefined,
                  step: actionChainContinue ? 3 : undefined,
                }
              : undefined,
        }),
      });

      if (response.status === 400) {
        const data: { redirect?: string; error?: string } = await response.json();
        if (data.redirect === "/select-ai") {
          window.location.href = "/select-ai";
          return;
        }
        throw new Error(data.error ?? "请求失败");
      }

      if (response.status === 402) {
        const data: {
          message?: string;
          showProducts?: boolean;
          products?: ProductSuggestion[];
        } = await response.json();
        endThinking();
        patchAssistant({
          content: data.message ?? "补充后可以继续刚才这个问题",
          streaming: false,
          thinking: false,
          products:
            data.showProducts && data.products?.length
              ? data.products
              : packages.length
                ? packages
                : undefined,
          showQuickActions: false,
        });
        setPackagesOpen(true);
        setPurchaseFromLowBalance(true);
        return;
      }

      if (!response.ok) {
        const data: { error?: string; message?: string } = await response.json();
        throw new Error(data.error ?? data.message ?? "请求失败");
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        let streamError: string | null = null;
        const doneBox: { payload: ChatSseDone | null } = { payload: null };
        await consumeChatSse(response, {
          // placeholder 已是 thinking，避免重复 setState
          onThinking: () => undefined,
          onDelta: (text) => {
            streamBuffer += text;
            const next = appendSafeMarkdownStream(
              displayText,
              pendingText,
              text,
            );
            displayText = next.displayText;
            pendingText = next.pendingText;
            // 仅当有可展示增量时才刷 UI（半截 Markdown 继续等）
            if (!displayText) return;
            if (firstChunkPending) {
              paintFirstChunkNow();
              shortDeltaAcc = 0;
              return;
            }
            // B-3：极短 delta 先攒字，减少 setState；节流仍 100ms
            shortDeltaAcc += text.length;
            if (shortDeltaAcc < 3) return;
            shortDeltaAcc = 0;
            streamUi.schedule();
          },
          onDone: (payload) => {
            doneBox.payload = payload;
          },
          onError: (msg) => {
            streamError = msg;
          },
        });
        if (streamError) throw new Error(streamError);
        if (doneBox.payload) {
          const payload = doneBox.payload;
          const reply = (payload.reply ?? "").trim() || streamBuffer.trim();
          await applyDone({ ...payload, reply });
        }
        return;
      }

      const data = (await response.json()) as ChatSseDone;
      await applyDone(data);
    } catch (err) {
      clearStreamUiTimers();
      clearTtsDefer();
      endThinking();
      pendingHistoryTouchRef.current = false;
      setError(err instanceof Error ? err.message : "未知错误");
      setMessages((prev) =>
        prev.filter((m) => {
          if (m.id === assistantId) return false;
          if (!skipUserAppend && m.id === userMessage.id) return false;
          return true;
        }),
      );
      if (shouldSpeak) setVoiceStatus("idle");
    } finally {
      clearStreamUiTimers();
      endThinking();
      setIsLoading(false);
      // 不在此 stopTts / clearTtsDefer：TTS 由 applyDone 后延后触发
      if (!shouldSpeak) {
        setVoiceStatus((s) => (s === "thinking" ? "idle" : s));
      } else if (
        ttsDeferTimerRef.current == null &&
        !isTtsPlaying() &&
        getTtsQueueLength() === 0
      ) {
        // applyDone 未排上播报（空回复等）
        setVoiceStatus((s) => (s === "thinking" ? "idle" : s));
      }
    }
  }

  sendMessageRef.current = sendMessage;

  if (authLoading || !user) {
    return (
      <div className={styles.chatPage}>
        <AmbientBackground />
        <div className={`${styles.chatContent} items-center justify-center text-sm text-muted`}>
          加载中…
        </div>
      </div>
    );
  }

  const cost =
    activeServiceType && activeServiceType !== "SALES"
      ? SERVICE_CONFIG[activeServiceType].cost
      : 0;
  const blockedByBalance = cost > 0 && user.tokenBalance < cost;

  return (
    <div className={styles.chatPage}>
      <AmbientBackground />

      <div className={styles.chatContent}>
        <ChatHeader
          user={user}
          services={services}
          activeServiceId={activeServiceId}
          activeServiceType={activeServiceType}
          chatTitle={chatTitle}
          historyEntries={historyEntries}
          activeHistoryId={activeHistoryId}
          disabled={isLoading}
          onSelectService={(id) => void handleModelChange(id)}
          onSelectHistory={loadHistoryEntry}
          onTitleChange={renameChatTitle}
          onThemeSaved={(theme) => patchUser({ theme })}
          pinnedCount={messages.filter((m) => m.pinned).length}
          onViewPinned={focusPinnedMessages}
        />

        <ModelSwitchIndicator
          notice={switchNotice}
          onDismiss={() => setSwitchNotice(null)}
        />

        <div className={styles.main}>
          <div
            className={styles.chatSurface}
            data-motion={surfaceMotion}
          >
          <MessageList
            messages={messages}
            user={user}
            listRef={listRef}
            busy={isLoading}
            onQuickSend={handleQuickSend}
            onBuy={openPurchase}
            onRecommendPackage={recommendPackage}
            onBuyPrimary={buyPrimaryPackage}
            onSwitchToStandard={switchToStandard}
            onSoftRecommendAction={handleSoftRecommendAction}
            onMessageAction={handleMessageAction}
            starterSends={
              // 空对话 → 分层起点（主/次/探索），点击走 handleQuickSend → sendMessage
              !messages.some((m) => m.role === "user")
                ? starterSends
                : undefined
            }
          />
          </div>

          <ThinkingBar active={showThinking} />

          {error ? <p className={styles.error}>{error}</p> : null}

          {!blockedByBalance ? (
            <TokenBar
              tokenBalance={user.tokenBalance}
              serviceType={activeServiceType}
              forceShow={sendCount >= 3}
            />
          ) : null}

          <LowBalanceGuide
            lowBalance={blockedByBalance}
            packages={packages}
            packagesOpen={packagesOpen}
            busy={isLoading || purchaseConfirming}
            onOpenPackages={() => void openPackages()}
            onBuy={openPurchase}
            onRecommend={recommendPackage}
          />

          <InputBar
            value={input}
            disabled={isLoading || purchaseConfirming}
            activeServiceType={activeServiceType}
            textareaRef={textareaRef}
            voiceStatus={voiceStatus}
            voiceModeEnabled={voiceModeEnabled}
            isVoiceDraft={isVoiceDraft}
            onChange={handleInputChange}
            onSubmit={() => {
              const sent = input.trim();
              // 仍是语音草稿且未手改 → 本轮必须播报
              const isVoiceInput = isVoiceDraft && Boolean(sent);
              setIsVoiceDraft(false);
              voiceSttTextRef.current = "";
              voicePreviewTextRef.current = "";
              void sendMessage(sent, { isVoiceInput });
            }}
            onInputFocus={stopVoicePlayback}
            onVoiceHoldStart={() => void beginVoiceHold()}
            onVoiceHoldEnd={() => void endVoiceHold()}
            onVoiceModeChange={setVoiceMode}
            onClearVoiceDraft={clearVoiceDraft}
          />
        </div>
      </div>

      <PurchaseModal
        open={purchaseOpen}
        product={purchaseProduct}
        confirming={purchaseConfirming}
        onConfirm={() => void confirmPurchase()}
        onCancel={closePurchase}
      />

      <RenameChatModal
        open={renameOpen}
        chatId={renameChatId}
        initialTitle={renameInitialTitle}
        onSave={saveRenameModal}
        onCancel={closeRenameModal}
      />

      <DeleteChatModal
        open={deleteOpen}
        chatId={deleteChatId}
        chatTitle={deleteChatTitle}
        onConfirm={confirmDeleteChat}
        onCancel={closeDeleteModal}
      />
    </div>
  );
}
