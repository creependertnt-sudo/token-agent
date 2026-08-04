import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/**
 * 模拟支付成功：PENDING → SUCCESS，并增加用户 tokenBalance。
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: "订单 ID 无效。" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: user.id },
      include: { package: true },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在。" }, { status: 404 });
    }

    if (order.status === OrderStatus.SUCCESS) {
      const freshUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          tokenBalance: true,
          freeChatCount: true,
        },
      });
      return NextResponse.json({
        order: {
          id: order.id,
          packageId: order.packageId,
          productId: order.packageId,
          productName: order.package.name,
          tokenAmount: order.tokenAmount,
          amount: order.amount,
          status: order.status,
        },
        user: freshUser,
        message: "订单已支付成功。",
      });
    }

    if (order.status !== OrderStatus.PENDING) {
      return NextResponse.json(
        { error: "订单状态无法支付。" },
        { status: 400 },
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const paid = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.SUCCESS },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { tokenBalance: { increment: order.tokenAmount } },
      });

      return paid;
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        tokenBalance: true,
        freeChatCount: true,
      },
    });

    return NextResponse.json({
      order: {
        id: updatedOrder.id,
        packageId: order.packageId,
        productId: order.packageId,
        productName: order.package.name,
        tokenAmount: order.tokenAmount,
        amount: order.amount,
        status: updatedOrder.status,
      },
      user: updatedUser,
      message: `支付成功，已到账 ${order.tokenAmount.toLocaleString()} Token`,
    });
  } catch (error) {
    console.error("Pay order error:", error);
    return NextResponse.json({ error: "支付失败，请稍后重试。" }, { status: 500 });
  }
}
