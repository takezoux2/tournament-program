import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { removeUserInDb } = await import("./repository");

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
