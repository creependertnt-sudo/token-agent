import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { markSalesConversionClicked } from "@/lib/sales-conversion-log";
import { NextResponse } from "next/server";

/**
 * 创建订单（PENDING），关联 TokenPackage。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json();
    const packageId =
      typeof body?.packageId === "string"
        ? body.packageId.trim()
        : typeof body?.productId === "string"
          ? body.productId.trim()
          : "";

    if (!packageId) {
      return NextResponse.json(
        { error: "请选择要购买的套餐。" },
        { status: 400 },
      );
    }

    const pkg = await prisma.tokenPackage.findFirst({
      where: { id: packageId, active: true },
    });

    if (!pkg) {
      return NextResponse.json({ error: "套餐不存在。" }, { status: 404 });
    }

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        tokenAmount: pkg.tokenAmount,
        amount: pkg.price,
        status: OrderStatus.PENDING,
      },
    });

    await markSalesConversionClicked({
      userId: user.id,
      packageId: pkg.id,
    });

    return NextResponse.json({
      order: {
        id: order.id,
        packageId: pkg.id,
        productId: pkg.id,
        productName: pkg.name,
        tokenAmount: pkg.tokenAmount,
        amount: pkg.price,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json({ error: "创建订单失败，请稍后重试。" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        package: { select: { name: true } },
      },
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        packageId: o.packageId,
        productId: o.packageId,
        productName: o.package.name,
        tokenAmount: o.tokenAmount,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (error) {
    console.error("Orders list error:", error);
    return NextResponse.json({ error: "获取订单失败。" }, { status: 500 });
  }
}
