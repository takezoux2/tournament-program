import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();
const findManyGrants = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { deleteMany: (args: unknown) => deleteMany(args) },
    organizationUserPermission: {
      findMany: (args: unknown) => findManyGrants(args),
    },
  },
}));

const { countGrantHoldersInDb, removeUserInDb } = await import("./repository");

describe("removeUserInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("organizationId と userId の両方を where に含めて消す", async () => {
    // userId だけで消すと、他組織の所属まで巻き添えで消える。
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", userId: "u1" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 1 });
    }
  });

  it("0 件でもエラーにせず件数として返す（404 判定は handler の仕事）", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 0 });
    }
  });

  it("例外は UnexpectedOrganizationUserError に写す", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      removeUserInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});

describe("countGrantHoldersInDb", () => {
  beforeEach(() => {
    findManyGrants.mockReset();
  });

  it("organizationId と user.grant で絞り、2 件までしか取らない", async () => {
    // organizationId を落とすと他組織の保持者を数えて保護が素通りする。
    findManyGrants.mockResolvedValue([]);

    await Effect.runPromiseExit(
      countGrantHoldersInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(findManyGrants).toHaveBeenCalledWith({
      where: {
        organizationId: "o1",
        permission: { code: "user.grant" },
      },
      select: { userId: true },
      take: 2,
    });
  });

  it("対象だけが保持者なら targetHolds=true / otherHolders=0", async () => {
    findManyGrants.mockResolvedValue([{ userId: "u1" }]);

    const exit = await Effect.runPromiseExit(
      countGrantHoldersInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ targetHolds: true, otherHolders: 0 });
    }
  });

  it("他にも保持者が居れば otherHolders を数える", async () => {
    findManyGrants.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);

    const exit = await Effect.runPromiseExit(
      countGrantHoldersInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ targetHolds: true, otherHolders: 1 });
    }
  });

  it("対象が保持していなければ targetHolds=false", async () => {
    findManyGrants.mockResolvedValue([{ userId: "u2" }]);

    const exit = await Effect.runPromiseExit(
      countGrantHoldersInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ targetHolds: false, otherHolders: 1 });
    }
  });

  it("例外は UnexpectedOrganizationUserError に写す", async () => {
    findManyGrants.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      countGrantHoldersInDb({ userId: "u1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
