import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { buildFromFirstRound } from "../single-elimination/build";
import { firstRoundPairs } from "../single-elimination/first-round";

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

const { addFirstRoundMatchInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const bye = { kind: "bye" } as const;
const row = (matchCount: number) => ({
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: buildFromFirstRound(
    Array.from(
      { length: matchCount },
      () => [bye, bye] as [typeof bye, typeof bye],
    ),
  ),
  results: { version: 1, matches: [] },
});

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  participantFindMany.mockResolvedValue([]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("addFirstRoundMatchInDb", () => {
  it("空の試合を 1 つ足して書き込む", async () => {
    divisionFindFirst.mockResolvedValue(row(2));
    const result = await Effect.runPromise(addFirstRoundMatchInDb(ids));
    expect(result).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(firstRoundPairs(written)).toHaveLength(3);
  });

  it("64 試合あれば DivisionFirstRoundLimitError", async () => {
    divisionFindFirst.mockResolvedValue(row(64));
    const exit = await Effect.runPromiseExit(addFirstRoundMatchInDb(ids));
    expect(failureTag(exit)).toBe("DivisionFirstRoundLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
