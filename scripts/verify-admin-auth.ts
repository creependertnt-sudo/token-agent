import { authorizeAdmin } from "../lib/admin-auth";
import { AppError, errorResponse } from "../lib/app-error";
import { SERVICE_CONFIG } from "../lib/constants";
import { prisma } from "../lib/db";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  try {
    authorizeAdmin(null);
    throw new Error("null user should throw");
  } catch (error) {
    assert(error instanceof AppError && error.status === 401, "401 unauthenticated");
    assert(error instanceof AppError && error.code === "UNAUTHORIZED", "UNAUTHORIZED");
  }

  try {
    authorizeAdmin({ id: "u1", email: "user@example.local", role: "USER" });
    throw new Error("USER should throw");
  } catch (error) {
    assert(error instanceof AppError && error.status === 403, "普通用户访问 admin → 403");
    assert(error instanceof AppError && error.code === "FORBIDDEN", "FORBIDDEN");
    const res = errorResponse(error);
    assert(res.status === 403, "response 403");
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    assert(body.error?.code === "FORBIDDEN", "error.code");
    assert(typeof body.error?.message === "string", "error.message");
  }

  const admin = authorizeAdmin({
    id: "a1",
    email: "admin@example.local",
    role: "ADMIN",
  });
  assert(admin.role === "ADMIN", "admin 用户访问 → 200/允许");

  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `role-user-${stamp}@example.local`,
      passwordHash: "test",
    },
    select: { id: true, role: true },
  });
  const adminRow = await prisma.user.create({
    data: {
      email: `role-admin-${stamp}@example.local`,
      passwordHash: "test",
      role: "ADMIN",
    },
    select: { id: true, role: true },
  });

  try {
    assert(user.role === "USER", "default role USER");
    assert(adminRow.role === "ADMIN", "explicit ADMIN");
    try {
      authorizeAdmin({ id: user.id, email: "u", role: user.role });
      throw new Error("db USER should 403");
    } catch (error) {
      assert(error instanceof AppError && error.status === 403, "db user 403");
    }
    authorizeAdmin({
      id: adminRow.id,
      email: "a",
      role: adminRow.role,
    });
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, adminRow.id] } },
    });
  }

  console.log("OK admin-auth", {
    userForbidden: 403,
    adminAllowed: true,
    salesCost: SERVICE_CONFIG.SALES.cost,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
