import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

// setup-store 経由で実際に組み立てまで走らせるため、mock するのは
// Prisma の境界だけにする（setup-store 自体はモックしない）。
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

const { generateMatchingInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entries = (count: number) => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const participants = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }));

/** 失敗した Exit から DivisionNotEnoughEntriesError.minimum を取り出す。 */
const minimumOf = (exit: unknown): number =>
  (exit as { cause: { error: { minimum: number } } }).cause.error.minimum;

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("generateMatchingInDb", () => {
  it("エントリーのシード順から木を組み立てる", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: entries(4),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participants(4));

    await Effect.runPromise(generateMatchingInDb(ids));

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches).toHaveLength(3);
    expect(written.matches[0].slots).toEqual([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e4" },
    ]);
  });

  it("エントリーはそのまま持ち越す", async () => {
    const current = entries(4);
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: current,
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participants(4));

    await Effect.runPromise(generateMatchingInDb(ids));

    expect(divisionUpdateMany.mock.calls[0][0].data.entries).toEqual(current);
  });

  it("2 人未満なら拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: entries(1),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(generateMatchingInDb(ids));

    expect(failureTag(exit)).toBe("DivisionNotEnoughEntriesError");
    expect(minimumOf(exit)).toBe(2);
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグの部門は総当たりの組み合わせを書く", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
          { id: "e3", participantId: "p3", seed: 2 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    await Effect.runPromise(generateMatchingInDb(ids));

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 3 人なら 3 試合。節は保存しない（round は常に 1）。勝者参照は 1 つも無い。
    expect(written.matches).toHaveLength(3);
    expect(written.matches.map((match: { id: string }) => match.id)).toEqual([
      "r1-0",
      "r1-1",
      "r1-2",
    ]);
  });

  it("リーグでも 2 人未満は拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(generateMatchingInDb(ids));

    expect(failureTag(exit)).toBe("DivisionNotEnoughEntriesError");
    expect(minimumOf(exit)).toBe(2);
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグはちょうど 16 人なら生成できる", async () => {
    // 上限チェックは `>` であって `>=` ではない。境界を実際に踏んで固定する。
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: entries(16),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participants(16));

    await Effect.runPromise(generateMatchingInDb(ids));

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 16 人の総当たりは 16*15/2 = 120 試合。
    expect(written.matches).toHaveLength(120);
  });

  it("トーナメントはちょうど 128 人なら生成できる", async () => {
    // こちらも `>` と `>=` の境界を実際に踏んで固定する。
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: entries(128),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participants(128));

    await Effect.runPromise(generateMatchingInDb(ids));

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 128 人の 1 回戦は 64 試合、木全体では 127 試合。
    expect(
      written.matches.filter((match: { round: number }) => match.round === 1),
    ).toHaveLength(64);
    expect(written.matches).toHaveLength(127);
  });

  it("リーグは 16 人を超えるエントリーでの生成を拒否する", async () => {
    // 128 人のトーナメントを /edit で ROUND_ROBIN に切り替えたあと
    // 生成を押すと、add-entry の上限チェックを経由せずに 8128 試合の
    // 総当たりが組み立てられてしまう。生成の直前でも弾く必要がある。
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: Array.from({ length: 17 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(generateMatchingInDb(ids));

    expect(failureTag(exit)).toBe("DivisionEntryLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
