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

const { listTournamentsInOrganization, findTournamentInOrganization } =
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
});
