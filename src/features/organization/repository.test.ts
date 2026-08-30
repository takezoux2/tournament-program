import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { findMany: (args: unknown) => findMany(args) },
  },
}));

const { listOrganizationsForUser } = await import("./repository");

describe("listOrganizationsForUser", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("userId を where に含めて絞り込む（横断アクセス防止の回帰テスト）", async () => {
    // where から userId が抜け落ちると全ユーザーの組織を返してしまうため、
    // ここが崩れたら fail closed ではなく fail open になる。
    findMany.mockResolvedValue([]);

    await listOrganizationsForUser("u1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
      }),
    );
  });

  it("参加日時の昇順（joinedAt: asc）で取得する", async () => {
    findMany.mockResolvedValue([]);

    await listOrganizationsForUser("u1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { joinedAt: "asc" },
      }),
    );
  });

  it("参加行ではなく organization だけを取り出して返す", async () => {
    const organization = { id: "o1", name: "テニス部", slug: "tennis" };
    findMany.mockResolvedValue([
      { userId: "u1", organizationId: "o1", organization },
    ]);

    await expect(listOrganizationsForUser("u1")).resolves.toEqual([
      organization,
    ]);
  });
});
