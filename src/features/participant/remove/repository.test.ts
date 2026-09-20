import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantFindFirst = vi.fn();
const participantDelete = vi.fn();
const divisionFindMany = vi.fn();

const tx = {
  participant: {
    findFirst: (args: unknown) => participantFindFirst(args),
    delete: (args: unknown) => participantDelete(args),
  },
  division: { findMany: (args: unknown) => divisionFindMany(args) },
};

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  },
}));

const { removeParticipantInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const entriesJson = (participantIds: string[]) => ({
  version: 1,
  entries: participantIds.map((participantId, index) => ({
    id: `e${index}`,
    participantId,
    seed: index,
  })),
});

describe("removeParticipantInDb", () => {
  beforeEach(() => {
    participantFindFirst.mockReset();
    participantDelete.mockReset();
    divisionFindMany.mockReset();
    participantFindFirst.mockResolvedValue({ id: "p1" });
    divisionFindMany.mockResolvedValue([]);
    participantDelete.mockResolvedValue({ id: "p1" });
  });

  it("組織と大会の所有権を where に入れて引く", async () => {
    await Effect.runPromise(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(participantFindFirst).toHaveBeenCalledWith({
      where: {
        id: "p1",
        tournament: { id: "t1", organizationId: "o1" },
      },
      select: { id: true },
    });
  });

  it("対象が無ければ ParticipantNotFoundError", async () => {
    participantFindFirst.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p9" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantNotFoundError");
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("どの部門にも居なければ削除する", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p2"]) },
    ]);

    await Effect.runPromise(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(participantDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("エントリー済みなら削除せず、部門名を並べて返す", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p1"]) },
      { id: "d2", name: "女子の部", entries: entriesJson(["p2"]) },
      { id: "d3", name: "団体戦", entries: entriesJson(["p1"]) },
    ]);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantEnteredError");
    expect(String(exit)).toContain("男子の部");
    expect(String(exit)).toContain("団体戦");
    expect(String(exit)).not.toContain("女子の部");
    expect(participantDelete).not.toHaveBeenCalled();
  });

  it("Json が壊れた部門があれば削除を止める", async () => {
    // 読み飛ばすと「壊れた部門にエントリー済みの参加者」を消せてしまい、
    // エントリー済みの検査そのものが素通りする。
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "壊れた部門", entries: { version: 1, entries: "x" } },
    ]);

    const exit = await Effect.runPromiseExit(
      removeParticipantInDb(ids, { participantId: "p1" }),
    );

    expect(exit._tag).toBe("Failure");
    expect(String(exit)).toContain("ParticipantDataError");
    expect(participantDelete).not.toHaveBeenCalled();
  });
});
