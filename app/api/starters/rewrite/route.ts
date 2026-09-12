import { requireCurrentUser } from "@/lib/auth";
import { isForbiddenStarterCopy } from "@/lib/quick-send";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 2;
const MAX_CHARS_ACTION = 28;
const MAX_CHARS_SENTENCE = 72;

const REWRITE_SYSTEM_ACTION = `把这些「下一步建议」改得更口语、更像刚想到，保持简短（28字以内）。
要求：
- 用「判断 + 建议」，不要命令句（禁止：帮我做… / 给我一个… / 怎么提高…）
- 像 AI 在观察用户后随口建议（如：这个AI客服其实可以重新设计一下结构）
- 禁止：点击这里、查看更多、了解更多、点击继续
- 不要加箭头
只输出 JSON 字符串数组，长度与输入一致，不要解释。`;

const REWRITE_SYSTEM_SENTENCE = `把这句话改得更自然一点，保持简短。
要求：
- 保留原意和引导感（可保留 👇）
- 不要加「点击这里」「查看更多」
- 不要扩写成段落，一两句即可
只输出 JSON 字符串数组，长度与输入一致，不要解释。`;

function clampTexts(input: unknown, maxItems: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/\s*→\s*$/u, "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseRewrites(
  raw: string,
  count: number,
  maxChars: number,
): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed) || parsed.length < count) return null;

    const out: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const item = parsed[i];
      if (typeof item !== "string") return null;
      const text = item.replace(/\s*→\s*$/u, "").trim();
      if (!text || text.length > maxChars || isForbiddenStarterCopy(text)) {
        return null;
      }
      out.push(text);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Starter / 推进链轻量改写：最多 1~2 条，失败由客户端回退原文。
 * mode=action：短动作（默认）；mode=sentence：step2 一句润色。
 * 不扣 Token（仅 UX 润色）。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ texts: null, fallback: true }, { status: 200 });
    }

    const body = (await req.json().catch(() => null)) as {
      texts?: unknown;
      mode?: unknown;
    } | null;

    const mode = body?.mode === "sentence" ? "sentence" : "action";
    const maxChars = mode === "sentence" ? MAX_CHARS_SENTENCE : MAX_CHARS_ACTION;
    const maxItems = mode === "sentence" ? 1 : MAX_ITEMS;
    const texts = clampTexts(body?.texts, maxItems);
    if (texts.length === 0) {
      return NextResponse.json({ texts: [], fallback: true });
    }

    const client = new OpenAI({
      apiKey,
      baseURL:
        process.env.DEEPSEEK_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        "https://api.deepseek.com",
      timeout: 2500,
    });

    const completion = await client.chat.completions.create({
      model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
      temperature: 0.6,
      max_tokens: mode === "sentence" ? 120 : 160,
      messages: [
        {
          role: "system",
          content:
            mode === "sentence" ? REWRITE_SYSTEM_SENTENCE : REWRITE_SYSTEM_ACTION,
        },
        {
          role: "user",
          content: JSON.stringify(texts),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    const rewrites = parseRewrites(content, texts.length, maxChars);
    if (!rewrites) {
      return NextResponse.json({ texts: null, fallback: true });
    }

    return NextResponse.json({ texts: rewrites, fallback: false });
  } catch (error) {
    console.error("Starter rewrite API error:", error);
    return NextResponse.json({ texts: null, fallback: true });
  }
}
