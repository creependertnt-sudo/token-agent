import { getCurrentUser, requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  avatarInitials,
  displayNickname,
} from "@/lib/user-profile";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      console.log("[api/auth/me] 401: no current user");
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    const nickname = displayNickname(user.nickname);
    const avatar = user.avatar?.trim() || avatarInitials(user.nickname);

    const payload = {
      user: {
        ...user,
        nickname,
        avatar,
      },
    };
    console.log("[api/auth/me] 200:", {
      id: payload.user.id,
      email: payload.user.email,
      theme: payload.user.theme,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/auth/me] 500:", error);
    return NextResponse.json(
      { error: "获取用户信息失败，请稍后重试。" },
      { status: 500 },
    );
  }
}

/** @deprecated 请使用 PATCH /api/user/profile；保留兼容 */
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
        theme: true,
        tokenBalance: true,
        freeChatCount: true,
      },
    });

    return NextResponse.json({
      user: {
        ...updated,
        nickname: displayNickname(updated.nickname),
        avatar: updated.avatar ?? avatar,
        theme: updated.theme,
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
