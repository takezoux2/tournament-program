import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFromSlots } from "../single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const participantFindMany = vi.fn();

// シングルエリミはこの経路では編集しない（1 回戦スライスで組む）ため、
// 汎用の振る舞いはダブルエリミ・リーグで確かめる。
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

const { reorderEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("reorderEntryInDb", () => {
  it("シード順を入れ替える", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildFromSlots([
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ]),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    const written = divisionUpdateMany.mock.calls[0][0].data.entries;
    expect(written.entries.map((entry: { id: string }) => entry.id)).toEqual([
      "e2",
      "e1",
    ]);
  });

  it("ダブルエリミは並べ替えても組み合わせを作り直さない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, matching: "unchanged" },
    });
  });

  it("組み合わせには手を触れない（ダブルエリミ）", async () => {
    const matchingConfig = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]);
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig,
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    // スロットは entryId を直接持つので、seed を変えても壊れない。
    // setup-store は読み出し時に Json を検証済みの形へ作り直すため、
    // 参照そのものは test 側の変数と一致しない。内容の一致で確かめる。
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written).toEqual(matchingConfig);
  });

  it("シングルエリミでは何もしない（1 回戦スライスで編集する）", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildFromSlots([
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ]),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({ found: true, value: { moved: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグは新しいシード順で対戦表を作り直す", async () => {
    // 円卓法の割り当てはシード順から決まる。触らないとエントリー欄と
    // 対戦表が食い違ったままになる。
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
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "e2" },
              { kind: "entry", entryId: "e3" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e3", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, matching: "regenerated" },
    });
    expect(
      divisionUpdateMany.mock.calls[0][0].data.matchingConfig.matches,
    ).toHaveLength(3);
  });

  it("リーグの上限を超えたエントリーが残っていれば、並べ替えても組み合わせは空にする", async () => {
    // 128 人のトーナメントを /edit で ROUND_ROBIN に切り替えた直後の部門は、
    // 生成ボタンを経由していない上限超過のエントリーとブラケット形の
    // matchingConfig を持つ。並べ替えはエントリー数を変えないので、
    // これが唯一 clearedOverCap に到達する経路になる。
    const entries = Array.from({ length: 17 }, (_, index) => ({
      id: `e${index + 1}`,
      participantId: `p${index + 1}`,
      seed: index,
    }));
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: { version: 1, entries },
      matchingConfig: buildFromSlots(
        entries.map((entry) => ({ kind: "entry" as const, entryId: entry.id })),
      ),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(
      entries.map((entry) => ({ id: entry.participantId })),
    );

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, matching: "clearedOverCap" },
    });
    expect(
      divisionUpdateMany.mock.calls[0][0].data.matchingConfig.matches,
    ).toEqual([]);
  });

  it("組み合わせが未作成なら作り直さない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e2", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: true, matching: "unchanged" },
    });
  });

  it("端まで来ていたら書き込まない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildFromSlots([
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ]),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      reorderEntryInDb(ids, { entryId: "e1", direction: "up" }),
    );

    expect(result).toEqual({
      found: true,
      value: { moved: false },
    });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });
});
