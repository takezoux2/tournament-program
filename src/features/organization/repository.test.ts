import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const memberFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { findMany: (args: unknown) => findMany(args) },
    member: { findMany: (args: unknown) => memberFindMany(args) },
  },
}));

const {
  listMembersInOrganization,
  listMembershipsForUser,
  listOrganizationsForUser,
} = await import("./repository");

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

describe("listMembersInOrganization", () => {
  it("組織を条件に入れて読み順で引く", async () => {
    memberFindMany.mockResolvedValue([]);

    await listMembersInOrganization("o1");

    expect(memberFindMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      orderBy: { nameKana: "asc" },
      select: { id: true, name: true, nameKana: true },
    });
  });
});

describe("listMembershipsForUser", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("userId を where に入れ、参加順に引く", async () => {
    findMany.mockResolvedValue([]);

    await listMembershipsForUser("u1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { joinedAt: "asc" },
      select: {
        joinedAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        permissions: {
          select: { permission: { select: { code: true, description: true } } },
        },
      },
    });
  });

  it("組織と参加日と権限を 1 つの形に均す", async () => {
    findMany.mockResolvedValue([
      {
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        organization: { id: "o1", name: "テニス部", slug: "tennis" },
        permissions: [
          { permission: { code: "user.grant", description: "権限の付与" } },
          { permission: { code: "org.edit", description: "組織の編集" } },
        ],
      },
    ]);

    const result = await listMembershipsForUser("u1");

    expect(result).toEqual([
      {
        id: "o1",
        name: "テニス部",
        slug: "tennis",
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        permissions: [
          { code: "user.grant", description: "権限の付与" },
          { code: "org.edit", description: "組織の編集" },
        ],
      },
    ]);
  });

  it("権限を 1 つも持たない所属も落とさずに返す", async () => {
    // 招待されただけで何も付与されていない状態は正常。ここで消すと
    // 「所属しているのに一覧に出ない」ことになる。
    findMany.mockResolvedValue([
      {
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        organization: { id: "o1", name: "テニス部", slug: "tennis" },
        permissions: [],
      },
    ]);

    const result = await listMembershipsForUser("u1");

    expect(result).toHaveLength(1);
    expect(result[0].permissions).toEqual([]);
  });
});
