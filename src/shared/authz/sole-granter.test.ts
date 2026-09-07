import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionFindMany = vi.fn();
const organizationFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUserPermission: {
      findMany: (args: unknown) => permissionFindMany(args),
    },
    organization: { findMany: (args: unknown) => organizationFindMany(args) },
  },
}));

const { findSoleGranterOrganizations } = await import("./sole-granter");

describe("findSoleGranterOrganizations", () => {
  beforeEach(() => {
    permissionFindMany.mockReset();
    organizationFindMany.mockReset();
    organizationFindMany.mockResolvedValue([]);
  });

  it("user.grant を 1 つも持たなければ、組織を引かずに空を返す", async () => {
    permissionFindMany.mockResolvedValueOnce([]);

    const result = await findSoleGranterOrganizations("u1");

    expect(result).toEqual([]);
    expect(permissionFindMany).toHaveBeenCalledTimes(1);
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("自分が持つ user.grant を organizationId だけ引く", async () => {
    permissionFindMany.mockResolvedValueOnce([]);

    await findSoleGranterOrganizations("u1");

    expect(permissionFindMany).toHaveBeenNthCalledWith(1, {
      where: { userId: "u1", permission: { code: "user.grant" } },
      select: { organizationId: true },
    });
  });

  it("他にも保持者が居る組織は返さない", async () => {
    permissionFindMany
      .mockResolvedValueOnce([{ organizationId: "o1" }])
      .mockResolvedValueOnce([{ organizationId: "o1" }]);

    const result = await findSoleGranterOrganizations("u1");

    expect(result).toEqual([]);
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("他に保持者が居ない組織だけを返す", async () => {
    permissionFindMany
      .mockResolvedValueOnce([
        { organizationId: "o1" },
        { organizationId: "o2" },
      ])
      // o2 には他の保持者が居る。
      .mockResolvedValueOnce([{ organizationId: "o2" }]);
    organizationFindMany.mockResolvedValue([
      { id: "o1", name: "テニス部", slug: "tennis" },
    ]);

    const result = await findSoleGranterOrganizations("u1");

    expect(organizationFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["o1"] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([{ id: "o1", name: "テニス部", slug: "tennis" }]);
  });

  it("他の保持者を数えるとき、自分自身は除く", async () => {
    permissionFindMany
      .mockResolvedValueOnce([{ organizationId: "o1" }])
      .mockResolvedValueOnce([]);

    await findSoleGranterOrganizations("u1");

    expect(permissionFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: { in: ["o1"] },
        permission: { code: "user.grant" },
        userId: { not: "u1" },
      },
      select: { organizationId: true },
    });
  });
});
