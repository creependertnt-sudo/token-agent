"use client";

import { useEffect, useState } from "react";
import styles from "./AmbientBackground.module.css";

/** 静态氛围背景：mesh + 深度遮罩；mount 后一次轻微 opacity 呼吸 */
export function AmbientBackground() {
  const [bgActive, setBgActive] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBgActive(true), 100);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={`${styles.root} ${bgActive ? styles.active : ""} pointer-events-none absolute inset-0 overflow-hidden`}
      aria-hidden
    >
      <div className={styles.mesh} />
      <div className={styles.backgroundOverlay} />
      <div className={styles.noise} />
    </div>
  );
}
