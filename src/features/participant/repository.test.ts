import { describe, expect, it, vi } from "vitest";

const participantFindMany = vi.fn();
const divisionFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    participant: { findMany: (args: unknown) => participantFindMany(args) },
    division: { findMany: (args: unknown) => divisionFindMany(args) },
  },
}));

const { listParticipantsWithDivisions } = await import("./repository");

const participantRow = (
  id: string,
  playerNumber: string,
  name = "竹添",
  team: string | null = null,
) => ({
  id,
  team,
  playerNumber,
  member: { name, nameKana: "たけぞえ" },
});

const entriesJson = (participantIds: string[]) => ({
  version: 1,
  entries: participantIds.map((participantId, index) => ({
    id: `e${index}`,
    participantId,
    seed: index,
  })),
});

describe("listParticipantsWithDivisions", () => {
  it("組織と大会の所有権を where に入れて読む", async () => {
    // organizationId を落とすと他組織の大会の名簿まで見えてしまう。
    participantFindMany.mockResolvedValue([]);
    divisionFindMany.mockResolvedValue([]);

    await listParticipantsWithDivisions("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith({
      where: { tournament: { id: "t1", organizationId: "o1" } },
      select: {
        id: true,
        team: true,
        playerNumber: true,
        member: { select: { name: true, nameKana: true } },
      },
    });
    expect(divisionFindMany).toHaveBeenCalledWith({
      where: { tournament: { id: "t1", organizationId: "o1" } },
      orderBy: { order: "asc" },
      select: { id: true, name: true, entries: true },
    });
  });

  it("出場部門を Division.order 昇順で積む", async () => {
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p1"]) },
      { id: "d2", name: "女子の部", entries: entriesJson(["p1"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].divisions).toEqual([
      { id: "d1", name: "男子の部" },
      { id: "d2", name: "女子の部" },
    ]);
  });

  it("どの部門にも居ない参加者は空配列になる", async () => {
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "男子の部", entries: entriesJson(["p2"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].divisions).toEqual([]);
  });

  it("選手番号の自然順で返す", async () => {
    // 文字列順だと "10" が "2" より前に来てしまう。
    participantFindMany.mockResolvedValue([
      participantRow("p1", "10"),
      participantRow("p2", "2"),
    ]);
    divisionFindMany.mockResolvedValue([]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result.map((row) => row.playerNumber)).toEqual(["2", "10"]);
  });

  it("team の null は運ばない", async () => {
    participantFindMany.mockResolvedValue([
      participantRow("p1", "1", "竹添", null),
      participantRow("p2", "2", "山田", "A中学"),
    ]);
    divisionFindMany.mockResolvedValue([]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result[0].team).toBeUndefined();
    expect(result[1].team).toBe("A中学");
  });

  it("Json が壊れた部門は読み飛ばし、名簿と他の部門は返す", async () => {
    // 1 部門の Json が壊れただけで名簿ごと 500 にするのは釣り合わない。
    participantFindMany.mockResolvedValue([participantRow("p1", "1")]);
    divisionFindMany.mockResolvedValue([
      { id: "d1", name: "壊れた部門", entries: { version: 1, entries: "x" } },
      { id: "d2", name: "女子の部", entries: entriesJson(["p1"]) },
    ]);

    const result = await listParticipantsWithDivisions("o1", "t1");

    expect(result).toHaveLength(1);
    expect(result[0].divisions).toEqual([{ id: "d2", name: "女子の部" }]);
  });
});
