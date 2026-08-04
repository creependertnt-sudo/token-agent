import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * 列出可用 AI 服务（来自 AIService 表）。
 */
export async function GET() {
  try {
    const services = await prisma.aIService.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        tokenCost: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({ services });
  } catch (error) {
    console.error("Services API error:", error);
    return NextResponse.json({ error: "获取 AI 服务失败。" }, { status: 500 });
  }
}
