"use client";

import { motion } from "framer-motion";
import {
  getServiceUiHint,
  getServiceUiLabel,
  MODEL_LABEL,
  SERVICE_TOKEN_COST,
  SERVICE_UI_HINT,
  SERVICE_UI_TONE,
  type ChatServiceType,
} from "@/lib/constants";

export type ModelServiceOption = {
  id: string;
  name: string;
  type: "SALES" | "LIGHT" | "STANDARD" | "PREMIUM" | string;
  tokenCost: number;
  description?: string | null;
};

type Props = {
  services: ModelServiceOption[];
  value: string | null;
  activeType?: string | null;
  disabled?: boolean;
  onChange: (serviceId: string) => void;
};

const TYPE_ORDER = ["SALES", "LIGHT", "STANDARD", "PREMIUM"] as const;

function costLabel(type: string, cost: number) {
  if (type === "SALES" || cost === 0) return "免费";
  const locked =
    type in SERVICE_TOKEN_COST
      ? SERVICE_TOKEN_COST[type as keyof typeof SERVICE_TOKEN_COST]
      : cost;
  return `${locked} Token`;
}

export function ModelSelector({
  services,
  value,
  activeType,
  disabled,
  onChange,
}: Props) {
  const ordered = [...services].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.type as (typeof TYPE_ORDER)[number]);
    const bi = TYPE_ORDER.indexOf(b.type as (typeof TYPE_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const current = ordered.find((s) => s.id === value);
  const type = activeType ?? current?.type ?? null;
  const currentLine = type
    ? `${getServiceUiLabel(type, current?.name ?? "")} · ${getServiceUiHint(type)} · ${costLabel(type, current?.tokenCost ?? 0)}`
    : "未选择";

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="text-xs text-muted">
        当前：
        <span className="ml-1 font-medium text-foreground">{currentLine}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {ordered.map((svc) => {
          const active = svc.id === value;
          const svcType = svc.type as ChatServiceType;
          const label =
            svc.type in MODEL_LABEL ? MODEL_LABEL[svcType] : svc.name;
          const hint =
            svc.type in SERVICE_UI_HINT ? SERVICE_UI_HINT[svcType] : "";
          const tone =
            svc.type in SERVICE_UI_TONE ? SERVICE_UI_TONE[svcType] : "guide";
          return (
            <motion.button
              key={svc.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={disabled}
              data-tone={tone}
              title={svc.description ?? `${label} · ${hint}`}
              onClick={() => onChange(svc.id)}
              className={`min-w-[5.5rem] rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                active
                  ? tone === "alpha"
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-400"
                    : tone === "beta"
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : tone === "gamma"
                        ? "border-violet-400/50 bg-violet-500/15 text-violet-400"
                        : "border-slate-400/45 bg-slate-500/15 text-slate-400"
                  : "border-panel-border bg-card text-muted hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <span className="block text-xs font-semibold leading-tight">
                {label}
              </span>
              <span className="mt-0.5 block text-[10px] opacity-80">
                {hint}
              </span>
              <span className="mt-0.5 block text-[10px] opacity-70">
                {costLabel(svc.type, svc.tokenCost)}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
