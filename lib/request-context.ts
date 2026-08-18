import { randomUUID } from "crypto";

export function createRequestId(): string {
  return randomUUID();
}
