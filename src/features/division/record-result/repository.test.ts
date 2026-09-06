import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => unknown) =>
      run({ division: { findFirst, updateMany } }),
  },
}));

const { recordResultInDb } = await import("./repository");

const ids = {
  organizationId: "o1",
  tournamentId: "t1",
  divisionId: "d1",
};

const matchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
    {
      id: "m1-1",
      bracket: "winners",
      round: 1,
      order: 1,
      matchNumber: "2",
      slots: [
        { kind: "entry", entryId: "e3" },
        { kind: "entry", entryId: "e4" },
      ],
    },
    {
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      matchNumber: "3",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "winnerOf", matchId: "m1-1" },
      ],
    },
  ],
};

const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

const division = (results: unknown, revision = 3) => ({
  format: "SINGLE_ELIMINATION",
  entries,
  matchingConfig,
  results,
  revision,
});

const empty = { version: 1, matches: [] };

const run = (input: { matchId: string; winnerEntryId: string }) =>
  Effect.runPromiseExit(recordResultInDb(ids, input));

/** 失敗のタグを確かめる。set-match-number/repository.test.ts と同じ書き方。 */
const expectFailureTag = (
  exit: Exit.Exit<unknown, { _tag: string }>,
  tag: string,
) => {
  expect(exit._tag).toBe("Failure");
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBe(true);
    if (Option.isSome(failure)) {
      expect(failure.value._tag).toBe(tag);
    }
  }
};

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("recordResultInDb", () => {
  it("所有権を where に入れて読む", async () => {
    findFirst.mockResolvedValue(division(empty));

    await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "d1",
          tournament: { id: "t1", organizationId: "o1" },
        },
      }),
    );
  });

  it("対象が無ければ found: false を返す", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(exit).toStrictEqual(Exit.succeed({ found: false }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("勝者を記録し、revision を進める", async () => {
    findFirst.mockResolvedValue(division(empty));

    await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "d1",
        revision: 3,
        tournament: { id: "t1", organizationId: "o1" },
      },
      data: {
        results: {
          version: 1,
          matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
        },
        revision: 4,
      },
    });
  });

  it("勝者を変えると下流の記録を消す", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m1-1", winnerEntryId: "e3" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    await run({ matchId: "m1-0", winnerEntryId: "e2" });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // applyMatchResult は既にある記録の位置を保ったまま上書きする。
          results: {
            version: 1,
            matches: [
              { matchId: "m1-0", winnerEntryId: "e2" },
              { matchId: "m1-1", winnerEntryId: "e3" },
            ],
          },
        }),
      }),
    );
  });

  it("空文字なら自分と下流の記録を消す", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m1-1", winnerEntryId: "e3" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    await run({ matchId: "m1-0", winnerEntryId: "" });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          results: {
            version: 1,
            matches: [{ matchId: "m1-1", winnerEntryId: "e3" }],
          },
        }),
      }),
    );
  });

  it("同じ勝者の押し直しでは書き込まない", async () => {
    findFirst.mockResolvedValue(
      division({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expect(exit).toStrictEqual(Exit.succeed({ found: true, value: null }));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("組み合わせに無い試合は DivisionMatchNotFoundError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m9-9", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionMatchNotFoundError");
  });

  it("対戦相手が未確定なら DivisionSlotNotDecidedError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m2-0", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionSlotNotDecidedError");
  });

  it("その試合に立っていない参加者は DivisionSlotNotDecidedError", async () => {
    findFirst.mockResolvedValue(division(empty));

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e3" });

    expectFailureTag(exit, "DivisionSlotNotDecidedError");
  });

  it("revision が進んでいれば DivisionRevisionConflictError", async () => {
    findFirst.mockResolvedValue(division(empty));
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await run({ matchId: "m1-0", winnerEntryId: "e1" });

    expectFailureTag(exit, "DivisionRevisionConflictError");
  });
});
