import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const findMany = vi.fn();
const updateMany = vi.fn();

const tx = {
  division: {
    findMany: (args: unknown) => findMany(args),
    updateMany: (args: unknown) => updateMany(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { reorderDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d2",
  direction: "up",
} as const;

beforeEach(() => {
  findMany.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("reorderDivisionInDb", () => {
  it("並べ替え対象の一覧も所有条件つきで引く", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  // 直接入れ替えると中間状態が @@unique([tournamentId, order]) に触れる。
  // 退避値を経由する 3 段更新でないと、DB によっては必ず失敗する。
  it("退避値 -1 を経由した 3 段更新で order を交換する", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(updateMany).toHaveBeenCalledTimes(3);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "d2", tournamentId: "t1" },
      data: { order: -1 },
    });
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: "d1", tournamentId: "t1" },
      data: { order: 1 },
    });
    expect(updateMany.mock.calls[2][0]).toMatchObject({
      where: { id: "d2", tournamentId: "t1" },
      data: { order: 0 },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: true });
    }
  });

  it("端は何も更新せず swapped: false を返す", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);

    const exit = await Effect.runPromiseExit(
      reorderDivisionInDb({ ...input, divisionId: "d1" }),
    );

    expect(updateMany).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: false });
    }
  });

  it("その組織のその大会に部門が無ければ swapped: false", async () => {
    findMany.mockResolvedValue([]);

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(updateMany).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ swapped: false });
    }
  });

  // 同じ大会で並べ替えが同時に走ると、退避値 -1 どうしが衝突しうる。
  it("退避値の衝突（P2002）も DivisionOrderConflictError に写像する", async () => {
    findMany.mockResolvedValue([
      { id: "d1", order: 0 },
      { id: "d2", order: 1 },
    ]);
    updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(reorderDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("DivisionOrderConflictError");
  });
});
