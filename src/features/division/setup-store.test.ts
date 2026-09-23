import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_DIVISION_ENTRIES,
  EMPTY_MATCHING_CONFIG,
} from "@/lib/division/types";
import { failureTag } from "@/shared/testing/exit";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

// $transaction には「トランザクション用クライアント」を受け取るコールバックを渡す。
// テストでは同じモック群をそのまま渡し、呼ばれた引数だけを見る。
const tx = {
  division: {
    findFirst: (args: unknown) => divisionFindFirst(args),
    updateMany: (args: unknown) => divisionUpdateMany(args),
  },
  participant: { findMany: (args: unknown) => participantFindMany(args) },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { runDivisionSetup } = await import("./setup-store");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const emptyRow = {
  format: "SINGLE_ELIMINATION",
  entries: EMPTY_DIVISION_ENTRIES,
  matchingConfig: EMPTY_MATCHING_CONFIG,
  results: { version: 1, matches: [] },
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("runDivisionSetup", () => {
  it("組織・大会・部門の 3 段を where に入れて読む", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);

    await Effect.runPromise(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(divisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  it("部門が無ければ found: false を返し mutate を呼ばない", async () => {
    divisionFindFirst.mockResolvedValue(null);
    const mutate = vi.fn();

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("リーグは編集できる形式なので mutate を呼び、形式を渡す", async () => {
    divisionFindFirst.mockResolvedValue({ ...emptyRow, format: "ROUND_ROBIN" });
    const mutate = vi.fn(async () => ({ next: null, value: null }));

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: true, value: null });
    expect(mutate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: "ROUND_ROBIN" }),
    );
  });

  it("書き戻しでは format を更新しない", async () => {
    // 形式は /edit の責務。この経路では読み出すだけで書かない。
    divisionFindFirst.mockResolvedValue(emptyRow);

    await Effect.runPromise(
      runDivisionSetup(ids, async (_tx, current) => ({
        next: current,
        value: null,
      })),
    );

    expect(divisionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          entries: EMPTY_DIVISION_ENTRIES,
          matchingConfig: EMPTY_MATCHING_CONFIG,
        },
      }),
    );
  });

  it("形式も select して読む", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);

    await Effect.runPromise(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(divisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ format: true }),
      }),
    );
  });

  it("勝敗が記録されていれば拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      ...emptyRow,
      results: {
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
      },
    });

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(failureTag(exit)).toBe("DivisionResultsRecordedError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("Json が壊れていれば DivisionDataError にする", async () => {
    divisionFindFirst.mockResolvedValue({
      ...emptyRow,
      entries: { version: 2 },
    });

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({ next: null, value: null })),
    );

    expect(failureTag(exit)).toBe("DivisionDataError");
  });

  it("next が null なら書き込まない", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);

    const result = await Effect.runPromise(
      runDivisionSetup(ids, async () => ({
        next: null,
        value: { swapped: false },
      })),
    );

    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("next があれば所有条件つきの updateMany で書き戻す", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);
    participantFindMany.mockResolvedValue([{ id: "p1" }]);

    const next = {
      format: "SINGLE_ELIMINATION" as const,
      entries: {
        version: 1 as const,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: EMPTY_MATCHING_CONFIG,
    };

    await Effect.runPromise(
      runDivisionSetup(ids, async () => ({ next, value: null })),
    );

    expect(divisionUpdateMany).toHaveBeenCalledWith({
      where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      data: { entries: next.entries, matchingConfig: next.matchingConfig },
    });
  });

  it("検証を通らない結果は書き込まず DivisionDataError にする", async () => {
    divisionFindFirst.mockResolvedValue(emptyRow);
    // 大会に居ない participant を entries が参照している状態を作る。
    participantFindMany.mockResolvedValue([]);

    const exit = await Effect.runPromiseExit(
      runDivisionSetup(ids, async () => ({
        next: {
          format: "SINGLE_ELIMINATION" as const,
          entries: {
            version: 1 as const,
            entries: [{ id: "e1", participantId: "missing", seed: 0 }],
          },
          matchingConfig: EMPTY_MATCHING_CONFIG,
        },
        value: null,
      })),
    );

    expect(failureTag(exit)).toBe("DivisionDataError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
