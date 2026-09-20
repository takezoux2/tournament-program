import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tournamentFindFirst = vi.fn();
const memberFindFirst = vi.fn();
const memberCreate = vi.fn();
const participantFindFirst = vi.fn();
const participantFindMany = vi.fn();
const participantCreate = vi.fn();

const tx = {
  tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
  member: {
    findFirst: (args: unknown) => memberFindFirst(args),
    create: (args: unknown) => memberCreate(args),
  },
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    findMany: (args: unknown) => participantFindMany(args),
    create: (args: unknown) => participantCreate(args),
  },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  },
}));

const { addParticipantInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

describe("addParticipantInDb", () => {
  beforeEach(() => {
    for (const fn of [
      tournamentFindFirst,
      memberFindFirst,
      memberCreate,
      participantFindFirst,
      participantFindMany,
      participantCreate,
    ]) {
      fn.mockReset();
    }
    tournamentFindFirst.mockResolvedValue({ id: "t1" });
    memberFindFirst.mockResolvedValue({ id: "m1" });
    participantFindFirst.mockResolvedValue(null);
    participantFindMany.mockResolvedValue([]);
    participantCreate.mockResolvedValue({ id: "p1" });
  });

  it("組織に属さない大会なら found: false を返す", async () => {
    // 存在しないことと権限が無いことを区別させない。
    tournamentFindFirst.mockResolvedValue(null);

    const result = await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(result).toEqual({ found: false });
    expect(tournamentFindFirst).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("既存メンバーは組織を where に入れて引く", async () => {
    await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: "m1", organizationId: "o1" },
      select: { id: true },
    });
  });

  it("他組織のメンバー ID なら ParticipantMemberNotFoundError", async () => {
    memberFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      addParticipantInDb(ids, { mode: "existing", memberId: "m9" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantMemberNotFoundError");
  });

  it("新規登録はこの組織に Member を作る", async () => {
    memberCreate.mockResolvedValue({ id: "m2" });

    await Effect.runPromise(
      addParticipantInDb(ids, {
        mode: "new",
        name: "竹添",
        nameKana: "たけぞえ",
      }),
    );

    expect(memberCreate).toHaveBeenCalledWith({
      data: { organizationId: "o1", name: "竹添", nameKana: "たけぞえ" },
      select: { id: true },
    });
  });

  it("同じ大会に同じメンバーが居れば ParticipantDuplicateError", async () => {
    participantFindFirst.mockResolvedValue({ id: "p0" });

    const exit = await Effect.runPromiseExit(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantDuplicateError");
    expect(participantCreate).not.toHaveBeenCalled();
  });

  it("既存の選手番号の次を振り、seed は付けない", async () => {
    // seed を入れると @@unique([tournamentId, seed]) と衝突する。
    participantFindMany.mockResolvedValue([
      { playerNumber: "1" },
      { playerNumber: "10" },
    ]);

    const result = await Effect.runPromise(
      addParticipantInDb(ids, { mode: "existing", memberId: "m1" }),
    );

    expect(participantCreate).toHaveBeenCalledWith({
      data: { tournamentId: "t1", memberId: "m1", playerNumber: "11" },
      select: { id: true },
    });
    expect(result).toEqual({ found: true, value: { participantId: "p1" } });
  });
});
