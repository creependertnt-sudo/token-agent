"use client";

import { motion } from "framer-motion";
import { SERVICE_DISPLAY_NAME, SERVICE_TOKEN_COST } from "@/lib/constants";
import { formatMessageModelLine } from "@/lib/message-snapshot";

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

function displayName(type: string, fallback: string) {
  if (type in SERVICE_DISPLAY_NAME) {
    return SERVICE_DISPLAY_NAME[type as keyof typeof SERVICE_DISPLAY_NAME];
  }
  return fallback;
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
    ? formatMessageModelLine(type, displayName(type, current?.name ?? ""))
    : "未选择";

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="text-xs text-muted">
        当前模型：
        <span className="ml-1 font-medium text-foreground">{currentLine}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {ordered.map((svc) => {
          const active = svc.id === value;
          return (
            <motion.button
              key={svc.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={disabled}
              title={svc.description ?? svc.name}
              onClick={() => onChange(svc.id)}
              className={`min-w-[5.5rem] rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-accent/50 bg-accent/15 text-accent shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                  : "border-panel-border bg-card text-muted hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <span className="block text-xs font-semibold leading-tight">
                {svc.type}
              </span>
              <span className="mt-0.5 block text-[10px] opacity-85">
                {costLabel(svc.type, svc.tokenCost)}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
