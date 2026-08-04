import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveMessageSnapshot } from "@/lib/message-snapshot";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/**
 * 加载会话消息（含每条助手消息生成时的模型快照）
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "缺少会话 ID。" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: {
        service: {
          select: { id: true, type: true, name: true, tokenCost: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            role: true,
            content: true,
            serviceType: true,
            modelName: true,
            tokenCost: true,
            tokenBalanceAfter: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "会话不存在或无权访问。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        serviceId: conversation.serviceId,
        service: conversation.service,
      },
      messages: conversation.messages.map((m) => {
        const isAssistant = m.role !== "user";
        const snap = isAssistant
          ? resolveMessageSnapshot({
              serviceType: m.serviceType,
              modelName: m.modelName,
              tokenCost: m.tokenCost,
              tokenBalanceAfter: m.tokenBalanceAfter,
              content: m.content,
            })
          : {
              serviceType: null,
              modelName: null,
              tokenCost: null,
              tokenBalanceAfter: null,
            };

        return {
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          serviceType: snap.serviceType,
          modelName: snap.modelName,
          tokenCost: snap.tokenCost,
          tokenBalanceAfter: snap.tokenBalanceAfter ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Load conversation error:", error);
    return NextResponse.json(
      { error: "加载会话失败。" },
      { status: 500 },
    );
  }
}
