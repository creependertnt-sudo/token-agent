import { attachSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  avatarInitials,
  DEFAULT_NICKNAME,
  displayNickname,
} from "@/lib/user-profile";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "邮箱和密码不能为空。" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "邮箱或密码错误。" },
        { status: 401 },
      );
    }

    let nickname = user.nickname;
    let avatar = user.avatar;
    if (!nickname?.trim()) {
      nickname = DEFAULT_NICKNAME;
      avatar = avatarInitials(nickname);
      await prisma.user.update({
        where: { id: user.id },
        data: { nickname, avatar },
      });
    }

    const publicUser = {
      id: user.id,
      email: user.email,
      nickname: displayNickname(nickname),
      avatar: avatar ?? avatarInitials(nickname),
      theme: user.theme,
      tokenBalance: user.tokenBalance,
      freeChatCount: user.freeChatCount,
      role: user.role,
    };

    const token = signSession(user.id);
    const response = NextResponse.json({ token, user: publicUser });
    attachSessionCookie(response, user.id, token);
    console.log("[api/auth/login] 200:", {
      userId: user.id,
      email: user.email,
      theme: user.theme,
      cookieSet: true,
      cookieName: "token_agent_session",
    });
    return response;
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ error: "登录失败，请稍后重试。" }, { status: 500 });
  }
}
