import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const create = vi.fn();
const findManyPermission = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organizationUser: { create: (args: unknown) => create(args) },
    permission: { findMany: (args: unknown) => findManyPermission(args) },
  },
}));

const { addUserInDb } = await import("./repository");

const input = { userId: "u1", organizationId: "o1" };

describe("addUserInDb", () => {
  beforeEach(() => {
    create.mockReset();
    findManyPermission.mockReset();
    findManyPermission.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    create.mockResolvedValue({ userId: "u1" });
  });

  it("所属行と全権限を 1 回の nested write でまとめて作る", async () => {
    // 所属だけ作って権限が入らない実装に後退すると、追加直後に
    // 何もできないユーザーが生まれる。
    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: "o1",
          userId: "u1",
          permissions: {
            create: [{ permissionId: 1 }, { permissionId: 2 }],
          },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("P2002 は AlreadyMember に写す", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("AlreadyMember");
  });

  it("P2003 は UserNotFound に写す（追加直前にユーザーが消えた場合）", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "7.10.0",
      }),
    );

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("UserNotFound");
  });

  it("それ以外の例外は UnexpectedOrganizationUserError に写す", async () => {
    create.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(addUserInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
