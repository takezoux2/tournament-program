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

  it("シングルエリミネーション以外は found: false を返し mutate を呼ばない", async () => {
    // Server Action は画面を経由せず直接叩けるので、対象外の形式の部門へ
    // 組み合わせを書き込まれないことをこの層で保証する。
    divisionFindFirst.mockResolvedValue({ ...emptyRow, format: "ROUND_ROBIN" });
    // 素通りしたときに mutate 側で落ちるのではなく assertion で落ちるよう、
    // 呼ばれれば成立する戻り値を持たせておく。
    const mutate = vi.fn(async () => ({ next: null, value: null }));

    const result = await Effect.runPromise(runDivisionSetup(ids, mutate));

    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
    expect(divisionUpdateMany).not.toHaveBeenCalled();
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
