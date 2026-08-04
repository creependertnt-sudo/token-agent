import { requireCurrentUser } from "@/lib/auth";
import { FEATURE_TOKEN_COST } from "@/lib/constants";
import {
  consumeFeatureToken,
  TokenNotEnoughError,
  tokenNotEnoughResponse,
} from "@/lib/tokens";
import OpenAI from "openai";
import { NextResponse } from "next/server";

const WRITER_SYSTEM = `你是专业的 AI 写作助手，根据用户提供的产品信息，生成高质量中文营销内容。

请按以下结构输出（使用 Markdown）：
1. 广告标题（3 个备选）
2. 产品介绍（约 120 字）
3. 营销文案（适合社媒/落地页）
4. 销售方案（目标客户、卖点、成交话术）

语气专业有说服力，避免空洞套话。`;

/**
 * AI 写作助手：每次消耗 50 Token。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const body = await req.json();
    const productInfo =
      typeof body?.productInfo === "string" ? body.productInfo.trim() : "";

    if (!productInfo) {
      return NextResponse.json(
        { error: "请输入产品信息。" },
        { status: 400 },
      );
    }

    let updatedUser;
    try {
      updatedUser = await consumeFeatureToken(user.id, "writing");
    } catch (error) {
      if (error instanceof TokenNotEnoughError) {
        return tokenNotEnoughResponse(error);
      }
      throw error;
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com",
    });

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: WRITER_SYSTEM },
        {
          role: "user",
          content: `请根据以下产品信息生成完整写作内容：\n\n${productInfo}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({
      content,
      tokenBalance: updatedUser.tokenBalance,
      freeChatCount: updatedUser.freeChatCount,
      cost: FEATURE_TOKEN_COST.writing,
    });
  } catch (error) {
    console.error("Writer API error:", error);
    if (error instanceof TokenNotEnoughError) {
      return tokenNotEnoughResponse(error);
    }
    return NextResponse.json({ error: "生成失败，请稍后重试。" }, { status: 500 });
  }
}
