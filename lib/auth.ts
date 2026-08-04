import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { cookies, headers } from "next/headers";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { NextResponse } from "next/server";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const testHash = scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const testBuffer = Buffer.from(testHash, "hex");

  if (hashBuffer.length === 0 || hashBuffer.length !== testBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, testBuffer);
}

export function signSession(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + SESSION_MAX_AGE_MS,
    }),
  ).toString("base64url");

  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function parseSession(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { userId: string; exp: number };

    if (!data.userId || data.exp < Date.now()) {
      return null;
    }

    return data.userId;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    // 本地 http 开发勿强制 secure，否则浏览器不存 cookie
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  };
}

/** 在 JSON 响应上挂载 session cookie；可传入已签发 token 保持 body/cookie 一致 */
export function attachSessionCookie(
  response: NextResponse,
  userId: string,
  existingToken?: string,
) {
  const token = existingToken ?? signSession(userId);
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return token;
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSession(userId), sessionCookieOptions());
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function resolveSessionToken(): Promise<string | null> {
  const headerStore = await headers();
  const auth = headerStore.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser() {
  const session = await resolveSessionToken();
  if (!session) return null;

  const userId = parseSession(session);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      nickname: true,
      avatar: true,
      tokenBalance: true,
      freeChatCount: true,
      createdAt: true,
    },
  });
}

export async function requireCurrentUser() {
  return getCurrentUser();
}
