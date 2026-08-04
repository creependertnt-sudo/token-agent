import type { ProductSuggestion } from "./types";

function toNumber(value: string) {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function uniqueByTokenAmount(products: ProductSuggestion[]) {
  const map = new Map<number, ProductSuggestion>();
  for (const item of products) {
    const existing = map.get(item.tokenAmount);
    // 同一 Token 数量只保留一条；优先保留更合理的套餐价（通常更大）
    if (!existing || item.price > existing.price) {
      map.set(item.tokenAmount, item);
    }
  }
  return Array.from(map.values());
}

function pushProduct(
  products: ProductSuggestion[],
  input: { name?: string; tokenAmount: number; price: number },
) {
  if (!Number.isFinite(input.tokenAmount) || input.tokenAmount <= 0) return;
  if (!Number.isFinite(input.price) || input.price <= 0) return;
  // 过滤单价误判，例如 0.015 元/Token
  if (input.price < 1 && input.tokenAmount >= 100) return;

  const name = (input.name ?? "")
    .replace(/[*_`#>\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  products.push({
    id: crypto.randomUUID(),
    name:
      name && name.length > 0 && name.length <= 16
        ? name
        : `${input.tokenAmount.toLocaleString()} Token 套餐`,
    tokenAmount: input.tokenAmount,
    price: input.price,
  });
}

/** 从前端解析 AI 回复中的商品推荐（不改后端） */
export function parseProductsFromReply(reply: string): ProductSuggestion[] {
  const products: ProductSuggestion[] = [];

  // 去掉“0.015 元/Token”这类单价，避免干扰
  const normalized = reply.replace(
    /\d+(?:\.\d+)?\s*元\s*\/\s*[Tt]oken/gi,
    " ",
  );

  // 1) ```product JSON``` 代码块
  const jsonBlockRegex = /```product\s*([\s\S]*?)```/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonBlockRegex.exec(normalized)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as
        | Record<string, unknown>
        | Record<string, unknown>[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const name = typeof item.name === "string" ? item.name : undefined;
        const tokenAmount = toNumber(
          String(item.tokenAmount ?? item.tokens ?? item.token ?? ""),
        );
        const price = toNumber(String(item.price ?? ""));
        pushProduct(products, { name, tokenAmount, price });
      }
    } catch {
      // ignore invalid blocks
    }
  }

  // 2) 同行：10000 Token / 150元 | 10,000 Token售价9.9元
  // 关键：名称/数字分组不能吞掉 Token 数量的前缀位（旧 bug：10000 → name=1, tokens=0000 → 0）
  const compactRegex =
    /(\d{1,3}(?:,\d{3})*|\d+)\s*[Tt]oken(?:s)?\s*(?:套餐|包|方案)?\s*(?:[\/：:\-–—]|，)?\s*(?:价格|售价|只要|仅需)?\s*[：:]?\s*[¥￥*]{0,2}\s*(\d+(?:\.\d+)?)\s*元?/gi;

  let match: RegExpExecArray | null;
  while ((match = compactRegex.exec(normalized)) !== null) {
    pushProduct(products, {
      tokenAmount: toNumber(match[1]),
      price: Number(match[2]),
    });
  }

  // 3) 跨行：Token 行 + 后续价格行（必须带 价格/售价/¥/元）
  const lines = normalized.split(/\n+/);
  for (let i = 0; i < lines.length; i++) {
    const tokenMatch = lines[i].match(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*[Tt]oken(?:s)?(?:\s*(?:套餐|包|方案))?/i,
    );
    if (!tokenMatch) continue;

    const tokenAmount = toNumber(tokenMatch[1]);
    let price = NaN;

    const sameLinePrice = lines[i].match(
      /(?:价格|售价)\s*[：:*\s]*[¥￥*]{0,2}\s*(\d+(?:\.\d+)?)\s*元?|(?:\/)\s*[¥￥*]{0,2}\s*(\d+(?:\.\d+)?)\s*元?/,
    );
    if (sameLinePrice) {
      price = Number(sameLinePrice[1] ?? sameLinePrice[2]);
    }

    if (!Number.isFinite(price) || price <= 0) {
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const priceMatch = lines[j].match(
          /(?:价格|售价)\s*[：:*\s]*[¥￥*]{0,2}\s*(\d+(?:\.\d+)?)\s*元?/,
        );
        if (priceMatch) {
          price = Number(priceMatch[1]);
          break;
        }
      }
    }

    pushProduct(products, { tokenAmount, price });
  }

  // 4) Markdown 表格：| 入门包 | 10000 | 9.9 |
  const tableRowRegex =
    /\|\s*([^|\n]+?)\s*\|\s*(\d{1,3}(?:,\d{3})*|\d+)\s*(?:Token(?:s)?)?\s*\|\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*元?\s*\|/gi;
  while ((match = tableRowRegex.exec(normalized)) !== null) {
    const name = match[1].replace(/[*_`]/g, "").trim();
    if (/token|数量|套餐名|名称|价格|售价/i.test(name)) continue;
    pushProduct(products, {
      name,
      tokenAmount: toNumber(match[2]),
      price: Number(match[3]),
    });
  }

  return uniqueByTokenAmount(products).slice(0, 4);
}

export function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}
