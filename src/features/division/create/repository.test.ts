import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const tournamentFindFirst = vi.fn();
const divisionAggregate = vi.fn();
const divisionCreate = vi.fn();

// $transaction には「トランザクション用クライアント」を受け取るコールバックを渡す。
// テストでは同じモック群をそのまま渡し、呼ばれた引数だけを見る。
const tx = {
  tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
  division: {
    aggregate: (args: unknown) => divisionAggregate(args),
    create: (args: unknown) => divisionCreate(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { createDivisionInDb } = await import("./repository");

const input = {
  organizationId: "o1",
  tournamentId: "t1",
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION",
} as const;

beforeEach(() => {
  tournamentFindFirst.mockReset();
  divisionAggregate.mockReset();
  divisionCreate.mockReset();
});

describe("createDivisionInDb", () => {
  it("大会が組織のものであることを確かめてから採番する", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: 2 } });
    divisionCreate.mockResolvedValue({ id: "d1" });

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(tournamentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", organizationId: "o1" } }),
    );
    expect(divisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tournamentId: "t1",
          name: "男子シングルス",
          format: "SINGLE_ELIMINATION",
          order: 3,
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ id: "d1" });
    }
  });

  it("最初の部門は order 0 で作る", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: null } });
    divisionCreate.mockResolvedValue({ id: "d1" });

    await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(divisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 0 }),
      }),
    );
  });

  it("その組織に大会が無ければ作らず null を返す", async () => {
    tournamentFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(divisionCreate).not.toHaveBeenCalled();
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toBeNull();
    }
  });

  it("採番の競合（P2002）は DivisionOrderConflictError に写像する", async () => {
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    divisionAggregate.mockResolvedValue({ _max: { order: 0 } });
    divisionCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(createDivisionInDb({ ...input }));

    expect(failureTag(exit)).toBe("DivisionOrderConflictError");
  });
});
