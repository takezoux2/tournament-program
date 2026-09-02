import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const participantFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: {
      findMany: (args: unknown) => findMany(args),
      findFirst: (args: unknown) => findFirst(args),
    },
    participant: {
      findMany: (args: unknown) => participantFindMany(args),
    },
  },
}));

const {
  findDivisionInTournament,
  listDivisionsInTournament,
  listParticipantsInTournament,
} = await import("./repository");

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  participantFindMany.mockReset();
});

describe("listDivisionsInTournament", () => {
  it("組織と大会の両方を where に入れ、order 昇順で引く", async () => {
    findMany.mockResolvedValue([]);

    await listDivisionsInTournament("o1", "t1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });
});

describe("findDivisionInTournament", () => {
  // 所有権を where から外して「引いてから弾く」形に後退すると、
  // 弾き忘れた経路がそのまま越境アクセスの穴になる。
  it("組織・大会・部門の 3 つを where に入れる", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });

  it("Json 3 列と作成日時も select する", async () => {
    findFirst.mockResolvedValue(null);

    await findDivisionInTournament("o1", "t1", "d1");

    const args = findFirst.mock.calls[0][0] as { select: Record<string, true> };
    expect(args.select).toMatchObject({
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
      createdAt: true,
    });
  });
});

describe("listParticipantsInTournament", () => {
  it("組織と大会を where に入れ、表示名を Member から解決する", async () => {
    participantFindMany.mockResolvedValue([
      {
        id: "p1",
        team: "青葉クラブ",
        member: { name: "佐藤 蓮", nameKana: "サトウ レン" },
      },
      {
        id: "p2",
        team: null,
        member: { name: "鈴木 陽菜", nameKana: "スズキ ハルナ" },
      },
    ]);

    const participants = await listParticipantsInTournament("o1", "t1");

    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    // team は bracket 側で省略可能なプロパティなので、null は undefined に畳む。
    expect(participants).toEqual([
      { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", team: "青葉クラブ" },
      { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", team: undefined },
    ]);
  });
});
