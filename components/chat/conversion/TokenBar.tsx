"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SERVICE_CONFIG, type ChatServiceType } from "@/lib/constants";
import type { ProductSuggestion } from "@/components/chat/types";
import { PackageCard } from "./PackageCard";
import styles from "./chat.module.css";

type Props = {
  tokenBalance: number;
  serviceType: ChatServiceType | null;
  forceShow?: boolean;
};

export function TokenBar({ tokenBalance, serviceType, forceShow }: Props) {
  const [flash, setFlash] = useState(false);
  const prevBalance = useRef(tokenBalance);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevBalance.current = tokenBalance;
      return;
    }
    if (prevBalance.current === tokenBalance) return;
    prevBalance.current = tokenBalance;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 120);
    return () => window.clearTimeout(t);
  }, [tokenBalance]);

  // SALES 免费通道不展示恐吓式余额条
  if (serviceType === "SALES" || !serviceType) return null;

  const paidType = serviceType;
  const cost = SERVICE_CONFIG[paidType].cost;
  const remainingUses = cost > 0 ? Math.floor(tokenBalance / cost) : null;
  // 余额恢复后自动隐藏；forceShow 仅在仍偏低时生效
  const show = tokenBalance < 30 || (Boolean(forceShow) && tokenBalance < 30);

  if (!show) return null;

  return (
    <div className={styles.tokenBar}>
      <div>
        <p className={styles.tokenBarText}>
          剩余{" "}
          <span className={styles.tokenBarValue} data-flash={flash}>
            {tokenBalance.toLocaleString()}
          </span>{" "}
          Token
        </p>
        {remainingUses !== null ? (
          <p className={styles.tokenBarMuted}>
            还能使用约 {remainingUses} 次
          </p>
        ) : null}
      </div>
      <Link href="/recharge" className={styles.rechargeBtn}>
        补充 Token →
      </Link>
    </div>
  );
}

type LowProps = {
  /** 余额不足引导 */
  lowBalance?: boolean;
  /** 展示套餐卡 */
  packagesOpen?: boolean;
  packages?: ProductSuggestion[];
  busy?: boolean;
  onOpenPackages: () => void;
  onBuy: (product: ProductSuggestion) => void;
  onRecommend?: () => void;
};

export function LowBalanceGuide({
  lowBalance,
  packagesOpen,
  packages = [],
  busy,
  onOpenPackages,
  onBuy,
  onRecommend,
}: LowProps) {
  const [press, setPress] = useState(false);

  if (!lowBalance && !packagesOpen) return null;

  function handleOpen() {
    setPress(true);
    window.setTimeout(() => setPress(false), 80);
    onOpenPackages();
  }

  return (
    <div className={styles.lowBalance}>
      {lowBalance ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p>Token 不够了，补充后就能接着刚才的问题继续。</p>
          <button
            type="button"
            className={styles.rechargeBtn}
            data-press={press}
            onClick={handleOpen}
          >
            补充 Token →
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p>选择适合你的 Token 套餐</p>
          <button
            type="button"
            className={styles.rechargeBtn}
            data-press={press}
            onClick={handleOpen}
          >
            刷新套餐
          </button>
        </div>
      )}

      {packagesOpen && packages.length > 0 ? (
        <div className={`${styles.packageGrid} w-full`}>
          {packages.map((product) => (
            <PackageCard
              key={product.id}
              product={product}
              disabled={busy}
              onBuy={onBuy}
              onRecommend={onRecommend}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
