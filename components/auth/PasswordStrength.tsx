"use client";

import {
  getPasswordChecks,
  getPasswordStrength,
  type PasswordStrength,
} from "@/lib/auth-form";

const STRENGTH_UI: Record<
  Exclude<PasswordStrength, "empty">,
  { label: string; width: string; bar: string; text: string }
> = {
  weak: {
    label: "弱",
    width: "33%",
    bar: "bg-rose-400",
    text: "text-rose-600 dark:text-rose-300",
  },
  medium: {
    label: "中",
    width: "66%",
    bar: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-300",
  },
  strong: {
    label: "强",
    width: "100%",
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-300",
  },
};

export function PasswordStrength({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const checks = getPasswordChecks(password);
  const ui = strength === "empty" ? null : STRENGTH_UI[strength];

  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">密码强度</span>
          <span className={ui ? ui.text : "text-muted"}>
            {ui ? ui.label : "—"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${ui ? ui.bar : "bg-transparent"}`}
            style={{ width: ui ? ui.width : "0%" }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-panel-border bg-card/60 px-3 py-2.5">
        <p className="mb-1.5 text-xs text-muted">密码要求</p>
        <ul className="space-y-1">
          <Requirement ok={checks.minLength} label="至少 8 个字符" />
          <Requirement ok={checks.hasLetter} label="包含字母" />
          <Requirement ok={checks.hasDigit} label="包含数字" />
          <Requirement ok={checks.hasSpecial} label="建议包含特殊符号" />
        </ul>
      </div>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-xs transition-colors ${
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted"
      }`}
    >
      <span aria-hidden>✓</span>
      <span>{label}</span>
    </li>
  );
}
