import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { avatarInitials, displayNickname } from "@/lib/user-profile";
import { NextResponse } from "next/server";

/**
 * PATCH /api/user/profile
 * body: { nickname: string }
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json();
    const nicknameRaw =
      typeof body?.nickname === "string" ? body.nickname.trim() : "";

    if (!nicknameRaw) {
      return NextResponse.json({ error: "昵称不能为空。" }, { status: 400 });
    }

    if (nicknameRaw.length > 24) {
      return NextResponse.json(
        { error: "昵称最长 24 个字符。" },
        { status: 400 },
      );
    }

    const avatar = avatarInitials(nicknameRaw);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { nickname: nicknameRaw, avatar },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatar: true,
        tokenBalance: true,
        freeChatCount: true,
      },
    });

    return NextResponse.json({
      user: {
        ...updated,
        nickname: displayNickname(updated.nickname),
        avatar: updated.avatar ?? avatar,
      },
    });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json(
      { error: "更新资料失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
