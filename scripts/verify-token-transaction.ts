import { SERVICE_CONFIG } from "../lib/constants";
import { prisma } from "../lib/db";
import {
  beginTokenTransaction,
  confirmTokenTransaction,
  failTokenTransaction,
  TokenNotEnoughError,
} from "../lib/tokens";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES must remain free");

  const user = await prisma.user.findFirst({
    select: { id: true, tokenBalance: true },
  });
  const service = await prisma.aIService.findFirst({
    where: { type: "LIGHT", active: true },
    select: { id: true },
  });
  if (!user || !service) {
    console.log("SKIP token-transaction: need user + LIGHT service");
    return;
  }

  const original = user.tokenBalance;
  await prisma.user.update({
    where: { id: user.id },
    data: { tokenBalance: 40 },
  });

  try {
    try {
      await beginTokenTransaction({
        userId: user.id,
        amount: 50,
        reason: "test:not-enough",
        serviceId: service.id,
      });
      throw new Error("expected TokenNotEnoughError");
    } catch (e) {
      assert(e instanceof TokenNotEnoughError, "not enough throws");
    }

    const hold = await beginTokenTransaction({
      userId: user.id,
      amount: 5,
      reason: "test:fail-refund",
      serviceId: service.id,
    });
    const afterHold = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenBalance: true },
    });
    assert(afterHold?.tokenBalance === 35, `hold balance ${afterHold?.tokenBalance}`);
    const pending = await prisma.tokenTransaction.findUnique({
      where: { id: hold.id },
    });
    assert(pending?.status === "PENDING", "status PENDING");

    const failed = await failTokenTransaction(hold.id);
    assert(failed.tokenBalance === 40, `refunded ${failed.tokenBalance}`);
    const failedRow = await prisma.tokenTransaction.findUnique({
      where: { id: hold.id },
    });
    assert(failedRow?.status === "FAILED", "status FAILED");

    const failedAgain = await failTokenTransaction(hold.id);
    assert(failedAgain.tokenBalance === 40, "fail is idempotent");

    const hold2 = await beginTokenTransaction({
      userId: user.id,
      amount: 5,
      reason: "test:confirm",
      serviceId: service.id,
    });
    const confirmed = await confirmTokenTransaction(hold2.id, {
      serviceId: service.id,
      reason: "test:confirm",
    });
    assert(confirmed.tokenBalance === 35, `confirmed balance ${confirmed.tokenBalance}`);
    const okRow = await prisma.tokenTransaction.findUnique({
      where: { id: hold2.id },
    });
    assert(okRow?.status === "SUCCESS", "status SUCCESS");
    const usage = await prisma.tokenUsage.findFirst({
      where: { userId: user.id, reason: "test:confirm" },
      orderBy: { createdAt: "desc" },
    });
    assert(usage?.amount === -5, "TokenUsage written on SUCCESS");

    const afterSuccessFail = await failTokenTransaction(hold2.id);
    assert(afterSuccessFail.tokenBalance === 35, "SUCCESS must not refund");

    await prisma.tokenUsage.deleteMany({
      where: { userId: user.id, reason: "test:confirm" },
    });
    await prisma.tokenTransaction.deleteMany({
      where: { id: { in: [hold.id, hold2.id] } },
    });

    console.log("OK token-transaction PENDING→FAILED refund / PENDING→SUCCESS keep");
  } finally {
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: original },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
