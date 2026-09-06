import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromSlots } from "../single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        division: {
          findFirst: (args: unknown) => divisionFindFirst(args),
          updateMany: (args: unknown) => divisionUpdateMany(args),
        },
      }),
  },
}));

const { setMatchNumberInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

// e1 vs e2 の 1 試合だけの組み合わせ（matchNumber "1"）
const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
]);
const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig: config,
  });
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("setMatchNumberInDb", () => {
  it("指定した試合の番号だけを書き換える", async () => {
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches[0].matchNumber).toBe("A");
    expect(written.matches[0].slots).toEqual(config.matches[0].slots);
  });

  it("所有権を where に入れて読む", async () => {
    await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );
    expect(divisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "d1",
          tournament: { id: "t1", organizationId: "o1" },
        },
      }),
    );
  });

  it("部門が見つからなければ found: false", async () => {
    divisionFindFirst.mockResolvedValue(null);
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "A" }),
    );
    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("存在しない試合なら DivisionMatchNotFoundError", async () => {
    const exit = await Effect.runPromiseExit(
      setMatchNumberInDb(ids, { matchId: "m9-9", matchNumber: "A" }),
    );
    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("DivisionMatchNotFoundError");
      }
    }
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("別の試合と同じ番号なら DivisionMatchNumberConflictError", async () => {
    const twoMatches = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
      { kind: "bye" },
      { kind: "bye" },
    ]);
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: twoMatches,
    });

    const exit = await Effect.runPromiseExit(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "2" }),
    );
    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("DivisionMatchNumberConflictError");
      }
    }
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("同じ試合への同じ番号の再設定は重複にならない", async () => {
    const outcome = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "1" }),
    );
    expect(outcome).toEqual({ found: true, value: null });
  });

  it("リーグの部門でも試合番号を変えられる", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
    });

    const result = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "r1-0", matchNumber: "A-1" }),
    );

    expect(result).toEqual({ found: true, value: null });
    expect(divisionUpdateMany).toHaveBeenCalled();
  });

  it("編集画面の無い形式は found: false を返す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
    });

    const result = await Effect.runPromise(
      setMatchNumberInDb(ids, { matchId: "m1-0", matchNumber: "2" }),
    );

    expect(result).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
