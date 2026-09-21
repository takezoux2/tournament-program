import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { buildFromFirstRound } from "../single-elimination/build";
import { firstRoundPairs } from "../single-elimination/first-round";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();

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
          findFirst: (args: unknown) => participantFindFirst(args),
          create: (args: unknown) => participantCreate(args),
        },
        member: {
          findFirst: (args: unknown) => memberFindFirst(args),
          create: (args: unknown) => memberCreate(args),
        },
      }),
  },
}));

const { assignSlotInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };
const bye = { kind: "bye" } as const;
const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const entries = {
  version: 1,
  entries: [{ id: "a", participantId: "p-a", seed: 0 }],
};

const mocks = [
  divisionFindFirst,
  divisionUpdateMany,
  participantFindMany,
  participantFindFirst,
  participantCreate,
  memberFindFirst,
  memberCreate,
];

beforeEach(() => {
  for (const fn of mocks) {
    fn.mockReset();
  }
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: buildFromFirstRound([[e("a"), bye]]),
    results: { version: 1, matches: [] },
  });
  // save の検証（id）と選手番号の採番（playerNumber）の両方がこれを読む。
  participantFindMany.mockResolvedValue([
    { id: "p-a", playerNumber: "1" },
    { id: "p-new", playerNumber: "2" },
  ]);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
  memberFindFirst.mockResolvedValue({ id: "m-2" });
  participantFindFirst.mockResolvedValue({ id: "p-new" });
});

describe("assignSlotInDb", () => {
  it("既存メンバーを空きスロットに置き、エントリーを足す", async () => {
    const result = await Effect.runPromise(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 1,
        member: { mode: "existing", memberId: "m-2" },
      }),
    );
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    const added = data.entries.entries.find(
      (x: { participantId: string }) => x.participantId === "p-new",
    );
    expect(added.seed).toBe(1);
    expect(firstRoundPairs(data.matchingConfig)[0]).toEqual([
      e("a"),
      e(added.id),
    ]);
  });

  it("差し替えたら前の選手のエントリーを消す", async () => {
    await Effect.runPromise(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 0,
        member: { mode: "existing", memberId: "m-2" },
      }),
    );
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(
      data.entries.entries.map(
        (x: { participantId: string }) => x.participantId,
      ),
    ).toEqual(["p-new"]);
  });

  it("新規メンバーなら Member と Participant を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m-3" });
    participantFindFirst.mockResolvedValue(null);
    participantCreate.mockResolvedValue({ id: "p-new" });
    await Effect.runPromise(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 1,
        member: { mode: "new", name: "佐藤 蓮", nameKana: "さとう れん" },
      }),
    );
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: "o1",
          name: "佐藤 蓮",
          nameKana: "さとう れん",
        },
      }),
    );
    expect(participantCreate).toHaveBeenCalled();
  });

  it("既に部門にいる参加者は DivisionDuplicateEntryError", async () => {
    participantFindFirst.mockResolvedValue({ id: "p-a" });
    const exit = await Effect.runPromiseExit(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 1,
        member: { mode: "existing", memberId: "m-1" },
      }),
    );
    expect(failureTag(exit)).toBe("DivisionDuplicateEntryError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("スロットに置かれていない既存エントリーは、足さずにそのエントリーを置く", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [
          { id: "a", participantId: "p-a", seed: 0 },
          { id: "orphan", participantId: "p-new", seed: 1 },
        ],
      },
      matchingConfig: buildFromFirstRound([[e("a"), bye]]),
      results: { version: 1, matches: [] },
    });
    const result = await Effect.runPromise(
      assignSlotInDb(ids, {
        matchId: "m1-0",
        slotIndex: 1,
        member: { mode: "existing", memberId: "m-2" },
      }),
    );
    expect(result).toEqual({ found: true, value: null });
    const data = divisionUpdateMany.mock.calls[0][0].data;
    expect(data.entries.entries).toEqual([
      { id: "a", participantId: "p-a", seed: 0 },
      { id: "orphan", participantId: "p-new", seed: 1 },
    ]);
    expect(firstRoundPairs(data.matchingConfig)[0]).toEqual([
      e("a"),
      e("orphan"),
    ]);
  });

  it("1 回戦に無い試合は Member を作る前に DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      assignSlotInDb(ids, {
        matchId: "m9-9",
        slotIndex: 0,
        member: { mode: "new", name: "x", nameKana: "x" },
      }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
