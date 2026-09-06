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
    // 3 人なら 3 節 3 試合。勝者参照は 1 つも無い。
    expect(written.matches).toHaveLength(3);
    expect(written.matches.map((match: { id: string }) => match.id)).toEqual([
      "r1-0",
      "r2-0",
      "r3-0",
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
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
