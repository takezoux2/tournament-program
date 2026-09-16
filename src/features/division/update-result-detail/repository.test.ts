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

const { updateResultDetailInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

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
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      matchNumber: "2",
      slots: [{ kind: "winnerOf", matchId: "m1-0" }, { kind: "bye" }],
    },
  ],
};

const resultConfig = {
  version: 1,
  winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" },
  note: { enabled: true },
};

const input = {
  matchId: "m1-0",
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 6.8, 7.2] },
    { entryId: "e2", values: [6.5, 6.9, 6.6] },
  ],
  note: "メモ",
};

const row = (results: unknown) => ({
  format: "SINGLE_ELIMINATION",
  matchingConfig,
  results,
  resultConfig,
  revision: 3,
});

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>): string => {
  const failure = Cause.failureOption(
    Exit.isFailure(exit) ? exit.cause : Cause.empty,
  );
  return Option.isSome(failure) ? failure.value._tag : "";
};

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset();
});

describe("updateResultDetailInDb", () => {
  it("詳細を書き、下流の記録を消さない", async () => {
    findFirst.mockResolvedValue(
      row({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1" },
          { matchId: "m2-0", winnerEntryId: "e1" },
        ],
      }),
    );
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, input),
    );
    expect(Exit.isSuccess(exit)).toBe(true);

    const written = updateMany.mock.calls[0][0].data.results;
    expect(written.matches).toEqual([
      {
        matchId: "m1-0",
        winnerEntryId: "e1",
        winReason: "一本勝ち",
        scores: [
          { entryId: "e1", values: [7, 6.8, 7.2] },
          { entryId: "e2", values: [6.5, 6.9, 6.6] },
        ],
        note: "メモ",
      },
      // 下流はそのまま残る。勝者を変えていないので矛盾しない。
      { matchId: "m2-0", winnerEntryId: "e1" },
    ]);
    expect(updateMany.mock.calls[0][0].data.revision).toBe(4);
  });

  it("勝敗が未記録なら拒否する", async () => {
    findFirst.mockResolvedValue(row({ version: 1, matches: [] }));

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, input),
    );
    expect(failureTag(exit)).toBe("DivisionResultNotRecordedError");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("組み合わせに無い試合は拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, matchId: "m9-9" }),
    );
    expect(failureTag(exit)).toBe("DivisionMatchNotFoundError");
  });

  it("選択肢に無い勝因は拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, winReason: "反則負け" }),
    );
    expect(failureTag(exit)).toBe("DivisionWinReasonNotAllowedError");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("一覧から消えた勝因でも、今その試合に入っていれば通す", async () => {
    findFirst.mockResolvedValue(
      row({
        version: 1,
        matches: [
          { matchId: "m1-0", winnerEntryId: "e1", winReason: "反則負け" },
        ],
      }),
    );
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, winReason: "反則負け" }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("無効な項目は書かず、既存値も消さない", async () => {
    findFirst.mockResolvedValue({
      ...row({
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1", note: "既存のメモ" }],
      }),
      resultConfig: { ...resultConfig, note: { enabled: false } },
    });
    updateMany.mockResolvedValue({ count: 1 });

    await Effect.runPromiseExit(
      updateResultDetailInDb(ids, { ...input, note: "新しいメモ" }),
    );

    const written = updateMany.mock.calls[0][0].data.results;
    expect(written.matches[0].note).toBe("既存のメモ");
  });

  it("revision が競合したら拒否する", async () => {
    findFirst.mockResolvedValue(
      row({ version: 1, matches: [{ matchId: "m1-0", winnerEntryId: "e1" }] }),
    );
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, input),
    );
    expect(failureTag(exit)).toBe("DivisionRevisionConflictError");
  });

  it("部門が無ければ found: false", async () => {
    findFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      updateResultDetailInDb(ids, input),
    );
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ found: false });
  });
});
