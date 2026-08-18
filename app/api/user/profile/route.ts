import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { avatarInitials, displayNickname } from "@/lib/user-profile";
import { NextResponse } from "next/server";

const THEMES = ["light", "dark", "system"] as const;
type ThemeValue = (typeof THEMES)[number];

function isTheme(value: unknown): value is ThemeValue {
  return (
    typeof value === "string" &&
    (THEMES as readonly string[]).includes(value)
  );
}

/**
 * PATCH /api/user/profile
 * body: { nickname?: string, theme?: "light"|"dark"|"system" }
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json();
    const hasNickname = typeof body?.nickname === "string";
    const hasTheme = body?.theme !== undefined;

    if (!hasNickname && !hasTheme) {
      return NextResponse.json(
        { error: "请提供 nickname 或 theme。" },
        { status: 400 },
      );
    }

    const data: { nickname?: string; avatar?: string; theme?: string } = {};

    if (hasNickname) {
      const nicknameRaw = String(body.nickname).trim();
      if (!nicknameRaw) {
        return NextResponse.json({ error: "昵称不能为空。" }, { status: 400 });
      }
      if (nicknameRaw.length > 24) {
        return NextResponse.json(
          { error: "昵称最长 24 个字符。" },
          { status: 400 },
        );
      }
      data.nickname = nicknameRaw;
      data.avatar = avatarInitials(nicknameRaw);
    }

    if (hasTheme) {
      if (!isTheme(body.theme)) {
        return NextResponse.json(
          { error: "theme 须为 light | dark | system。" },
          { status: 400 },
        );
      }
      data.theme = body.theme;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
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
        avatar: updated.avatar ?? avatarInitials(updated.nickname),
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
