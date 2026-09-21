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
        participant: {
          findMany: (args: unknown) => participantFindMany(args),
        },
      }),
  },
}));

const { clearSlotInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const bye = { kind: "bye" } as const;
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = {
  version: 1,
  entries: [
    { id: "a", participantId: "p-a", seed: 0 },
    { id: "b", participantId: "p-b", seed: 1 },
  ],
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([[e("a"), e("b")]]),
    results: { version: 1, matches: [] },
  });
  participantFindMany.mockResolvedValue([{ id: "p-a" }, { id: "p-b" }]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("clearSlotInDb", () => {
  it("スロットを空にし、その選手のエントリーを消す", async () => {
    const result = await Effect.runPromise(
      clearSlotInDb(ids, { matchId: "m1-0", slotIndex: 1 }),
    );
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(firstRoundPairs(data.matchingConfig)[0]).toEqual([e("a"), bye]);
    expect(data.entries.entries.map((x: { id: string }) => x.id)).toEqual([
      "a",
    ]);
  });

  it("既に空なら書き込まない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: buildFromFirstRound([[e("a"), bye]]),
      results: { version: 1, matches: [] },
    });
    await Effect.runPromise(
      clearSlotInDb(ids, { matchId: "m1-0", slotIndex: 1 }),
    );
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("1 回戦に無い試合は DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      clearSlotInDb(ids, { matchId: "m2-0", slotIndex: 0 }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
  });
});
