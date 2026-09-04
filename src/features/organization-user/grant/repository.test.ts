import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSION_CODES } from "@/shared/authz/ability";
import { failureTag } from "@/shared/testing/exit";

// Permission テーブル相当の固定表（id は PERMISSION_CODES の並びから機械的に振ったもので、実 DB の id とは独立）。
// findManyPermission はこの表から
// where.code.in に含まれる行だけを返すことで、`where` 句の絞り込みが
// 抜けたり間違ったりしたら失敗するテストを書けるようにする。
const permissionTable = PERMISSION_CODES.map((code, index) => ({
  id: index + 1,
  code,
}));

const findFirstMembership = vi.fn();
const findManyPermission = vi.fn();
const deleteManyGrant = vi.fn();
const createManyGrant = vi.fn();
const transaction = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    // $transaction にはコールバックを渡す。tx として同じモック群を渡すことで、
    // トランザクション内の呼び出しもそのまま検証できる。
    $transaction: (callback: (tx: unknown) => unknown) => {
      transaction(callback);
      return callback({
        organizationUser: {
          findFirst: (args: unknown) => findFirstMembership(args),
        },
        permission: { findMany: (args: unknown) => findManyPermission(args) },
        organizationUserPermission: {
          deleteMany: (args: unknown) => deleteManyGrant(args),
          createMany: (args: unknown) => createManyGrant(args),
        },
      });
    },
  },
}));

const { grantPermissionsInDb } = await import("./repository");

const input = {
  userId: "u1",
  organizationId: "o1",
  codes: ["user.view", "user.add"],
};

describe("grantPermissionsInDb", () => {
  beforeEach(() => {
    findFirstMembership.mockReset();
    findManyPermission.mockReset();
    deleteManyGrant.mockReset();
    createManyGrant.mockReset();
    transaction.mockReset();
    findFirstMembership.mockResolvedValue({ userId: "u1" });
    findManyPermission.mockImplementation(
      async (args: { where: { code: { in: string[] } } }) =>
        permissionTable.filter((permission) =>
          args.where.code.in.includes(permission.code),
        ),
    );
    deleteManyGrant.mockResolvedValue({ count: 3 });
    createManyGrant.mockResolvedValue({ count: 2 });
  });

  it("所属を確認してから、既存の権限を消して指定分を入れ直す", async () => {
    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(findFirstMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "o1", userId: "u1" },
      }),
    );
    expect(deleteManyGrant).toHaveBeenCalledWith({
      where: { organizationId: "o1", userId: "u1" },
    });
    expect(createManyGrant).toHaveBeenCalledWith({
      data: [
        { organizationId: "o1", userId: "u1", permissionId: 1 },
        { organizationId: "o1", userId: "u1", permissionId: 2 },
      ],
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("codes の一部だけを渡すと、その code だけを in 条件で問い合わせ、該当する permissionId だけ createMany する", async () => {
    const subsetInput = { ...input, codes: ["user.remove", "org.delete"] };

    await Effect.runPromiseExit(grantPermissionsInDb(subsetInput));

    expect(findManyPermission).toHaveBeenCalledWith({
      where: { code: { in: ["user.remove", "org.delete"] } },
      select: { id: true, code: true },
    });
    // permissionTable 上で user.remove は id 3、org.delete は id 12。
    // where 句が抜けたりミスタイプしたりすると、他の code の
    // permissionId まで混ざるか、逆に絞り込みすぎて欠けるので検出できる。
    expect(createManyGrant).toHaveBeenCalledWith({
      data: [
        { organizationId: "o1", userId: "u1", permissionId: 3 },
        { organizationId: "o1", userId: "u1", permissionId: 12 },
      ],
    });
  });

  it("削除と挿入を 1 つのトランザクションで行う（権限が空のまま残る窓を作らない）", async () => {
    await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("codes が空なら削除だけ行い、createMany は呼ばない", async () => {
    await Effect.runPromiseExit(grantPermissionsInDb({ ...input, codes: [] }));

    expect(deleteManyGrant).toHaveBeenCalled();
    expect(createManyGrant).not.toHaveBeenCalled();
  });

  it("所属していなければ NotAMember を返し、権限を触らない", async () => {
    findFirstMembership.mockResolvedValue(null);

    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(failureTag(exit)).toBe("NotAMember");
    expect(deleteManyGrant).not.toHaveBeenCalled();
  });

  it("例外は UnexpectedOrganizationUserError に写す", async () => {
    deleteManyGrant.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(grantPermissionsInDb(input));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
