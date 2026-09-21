import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { buildFromFirstRound } from "./single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
        participant: { findMany: (args: unknown) => participantFindMany(args) },
      }),
  },
}));

const { runFirstRoundEdit } = await import("./first-round-store");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const row = (overrides: Record<string, unknown> = {}) => ({
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  ...overrides,
});

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("runFirstRoundEdit", () => {
  it("SE なら mutate の結果を書き込み found: true を返す", async () => {
    divisionFindFirst.mockResolvedValue(row());
    const next = buildFromFirstRound([[{ kind: "bye" }, { kind: "bye" }]]);
    const result = await Effect.runPromise(
      runFirstRoundEdit(ids, async (_tx, current) => ({
        next: { ...current, matchingConfig: next },
        value: "ok",
      })),
    );
    expect(result).toEqual({ found: true, value: "ok" });
    expect(divisionUpdateMany.mock.calls[0][0].data.matchingConfig).toEqual(next);
  });

  it("SE 以外は mutate を呼ばず found: false", async () => {
    divisionFindFirst.mockResolvedValue(row({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" }));
    const mutate = vi.fn();
    const result = await Effect.runPromise(runFirstRoundEdit(ids, mutate));
    expect(result).toEqual({ found: false });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("league 形状の組み合わせは DivisionShapeMismatchError", async () => {
    const e = (id: string) => ({ kind: "entry", entryId: id });
    divisionFindFirst.mockResolvedValue(
      row({
        entries: {
          version: 1,
          entries: ["a", "b", "c"].map((id, seed) => ({ id, participantId: `p${id}`, seed })),
        },
        matchingConfig: {
          version: 1,
          matches: [
            { id: "r1", bracket: "winners", round: 1, order: 0, matchName: "1", slots: [e("a"), e("b")] },
            { id: "r2", bracket: "winners", round: 1, order: 1, matchName: "1", slots: [e("a"), e("c")] },
          ],
        },
      }),
    );
    const exit = await Effect.runPromiseExit(
      runFirstRoundEdit(ids, async () => ({ next: null, value: null })),
    );
    expect(failureTag(exit)).toBe("DivisionShapeMismatchError");
  });

  it("結果があれば DivisionResultsRecordedError", async () => {
    divisionFindFirst.mockResolvedValue(
      row({ results: { version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "a" }] } }),
    );
    const exit = await Effect.runPromiseExit(
      runFirstRoundEdit(ids, async () => ({ next: null, value: null })),
    );
    expect(failureTag(exit)).toBe("DivisionResultsRecordedError");
  });
});
