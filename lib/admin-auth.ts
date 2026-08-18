import { getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/app-error";
import { isAdminRole } from "@/lib/admin-role";

export type AdminRole = "USER" | "ADMIN";

export type AdminUser = {
  id: string;
  email: string;
  role: AdminRole | string;
};

/** 纯函数：便于脚本验证，不依赖 Next headers。 */
export function authorizeAdmin(user: AdminUser | null): AdminUser {
  if (!user) {
    throw new AppError("UNAUTHORIZED", "请先登录。", 401);
  }
  if (!isAdminRole(user.role)) {
    throw new AppError("FORBIDDEN", "没有管理员权限。", 403);
  }
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  return authorizeAdmin(
    user
      ? {
          id: user.id,
          email: user.email,
          role: (user as { role?: string }).role ?? "USER",
        }
      : null,
  );
}
