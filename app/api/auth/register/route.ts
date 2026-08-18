import { attachSessionCookie, hashPassword, signSession } from "@/lib/auth";
import {
  INITIAL_FREE_CHAT_COUNT,
  INITIAL_TOKEN_BALANCE,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { avatarInitials, DEFAULT_NICKNAME } from "@/lib/user-profile";
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

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码长度至少为 6 位。" },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "该邮箱已注册。" },
        { status: 409 },
      );
    }

    const nickname = DEFAULT_NICKNAME;
    const avatar = avatarInitials(nickname);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        nickname,
        avatar,
        tokenBalance: INITIAL_TOKEN_BALANCE,
        freeChatCount: INITIAL_FREE_CHAT_COUNT,
      },
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

    const token = signSession(user.id);
    const response = NextResponse.json({ token, user });
    attachSessionCookie(response, user.id, token);
    return response;
  } catch (error) {
    console.error("Register API error:", error);
    return NextResponse.json({ error: "注册失败，请稍后重试。" }, { status: 500 });
  }
}
