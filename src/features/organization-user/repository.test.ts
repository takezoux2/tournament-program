import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyOrganizationUser = vi.fn();
const findFirstOrganizationUser = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: {
      findMany: (args: unknown) => findManyOrganizationUser(args),
      findFirst: (args: unknown) => findFirstOrganizationUser(args),
    },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { findOrganizationUser, listAllPermissions, listUsersInOrganization } =
  await import("./repository");

const row = {
  joinedAt: new Date("2026-08-01T00:00:00Z"),
  user: {
    id: "u1",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
  },
  permissions: [
    { permission: { code: "user.view" } },
    { permission: { code: "user.add" } },
  ],
};

describe("listUsersInOrganization", () => {
  beforeEach(() => {
    findManyOrganizationUser.mockReset();
  });

  it("organizationId で絞り込み、参加順に返す", async () => {
    findManyOrganizationUser.mockResolvedValue([row]);

    const users = await listUsersInOrganization("o1");

    expect(findManyOrganizationUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1" },
        orderBy: { joinedAt: "asc" },
      }),
    );
    expect(users).toEqual([
      {
        userId: "u1",
        name: "竹添",
        username: "takezo",
        email: "takezo@example.com",
        image: null,
        permissionCodes: ["user.view", "user.add"],
        joinedAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
  });

  it("権限が 0 件でも空配列として返す", async () => {
    findManyOrganizationUser.mockResolvedValue([{ ...row, permissions: [] }]);

    const users = await listUsersInOrganization("o1");

    expect(users[0].permissionCodes).toEqual([]);
  });
});

describe("listAllPermissions", () => {
  beforeEach(() => {
    findManyPermission.mockReset();
  });

  it("id 昇順で全件返す（画面での並びを migration のシード順に固定する）", async () => {
    findManyPermission.mockResolvedValue([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);

    const permissions = await listAllPermissions();

    expect(findManyPermission).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: "asc" } }),
    );
    expect(permissions).toEqual([
      { id: 1, code: "user.view", description: "組織ユーザーの閲覧" },
    ]);
  });
});

describe("findOrganizationUser", () => {
  beforeEach(() => {
    findFirstOrganizationUser.mockReset();
  });

  it("organizationId と userId の両方を where に含めて引く", async () => {
    // 横断アクセス防止の回帰テスト。userId だけで引くと他組織の所属が見える。
    findFirstOrganizationUser.mockResolvedValue(row);

    await findOrganizationUser("o1", "u1");

    expect(findFirstOrganizationUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", userId: "u1" },
      }),
    );
  });

  it("所属していなければ null を返す", async () => {
    findFirstOrganizationUser.mockResolvedValue(null);

    await expect(findOrganizationUser("o1", "u1")).resolves.toBeNull();
  });
});
