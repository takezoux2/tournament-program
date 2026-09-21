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

const { removeFirstRoundMatchInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = {
  version: 1,
  entries: ["a", "b", "c"].map((id, seed) => ({
    id,
    participantId: `p-${id}`,
    seed,
  })),
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([
      [e("a"), e("b")],
      [e("c"), { kind: "bye" }],
    ]),
    results: { version: 1, matches: [] },
  });
  participantFindMany.mockResolvedValue(
    entries.entries.map((x) => ({ id: x.participantId })),
  );
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("removeFirstRoundMatchInDb", () => {
  it("試合と、その試合の選手のエントリーを消す", async () => {
    const result = await Effect.runPromise(
      removeFirstRoundMatchInDb(ids, { matchId: "m1-0" }),
    );
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(data.entries.entries.map((x: { id: string }) => x.id)).toEqual([
      "c",
    ]);
    expect(firstRoundPairs(data.matchingConfig)).toEqual([
      [e("c"), { kind: "bye" }],
    ]);
  });

  it("1 回戦に無い試合は DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      removeFirstRoundMatchInDb(ids, { matchId: "m2-0" }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
