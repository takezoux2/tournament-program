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

const { reorderMatchesInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

// e1 vs e2 / e3 vs e4 / 決勝 の 3 試合
const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
  { kind: "entry", entryId: "e4" },
]);
const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
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

describe("reorderMatchesInDb", () => {
  it("送られた順で実施順と試合番号を書き直す", async () => {
    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m2-0", "m1-0", "m1-1"] }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches.map((match: { id: string }) => match.id)).toEqual([
      "m2-0",
      "m1-0",
      "m1-1",
    ]);
    expect(
      written.matches.map((match: { sequence: number }) => match.sequence),
    ).toEqual([0, 1, 2]);
    expect(
      written.matches.map(
        (match: { matchNumber: string }) => match.matchNumber,
      ),
    ).toEqual(["1", "2", "3"]);
  });

  it("所有権を where に入れて読む", async () => {
    await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(divisionFindFirst.mock.calls[0][0].where).toEqual({
      id: "d1",
      tournament: { id: "t1", organizationId: "o1" },
    });
  });

  it("部門が無ければ found: false", async () => {
    divisionFindFirst.mockResolvedValue(null);

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("編集画面を持たない形式なら found: false", async () => {
    // Server Action はページを経由せず叩けるので、形式もここで確かめる。
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries,
      matchingConfig: config,
    });

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1", "m2-0"] }),
    );

    expect(outcome).toEqual({ found: false });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("並びが現在の組み合わせと合わなければ DivisionMatchOrderError で何も書かない", async () => {
    const exit = await Effect.runPromiseExit(
      reorderMatchesInDb(ids, { matchIds: ["m1-0", "m1-1"] }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause);
      expect(Option.isSome(error) && error.value._tag).toBe(
        "DivisionMatchOrderError",
      );
    }
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("勝敗が記録されていても並べ替えられる", async () => {
    // runDivisionSetup を使わない理由がここ。results は matchId で試合を
    // 指しており、並べ替えは id を変えないので参照は壊れない。
    // 実際に「勝敗が記録されている部門」を再現するため、mock の返り値に
    // 記録済みの results を入れる。runDivisionSetup 経由なら results が
    // 1 件でもあると DivisionResultsRecordedError で拒否されるが、ここでは
    // 専用トランザクションが results を見ずに読むため、成功するはず。
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: config,
      results: {
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
      },
    });

    const outcome = await Effect.runPromise(
      reorderMatchesInDb(ids, { matchIds: ["m2-0", "m1-0", "m1-1"] }),
    );

    expect(outcome).toEqual({ found: true, value: null });
    expect(divisionUpdateMany).toHaveBeenCalledTimes(1);
    // select に results が無いこと自体も、上の成功が「たまたま results を
    // 読んで許可した」のではなく「そもそも見ていない」ことの裏付けとして残す。
    expect(divisionFindFirst.mock.calls[0][0].select.results).toBeUndefined();
  });
});
