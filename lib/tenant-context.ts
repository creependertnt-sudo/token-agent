import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const DEFAULT_TENANT_ID = "tenant_default";
export const DEFAULT_TENANT_NAME = "Default Tenant";

export type TenantInfo = {
  id: string;
  name: string;
  createdAt: Date;
};

/** 保证 Default Tenant 存在，并把未绑定行挂到默认租户。 */
export async function ensureDefaultTenant(): Promise<TenantInfo> {
  const tenant = await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    create: { id: DEFAULT_TENANT_ID, name: DEFAULT_TENANT_NAME },
    update: {},
    select: { id: true, name: true, createdAt: true },
  });

  await Promise.all([
    prisma.user.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.agentConfig.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.salesKnowledge.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.competitorKnowledge.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.agentMemory.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
    prisma.customerMemory.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    }),
  ]);

  return tenant;
}

export function scopeTenantId(tenantId?: string | null): string {
  const id = tenantId?.trim();
  return id || DEFAULT_TENANT_ID;
}

export async function resolveTenantIdByUserId(
  userId?: string | null,
): Promise<string> {
  if (!userId) return DEFAULT_TENANT_ID;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  return scopeTenantId(user?.tenantId);
}

/**
 * Session → User → Tenant。
 * 未登录返回 null；已登录但无租户时回退 Default Tenant。
 */
export async function getCurrentTenant(): Promise<TenantInfo | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const tenantId = scopeTenantId(
    "tenantId" in user ? (user.tenantId as string | null) : null,
  );
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, createdAt: true },
  });
  if (tenant) return tenant;
  return ensureDefaultTenant();
}

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          agents: true,
        },
      },
    },
  });
}
