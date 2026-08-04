import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const serviceSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  type: true,
  tokenCost: true,
  active: true,
} as const;

/**
 * 记录用户选择，并可选写入当前 Conversation.serviceId。
 * 不删除历史 UserSelectedService 记录。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json();
    const serviceId =
      typeof body?.serviceId === "string" ? body.serviceId.trim() : "";
    const conversationId =
      typeof body?.conversationId === "string"
        ? body.conversationId.trim()
        : "";
    const requestedType =
      typeof body?.serviceType === "string"
        ? body.serviceType.trim().toUpperCase()
        : "";

    if (!serviceId) {
      return NextResponse.json({ error: "请选择 AI 服务。" }, { status: 400 });
    }

    const service = await prisma.aIService.findFirst({
      where: { id: serviceId, active: true },
      select: serviceSelect,
    });

    if (!service) {
      return NextResponse.json({ error: "服务不存在或已下架。" }, { status: 404 });
    }

    if (requestedType && requestedType !== service.type) {
      return NextResponse.json(
        {
          error: `serviceType(${requestedType}) 与所选服务(${service.type}) 不一致。`,
        },
        { status: 400 },
      );
    }

    console.log(
      `select serviceType=${service.type} serviceId=${service.id} name=${service.name}`,
    );

    const selection = await prisma.userSelectedService.create({
      data: {
        userId: user.id,
        serviceId: service.id,
      },
      select: {
        id: true,
        userId: true,
        serviceId: true,
        createdAt: true,
      },
    });

    let conversation = null;
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "会话不存在或无权访问。" },
          { status: 404 },
        );
      }
      conversation = await prisma.conversation.update({
        where: { id: existing.id },
        data: { serviceId: service.id },
        select: { id: true, serviceId: true },
      });
    }

    return NextResponse.json({
      selection,
      service,
      serviceType: service.type,
      conversation,
    });
  } catch (error) {
    console.error("Select service API error:", error);
    return NextResponse.json({ error: "选择服务失败，请稍后重试。" }, { status: 500 });
  }
}

/** 当前默认服务：最新 UserSelectedService；可带 conversationId 优先返回会话绑定 */
export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id },
        include: { service: { select: serviceSelect } },
      });
      if (conversation?.service?.active) {
        return NextResponse.json({
          service: conversation.service,
          source: "conversation",
          conversationId: conversation.id,
        });
      }
    }

    const selection = await prisma.userSelectedService.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { service: { select: serviceSelect } },
    });

    if (!selection?.service?.active) {
      return NextResponse.json({
        service: null,
        source: null,
      });
    }

    return NextResponse.json({
      service: selection.service,
      source: "userSelectedService",
      selectionId: selection.id,
    });
  } catch (error) {
    console.error("Current service API error:", error);
    return NextResponse.json({ error: "获取当前服务失败。" }, { status: 500 });
  }
}
