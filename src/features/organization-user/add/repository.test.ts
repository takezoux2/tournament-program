import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { PERMISSION_CODES } from "@/shared/authz/ability";
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

/** 実際の PERMISSION_CODES から作った Permission 表。id は 1 始まり。 */
const permissionTable = PERMISSION_CODES.map((code, index) => ({
  id: index + 1,
  code,
}));

const idOf = (code: string) =>
  permissionTable.find((row) => row.code === code)?.id;

const input = {
  userId: "u1",
  organizationId: "o1",
  granterCodes: [...PERMISSION_CODES],
};

describe("addUserInDb", () => {
  beforeEach(() => {
    create.mockReset();
    findManyPermission.mockReset();
    // 引数を無視するモックだと where の in 絞り込みが素通りしてしまうので、
    // 受け取った in の一覧で実際に絞る。
    findManyPermission.mockImplementation(
      (args: { where: { code: { in: string[] } } }) =>
        Promise.resolve(
          permissionTable
            .filter((row) => args.where.code.in.includes(row.code))
            .map((row) => ({ id: row.id })),
        ),
    );
    create.mockResolvedValue({ userId: "u1" });
  });

  it("所属行と追加者の権限を 1 回の nested write でまとめて作る", async () => {
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
            create: permissionTable.map((row) => ({ permissionId: row.id })),
          },
        },
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("追加者が持つ権限だけを引き継がせる", async () => {
    // 自分より強いメンバーを作れてしまうと、権限の意味が無くなる。
    await Effect.runPromiseExit(
      addUserInDb({ ...input, granterCodes: ["user.view", "user.add"] }),
    );

    expect(findManyPermission).toHaveBeenCalledWith({
      where: { code: { in: ["user.view", "user.add"] } },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: {
            create: [
              { permissionId: idOf("user.view") },
              { permissionId: idOf("user.add") },
            ],
          },
        }),
      }),
    );
  });

  it("追加者が user.grant を持たなければ、追加された人にも渡らない", async () => {
    await Effect.runPromiseExit(
      addUserInDb({ ...input, granterCodes: ["user.view", "user.add"] }),
    );

    const created = create.mock.calls[0][0].data.permissions.create as {
      permissionId: number;
    }[];
    expect(created).not.toContainEqual({ permissionId: idOf("user.grant") });
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
