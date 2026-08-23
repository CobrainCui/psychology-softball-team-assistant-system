import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseCandidateIds } from "@/lib/testDay/collab/merge";
import type { TestDayConflictType } from "@/lib/testDay/collab/types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** 远程库上 FOR UPDATE 排队可能超过默认 5s */
export const COLLAB_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

/** 推导步骤：协作写入先锁草稿行，再读 Entry/冲突，避免归档校验与冲突创建的 TOCTOU */
export async function lockTestDayDraft(
  tx: Pick<typeof prisma, "$queryRaw">,
  draftId: string
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM "TestDayDraft" WHERE id = ${draftId} FOR UPDATE
  `;
}

export async function upsertOpenConflict(
  tx: Prisma.TransactionClient,
  input: {
    draftId: string;
    entityKey: string;
    type: Extract<TestDayConflictType, "value_mismatch" | "delete_request">;
    candidateIds: string[];
  }
): Promise<void> {
  const open = await tx.testDayConflict.findFirst({
    where: {
      draftId: input.draftId,
      entityKey: input.entityKey,
      type: input.type,
      reviewStatus: "open",
    },
  });
  if (open) {
    const merged = [
      ...new Set([
        ...parseCandidateIds(open.candidateEntryIds),
        ...input.candidateIds,
      ]),
    ];
    await tx.testDayConflict.update({
      where: { id: open.id },
      data: { candidateEntryIds: toJson(merged) },
    });
    return;
  }
  try {
    await tx.testDayConflict.create({
      data: {
        draftId: input.draftId,
        entityKey: input.entityKey,
        type: input.type,
        candidateEntryIds: toJson(input.candidateIds),
      },
    });
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }
    const raced = await tx.testDayConflict.findFirst({
      where: {
        draftId: input.draftId,
        entityKey: input.entityKey,
        type: input.type,
        reviewStatus: "open",
      },
    });
    if (!raced) throw error;
    const merged = [
      ...new Set([
        ...parseCandidateIds(raced.candidateEntryIds),
        ...input.candidateIds,
      ]),
    ];
    await tx.testDayConflict.update({
      where: { id: raced.id },
      data: { candidateEntryIds: toJson(merged) },
    });
  }
}
