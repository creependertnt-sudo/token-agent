/**
 * 用户显示名 / 头像工具
 */

export const DEFAULT_NICKNAME = "未设置昵称";

/** 聊天展示昵称：永不回退到邮箱 */
export function displayNickname(nickname: string | null | undefined): string {
  const n = nickname?.trim();
  if (n) return n;
  return DEFAULT_NICKNAME;
}

/** 头像展示用 1～2 字（不使用邮箱） */
export function avatarInitials(nickname: string | null | undefined) {
  const source = displayNickname(nickname);
  if (source === DEFAULT_NICKNAME) return "未";
  if (/[\u4e00-\u9fff]/.test(source[0]!)) {
    return source.slice(0, 1);
  }
  return source.slice(0, 2).toUpperCase();
}
