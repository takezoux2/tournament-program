import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    tournament: {
      findMany: (args: unknown) => findMany(args),
      findFirst: (args: unknown) => findFirst(args),
    },
  },
}));

const { listTournamentsInOrganization, findTournamentInOrganization, findPublicTournament } =
  await import("./repository");

describe("listTournamentsInOrganization", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("organizationId を where に含めて絞り込む", async () => {
    findMany.mockResolvedValue([]);

    await listTournamentsInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1" },
      }),
    );
  });

  it("作成日時の降順（createdAt: desc）で取得する", async () => {
    findMany.mockResolvedValue([]);

    await listTournamentsInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("findTournamentInOrganization", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("id と organizationId の両方を where に含める（横断アクセス防止の回帰テスト）", async () => {
    // organizationId が where から抜け落ちると、id さえ知っていれば他組織の
    // 大会も取得できてしまう。この形なら書き忘れは「見つからない」に倒れる。
    findFirst.mockResolvedValue(null);

    await findTournamentInOrganization("o1", "t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1", organizationId: "o1" },
      }),
    );
  });

  it("見つからない場合は null を返す", async () => {
    findFirst.mockResolvedValue(null);

    await expect(findTournamentInOrganization("o1", "t1")).resolves.toBeNull();
  });

  it("select に description を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findTournamentInOrganization("o1", "t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ description: true }),
      }),
    );
  });
});

describe("findPublicTournament", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("DRAFT を where で除外する（公開範囲の回帰テスト）", async () => {
    // 取得してから status で弾く形にすると、4 ページのうち 1 枚で
    // 書き忘れた箇所がそのまま公開の穴になる。where に置けば
    // 書き忘れは「見つからない」に倒れる。
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1", status: { not: "DRAFT" } },
      }),
    );
  });

  it("見つからない場合は null を返す", async () => {
    findFirst.mockResolvedValue(null);

    await expect(findPublicTournament("t1")).resolves.toBeNull();
  });

  it("organization.name を organizationName へ平して返す", async () => {
    findFirst.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      startsAt: null,
      status: "IN_PROGRESS",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      description: "",
      organizationId: "o1",
      organization: { name: "テニス部" },
    });

    const tournament = await findPublicTournament("t1");

    expect(tournament).toMatchObject({
      id: "t1",
      organizationId: "o1",
      organizationName: "テニス部",
    });
    // ネストしたままにすると、画面側が Prisma の select の形を知ることになる。
    expect(tournament).not.toHaveProperty("organization");
  });

  it("select に description と organizationId を含める", async () => {
    findFirst.mockResolvedValue(null);

    await findPublicTournament("t1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          description: true,
          organizationId: true,
        }),
      }),
    );
  });
});
