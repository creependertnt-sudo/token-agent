"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";
import {
  MODEL_LABEL,
  SERVICE_UI_HINT,
  type ChatServiceType,
} from "@/lib/constants";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import styles from "./select-ai.module.css";

type AIServiceItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  tokenCost: number;
  sortOrder: number;
};

function isChatServiceType(type: string): type is ChatServiceType {
  return type in MODEL_LABEL;
}

/** 仅展示层文案，不改变 service.type / id / 选择逻辑 */
const SERVICE_PRESENTATION: Record<
  ChatServiceType,
  {
    icon: string;
    blurb: string;
    scenario: string;
  }
> = {
  SALES: {
    icon: "💬",
    blurb: "帮助了解套餐、推荐 Token 方案",
    scenario: "售前咨询、选型问诊、套餐对比",
  },
  LIGHT: {
    icon: "⚡",
    blurb: "快速问答，适合日常任务",
    scenario: "短问答、翻译改写、轻量查询",
  },
  STANDARD: {
    icon: "🧠",
    blurb: "更强分析能力，适合复杂问题",
    scenario: "业务分析、方案梳理、多轮讨论",
  },
  PREMIUM: {
    icon: "🚀",
    blurb: "高质量推理，处理复杂任务",
    scenario: "深度推理、长上下文、高难度任务",
  },
};

function presentationFor(service: AIServiceItem) {
  const type = isChatServiceType(service.type) ? service.type : null;
  const label = type ? MODEL_LABEL[type] : service.name;
  const hint = type ? SERVICE_UI_HINT[type] : "";
  const preset = type ? SERVICE_PRESENTATION[type] : null;
  return {
    icon: preset?.icon ?? "✦",
    title: label,
    blurb: preset?.blurb ?? service.description ?? "暂无描述",
    scenario: preset?.scenario ?? "通用对话",
    hint,
    label,
  };
}

function costLabel(tokenCost: number) {
  if (tokenCost === 0) return "免费";
  return `${tokenCost} Token / 次`;
}

export default function SelectAIPage() {
  const router = useRouter();
  const { user, loading: authLoading, setUser } = useAuth({
    requireAuth: true,
  });
  const [services, setServices] = useState<AIServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      try {
        const response = await authFetch("/api/services");
        const data: { services?: AIServiceItem[]; error?: string } =
          await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "加载失败");
        }
        setServices(data.services ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败，请刷新重试。");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [authLoading, user]);

  async function handleSelect(serviceId: string) {
    // 先更新 UI，再发请求 — 交互要快，而不是优雅
    setSelectingId(serviceId);
    setError(null);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    try {
      const response = await authFetch("/api/services/select", {
        method: "POST",
        body: JSON.stringify({ serviceId }),
      });

      const data: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "选择失败");
      }

      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择失败");
      setSelectingId(null);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background text-sm text-muted">
        <AmbientBackground />
        <span className="relative">加载 AI 服务...</span>
      </div>
    );
  }

  const delayClass = [
    styles.d0,
    styles.d1,
    styles.d2,
    styles.d3,
    styles.d4,
    styles.d5,
  ];

  return (
    <div className={styles.page}>
      <AmbientBackground />

      <div className={styles.pageInner}>
        <div className={styles.topBar}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/20">
              <span className="text-lg text-teal-300">✦</span>
            </div>
            <span className="text-lg font-medium text-foreground/90">
              Mira AI
            </span>
          </div>
          <ThemeToggle
            userTheme={user.theme}
            onThemeSaved={(theme) => setUser({ ...user, theme })}
          />
        </div>

        <div className={styles.hero}>
          <p className={styles.heroKicker}>MIRA AI</p>
          <h1 className={styles.heroTitle}>Mira AI 模型选择</h1>
          <p className={styles.heroSubtitle}>
            Alpha / Beta / Gamma 对应不同能力档位；需要选型时可先选 Guide。
          </p>
          <p className={styles.heroMeta}>{user.email}</p>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-300">
            {error}
          </p>
        )}

        <div
          className={`${styles.grid} ${selectingId ? styles.gridSelecting : ""}`}
        >
          {services.map((service, index) => {
            const view = presentationFor(service);
            const active = selectingId === service.id;
            const recommended = service.type === "STANDARD";
            const delay = delayClass[Math.min(index, delayClass.length - 1)];
            const selectCta = active ? "✔ 当前使用" : "立即使用";
            const tooltip = [view.label, view.hint, view.blurb]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={service.id}
                className={`${styles.cardEnter} ${delay}`}
              >
                <button
                  type="button"
                  disabled={selectingId !== null}
                  aria-pressed={active}
                  aria-label={selectCta}
                  title={tooltip}
                  onClick={() => void handleSelect(service.id)}
                  className={`${styles.card} ${active ? styles.cardActive : ""} ${recommended && !active ? styles.cardRecommended : ""}`}
                >
                  <div className={styles.cardInner}>
                    <div className={styles.topHighlight} aria-hidden />
                    <div className={styles.cardGlow} aria-hidden />

                    {recommended && !active ? (
                      <div className={styles.recommend}>推荐模型</div>
                    ) : null}
                    {active ? (
                      <div className={styles.selectedMark} aria-hidden>
                        ✔ 已选择
                      </div>
                    ) : null}

                    <div className={styles.header}>
                      <div className={styles.icon} aria-hidden>
                        {view.icon}
                      </div>
                      <div className={styles.badge} title={view.hint || undefined}>
                        {view.label}
                      </div>
                    </div>

                    <div className={styles.body}>
                      <h3 className={styles.bodyTitle}>{view.title}</h3>
                      {view.hint ? (
                        <p className="mb-1 text-[11px] text-teal-400/80">
                          {view.hint}
                        </p>
                      ) : null}
                      <p className={styles.bodyDesc}>{view.blurb}</p>
                      <div className={styles.inset}>
                        <p className="text-[11px] text-muted">适合场景</p>
                        <p className="mt-0.5 text-sm text-foreground/80">
                          {view.scenario}
                        </p>
                      </div>
                    </div>

                    <div className={styles.footer}>
                      <div className={styles.footerMeta}>
                        <p className="text-[11px] text-muted">
                          {service.tokenCost === 0 ? "价格" : "消耗"}
                        </p>
                        <p className={styles.tokenCost}>
                          {costLabel(service.tokenCost)}
                        </p>
                      </div>
                      <span className={styles.cta}>{selectCta}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {services.length === 0 && !error && (
          <p className="mt-10 text-center text-sm text-muted">
            暂无可用 AI 服务，请联系管理员。
          </p>
        )}
      </div>
    </div>
  );
}
