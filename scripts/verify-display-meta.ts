import { MODEL_LABEL } from "../lib/constants";
import {
  resolveMessageSnapshot,
  stripAssistantDisplayMeta,
} from "../lib/message-snapshot";

const sample = [
  "你好，我是 Alpha（LIGHT），固定消耗 5 Token。",
  "",
  "介绍如下。",
  "",
  "---",
  "已消耗 5 Token（锁定 LIGHT · Alpha）。当前余额：100 Token。",
].join("\n");

const cleaned = stripAssistantDisplayMeta(sample);
console.log("CLEANED:", cleaned);

const snap = resolveMessageSnapshot({
  serviceType: "LIGHT",
  modelName: "旧名",
  tokenCost: 5,
  tokenBalanceAfter: 100,
  content: sample,
});
console.log("SNAP:", snap);

if (!cleaned.includes("介绍如下")) throw new Error("lost body");
if (cleaned.includes("已消耗") || cleaned.includes("固定消耗")) {
  throw new Error("billing still present");
}
if (snap.modelName !== MODEL_LABEL.LIGHT || snap.tokenCost !== 5) {
  throw new Error("snapshot mismatch");
}
console.log("OK");
