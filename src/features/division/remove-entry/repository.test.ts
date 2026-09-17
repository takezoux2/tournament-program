import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDoubleElimination } from "../double-elimination/build";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";

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

const { removeEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const withEntries = (count: number) => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const participantsFor = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }));

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  participantFindMany.mockReset();
  divisionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("removeEntryInDb", () => {
  it("エントリーを外して seed を 0 から詰め直す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(4));

    await Effect.runPromise(removeEntryInDb(ids, { entryId: "e2" }));

    const written = divisionUpdateMany.mock.calls[0][0].data.entries;
    expect(written.entries.map((item: { id: string }) => item.id)).toEqual([
      "e1",
      "e3",
      "e4",
    ]);
    expect(written.entries.map((item: { seed: number }) => item.seed)).toEqual([
      0, 1, 2,
    ]);
  });

  it("組み合わせがあれば残りのシード順から作り直す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: withEntries(4),
      matchingConfig: buildFromSlots(["e1", "e2", "e3", "e4"].map(entry)),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(4));

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "regenerated" },
    });
    // 残り 3 人なので 4 枠に bye が 1 つ入る形へ作り直される。
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches[0].slots).toEqual([entry("e1"), { kind: "bye" }]);
  });

  it("残りが 2 人未満になったら組み合わせを空にする", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: withEntries(2),
      matchingConfig: buildFromSlots(["e1", "e2"].map(entry)),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(2));

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    // 除去前は matches.length > 0 だが、除去後は 2 人未満で木が作れず空になる。
    // 除去前だけを見て "regenerated" と報告すると、画面が「再生成しました」と
    // 嘘をつく。除去後の結果で "cleared" と言い分けていることを確認する。
    // minimum はトーナメントの下限（2）。
    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "cleared", minimum: 2 },
    });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches).toEqual([]);
  });

  it("ダブルエリミネーションは残りが形式の下限（3人）を下回ったら組み合わせを空にする", async () => {
    // ダブルエリミは 2 人だと敗者側が作れず、SINGLE_ELIMINATION より下限が高い（3人）。
    // "cleared" の通知が「2 人未満」を決め打ちすると、3人→2人でも
    // まだ 2 人「以上」残っているのに嘘の文言になる。形式ごとの minimum が
    // 結果に乗っていることを確かめる。
    const threeEntries = withEntries(3);
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: threeEntries,
      matchingConfig: buildDoubleElimination(
        generateSlots(threeEntries.entries),
        "grandFinal",
      ),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(3));

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "cleared", minimum: 3 },
    });
    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches).toEqual([]);
  });

  it("組み合わせが未作成なら再生成しない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(4));

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "unchanged" },
    });
  });

  it("知らない entryId なら何も書き込まない", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "SINGLE_ELIMINATION",
      entries: withEntries(4),
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(participantsFor(4));

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "unknown" }),
    );

    // 存在を漏らさないため、無い対象の削除はエラーにせず黙って何もしない。
    // removed: false は handler が「通知を出さない」判断に使う。
    expect(result).toEqual({ found: true, value: { removed: false } });
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグは残りのシード順から総当たりを作り直す", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
          { id: "e3", participantId: "p3", seed: 2 },
          { id: "e4", participantId: "p4", seed: 3 },
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
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e4" },
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
      { id: "p4" },
    ]);

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e4" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "regenerated" },
    });
    // 残り 3 人の総当たりは 3 試合。
    expect(
      divisionUpdateMany.mock.calls[0][0].data.matchingConfig.matches,
    ).toHaveLength(3);
  });

  it("リーグの上限を超えたエントリーが残っていれば、削除しても組み合わせは空のまま", async () => {
    // 128 人のトーナメントを /edit で ROUND_ROBIN に切り替えた直後の部門は、
    // 生成ボタンを経由していない上限超過のエントリーとブラケット形の
    // matchingConfig を持つ。1 人消しても 127 人でまだ上限（16 人）を超えて
    // いるため、regenerateMatching は空を返す。運営者は上限以下になるまで
    // 削除を続けられる必要があるので、削除自体は成功し続けることを確かめる。
    const entries = Array.from({ length: 128 }, (_, index) => ({
      id: `e${index + 1}`,
      participantId: `p${index + 1}`,
      seed: index,
    }));
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: { version: 1, entries },
      matchingConfig: buildFromSlots(entries.map((e) => entry(e.id))),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(
      entries.map((e) => ({ id: e.participantId })),
    );

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e1" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "clearedOverCap", limit: 16 },
    });
    const written = divisionUpdateMany.mock.calls[0][0].data;
    expect(written.matchingConfig.matches).toEqual([]);
    // 削除そのものは反映されている（運営者が上限以下まで減らしていける）。
    expect(written.entries.entries).toHaveLength(127);
  });

  it("ダブルエリミネーションの上限を超えたエントリーが残っていれば、削除しても組み合わせは空のまま", async () => {
    // SINGLE_ELIMINATION（128 人まで）を /edit で DOUBLE_ELIMINATION_GRAND_FINAL
    // （64 人まで）に切り替えた直後の部門は、生成ボタンを経由していない
    // 上限超過のエントリーと肥大化したブラケット形の matchingConfig を持ちうる。
    // 1 人消しても 69 人でまだ上限（64 人）を超えているため、
    // regenerateMatching は空を返し、リーグと同じく clearedOverCap になる。
    const entries = Array.from({ length: 70 }, (_, index) => ({
      id: `e${index + 1}`,
      participantId: `p${index + 1}`,
      seed: index,
    }));
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: { version: 1, entries },
      matchingConfig: buildDoubleElimination(
        generateSlots(entries),
        "grandFinal",
      ),
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue(
      entries.map((e) => ({ id: e.participantId })),
    );

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e1" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "clearedOverCap", limit: 64 },
    });
    const written = divisionUpdateMany.mock.calls[0][0].data;
    expect(written.matchingConfig.matches).toEqual([]);
    expect(written.entries.entries).toHaveLength(69);
  });

  it("リーグでも残りが 2 人未満なら組み合わせを空にする", async () => {
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
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });
    participantFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);

    const result = await Effect.runPromise(
      removeEntryInDb(ids, { entryId: "e2" }),
    );

    expect(result).toEqual({
      found: true,
      value: { removed: true, matching: "cleared", minimum: 2 },
    });
  });
});
