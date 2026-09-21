import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { buildDoubleElimination } from "../double-elimination/build";
import { buildFromSlots } from "../single-elimination/build";

const divisionFindFirst = vi.fn();
const divisionUpdateMany = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const participantFindFirst = vi.fn();
const participantCreate = vi.fn();
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
        member: {
          findFirst: (args: unknown) => memberFindFirst(args),
          create: (args: unknown) => memberCreate(args),
        },
        participant: {
          findFirst: (args: unknown) => participantFindFirst(args),
          create: (args: unknown) => participantCreate(args),
          findMany: (args: unknown) => participantFindMany(args),
        },
      }),
  },
}));

const { addEntryInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1", divisionId: "d1" };

const entry = (id: string) => ({ kind: "entry" as const, entryId: id });
const bye = { kind: "bye" as const };

const empty = {
  format: "DOUBLE_ELIMINATION_GRAND_FINAL" as const,
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
};

beforeEach(() => {
  divisionFindFirst.mockReset();
  divisionUpdateMany.mockReset();
  memberFindFirst.mockReset();
  memberCreate.mockReset();
  participantFindFirst.mockReset();
  participantCreate.mockReset();
  participantFindMany.mockReset();

  divisionFindFirst.mockResolvedValue(empty);
  divisionUpdateMany.mockResolvedValue({ count: 1 });
  memberFindFirst.mockResolvedValue({ id: "m1" });
  participantFindFirst.mockResolvedValue(null);
  participantCreate.mockResolvedValue({ id: "p1" });
  // playerNumber 集計と save() の participantId 検証を同じ mock が兼ねる。
  // playerNumber が無い行は採番の集計から無視されるので、この 1 件だけでも
  // 「既存の参加者なし」と「作成した p1 を検証で認める」の両方を満たせる。
  participantFindMany.mockResolvedValue([{ id: "p1" }]);
});

describe("addEntryInDb", () => {
  it("既存メンバーは組織を条件に入れて引く", async () => {
    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: "m1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("組織に無いメンバーを指定したら拒否する", async () => {
    memberFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(failureTag(exit)).toBe("DivisionMemberNotFoundError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("新規登録なら Member を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m9" });

    await Effect.runPromise(
      addEntryInDb(ids, {
        mode: "new",
        name: "山田太郎",
        nameKana: "やまだたろう",
      }),
    );

    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "o1",
        name: "山田太郎",
        nameKana: "やまだたろう",
      },
      select: { id: true },
    });
  });

  it("Participant が無ければ seed を付けずに作る", async () => {
    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    // Participant.seed は @@unique([tournamentId, seed]) を持つ。自動採番すると
    // 衝突するので null のままにし、部門内の順序は DivisionEntry.seed が持つ。
    expect(participantCreate).toHaveBeenCalledWith({
      data: { tournamentId: "t1", memberId: "m1", playerNumber: "1" },
      select: { id: true },
    });
  });

  it("Participant が既にあれば作らず使い回す", async () => {
    participantFindFirst.mockResolvedValue({ id: "p7" });
    participantFindMany.mockResolvedValue([{ id: "p7" }]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).not.toHaveBeenCalled();
    const written = divisionUpdateMany.mock.calls[0][0].data.entries;
    expect(written.entries[0].participantId).toBe("p7");
  });

  it("エントリーを末尾の seed で足す", async () => {
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
    participantCreate.mockResolvedValue({ id: "p3" });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    const written = divisionUpdateMany.mock.calls[0][0].data.entries;
    expect(written.entries).toHaveLength(3);
    expect(written.entries[2].seed).toBe(2);
    expect(written.entries[2].participantId).toBe("p3");
  });

  it("組み合わせがあれば一番下の bye を埋める", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [
          { id: "e1", participantId: "p1", seed: 0 },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      matchingConfig: buildDoubleElimination(
        [entry("e1"), bye, entry("e2"), bye],
        "grandFinal",
      ),
      results: { version: 1, matches: [] },
    });
    participantCreate.mockResolvedValue({ id: "p3" });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    const data = divisionUpdateMany.mock.calls[0][0].data;
    const added = data.entries.entries[2].id;
    expect(data.matchingConfig.matches[1].slots[1]).toEqual({
      kind: "entry",
      entryId: added,
    });
    // bye を埋めるだけでも buildSlotBracket が木を丸ごと組み立て直すため、
    // 手で振った試合名は失われる。regenerated はその事実を伝える。
    expect(result).toEqual({ found: true, value: { regenerated: true } });
  });

  it("組み合わせが未作成なら組み合わせは空のまま", async () => {
    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    expect(written.matches).toEqual([]);
    expect(result).toEqual({ found: true, value: { regenerated: false } });
  });

  it("同じ参加者の二重エントリーを拒否する", async () => {
    participantFindFirst.mockResolvedValue({ id: "p1" });
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(failureTag(exit)).toBe("DivisionDuplicateEntryError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("ダブルエリミは 64 人に達していたら拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: Array.from({ length: 64 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(failureTag(exit)).toBe("DivisionEntryLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグは 16 人を超える追加を拒否する", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: Array.from({ length: 16 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });

    const exit = await Effect.runPromiseExit(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(failureTag(exit)).toBe("DivisionEntryLimitError");
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("ダブルエリミは 16 人でも追加できる", async () => {
    divisionFindFirst.mockResolvedValue({
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries: {
        version: 1,
        entries: Array.from({ length: 16 }, (_, index) => ({
          id: `e${index}`,
          participantId: `p${index}`,
          seed: index,
        })),
      },
      matchingConfig: { version: 1, matches: [] },
      results: { version: 1, matches: [] },
    });
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "pNew" });
    participantFindMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, index) => ({ id: `p${index}` })).concat([
        { id: "pNew" },
      ]),
    );

    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(result).toEqual({ found: true, value: { regenerated: false } });
  });

  it("シングルエリミでは何もしない（1 回戦スライスで編集する）", async () => {
    divisionFindFirst.mockResolvedValue({
      ...empty,
      format: "SINGLE_ELIMINATION",
      entries: {
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 0 }],
      },
      matchingConfig: buildFromSlots([entry("e1"), bye]),
    });

    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(result).toEqual({ found: true, value: { regenerated: false } });
    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(divisionUpdateMany).not.toHaveBeenCalled();
  });

  it("リーグは組み合わせがあると丸ごと作り直す", async () => {
    // 1 人増えれば全員の試合が増えるので、席を 1 つ埋める操作が無い。
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
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue({ id: "p3" });
    participantFindMany.mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
    ]);

    const result = await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    const written = divisionUpdateMany.mock.calls[0][0].data.matchingConfig;
    // 3 人の総当たりは 3 試合。
    expect(written.matches).toHaveLength(3);
    // 手で振った試合名が消えたことを画面へ伝えるためのフラグ。
    expect(result).toEqual({ found: true, value: { regenerated: true } });
  });
});

describe("playerNumber の採番", () => {
  it("最初の参加者は 1", async () => {
    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "1" }),
      }),
    );
  });

  it("数値として読める最大の番号 + 1 を振る", async () => {
    // playerNumber の集計用の行と、save() の participantId 検証用の行
    // （作成される p1）を同じ配列に同居させる。
    participantFindMany.mockResolvedValue([
      { id: "p2", playerNumber: "2" },
      { id: "p10", playerNumber: "10" },
      { id: "p1" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "11" }),
      }),
    );
  });

  it("数値でない番号は最大値の計算から除外する", async () => {
    participantFindMany.mockResolvedValue([
      { id: "pA", playerNumber: "A-99" },
      { id: "pB", playerNumber: "3" },
      { id: "p1" },
    ]);

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ playerNumber: "4" }),
      }),
    );
  });

  it("既存の Participant を使い回すときは採番しない", async () => {
    participantFindFirst.mockResolvedValue({ id: "p1" });

    await Effect.runPromise(
      addEntryInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).not.toHaveBeenCalled();
  });
});
