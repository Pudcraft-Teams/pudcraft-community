/**
 * PSID 数字短链标识生成器。
 * 在事务中生成随机数字 ID 并写入 reserved_numeric_ids 表保证唯一性。
 */

import { randomInt } from "crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const PSID_MIN = 100_000;
const PSID_MAX = 999_999;
const MAX_RETRIES = 20;

async function generateAndReserve(
  tx: TransactionClient | Prisma.TransactionClient,
  type: "psid",
  min: number,
  max: number,
): Promise<number> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const numericId = randomInt(min, max + 1);

    const existing = await (tx as TransactionClient).reservedNumericId.findUnique({
      where: { unique_type_numeric_id: { type, numericId } },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await (tx as TransactionClient).reservedNumericId.create({
      data: { type, numericId },
    });

    return numericId;
  }

  throw new Error(`Failed to generate unique ${type} after ${MAX_RETRIES} attempts`);
}

/** 在事务内生成并预留一个 6 位 PSID（100000–999999） */
export async function generateAndReservePsid(
  tx: TransactionClient | Prisma.TransactionClient,
): Promise<number> {
  return generateAndReserve(tx, "psid", PSID_MIN, PSID_MAX);
}
