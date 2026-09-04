import { describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { findMany: (args: unknown) => findMany(args) },
  },
}));

const { listMembersInOrganization } = await import("./repository");

describe("listMembersInOrganization", () => {
  it("organizationId で絞り、読み順で返す", async () => {
    // organizationId を落とすと他組織のメンバーまで見えてしまう。
    const members = [{ id: "m1", name: "竹添", nameKana: "たけぞえ" }];
    findMany.mockResolvedValue(members);

    const result = await listMembersInOrganization("o1");

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "o1" },
      orderBy: { nameKana: "asc" },
      select: { id: true, name: true, nameKana: true },
    });
    expect(result).toEqual(members);
  });
});
