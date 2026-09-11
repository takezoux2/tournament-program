import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromSlots } from "../single-elimination/build";

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

const { swapSlotsInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const entries = {
  version: 1,
  entries: ["e1", "e2", "e3", "e4"].map((id, index) => ({
    id,
    participantId: `p${index + 1}`,
    seed: index,
  })),
};

const matchingConfig = buildFromSlots(["e1", "e2", "e3", "e4"].map(entry));

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionFindFirst.mockResolvedValue({
    format: "SINGLE_ELIMINATION",
    entries,
    matchingConfig,
    results: { version: 1, matches: [] },
  });
  participantFindMany.mockResolvedValue(
    entries.entries.map((entry) => ({ id: entry.participantId })),
  );
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("swapSlotsInDb", () => {
  it("指定した 2 スロットを入れ替えて木を組み立て直す", async () => {
    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 0, indexB: 3 }),
    );

    expect(result).toEqual({ found: true, value: { swapped: true } });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches[0].slots).toEqual([entry("e4"), entry("e2")]);
    expect(written.matches[1].slots).toEqual([entry("e3"), entry("e1")]);
  });

  it("エントリーには手を触れない", async () => {
    await Effect.runPromise(swapSlotsInDb(ids, { indexA: 0, indexB: 1 }));

    expect(divisionUpdateMany.mock.calls[0][0].data.entries).toEqual(entries);
  });

  it("範囲外の添字なら書き込まない", async () => {
    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 0, indexB: 99 }),
    );

    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("同じ添字なら書き込まない", async () => {
    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 2, indexB: 2 }),
    );

    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグの部門では入れ替えを受け付けない", async () => {
    // 1 回戦スロットの入れ替えは総当たりに意味が無い。setup-store の
    // 形式チェックが広がったぶん、このスライスで弾く。
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: { version: 1, entries: [] },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 0, indexB: 1 }),
    );

    // setup-store は 2 形式を通すので、スライスからは found: false を返せない。
    // 「何も起きなかった」という既存の応答に倒す。端まで来ているケースと
    // 区別が付かないため、リーグの部門であることも漏れない。
    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("format は SINGLE_ELIMINATION でもリーグの星取表を持つ部門は弾く", async () => {
    // /edit は format を無条件に書き換えられるので、ROUND_ROBIN で組んだ
    // 星取表を持ったまま SINGLE_ELIMINATION になった部門が存在しうる。
    // toSlots は 1 回戦しか見ないため、通すと 2 節目以降が丸ごと消える。
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "1",
            slots: [entry("e1"), entry("e2")],
          },
          {
            id: "r2-0",
            bracket: "winners",
            round: 2,
            order: 0,
            matchName: "2",
            slots: [entry("e1"), entry("e3")],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });

    const result = await Effect.runPromise(
      swapSlotsInDb(ids, { indexA: 0, indexB: 1 }),
    );

    // ここも「入れ替えられない」という既存の応答と区別しない。
    expect(result).toEqual({ found: true, value: { swapped: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
