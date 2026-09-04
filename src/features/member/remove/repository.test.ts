import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    member: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { removeMemberInDb } = await import("./repository");

describe("removeMemberInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("organizationId と id の両方を where に含めて消す", async () => {
    // memberId だけで消すと、他組織のメンバーまで巻き添えで消える。
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "o1", id: "m1" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 1 });
    }
  });

  it("0 件でもエラーにせず件数として返す（不在判定は handler の仕事）", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ removed: 0 });
    }
  });

  it("FK 違反（参加記録あり）は MemberHasParticipants に写す", async () => {
    // Participant → Member は onDelete: Restrict。削除と判定を分けると
    // 間にエントリーが入るレースがあるため、FK に判定させる。
    deleteMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("MemberHasParticipants");
  });

  it("その他の例外は UnexpectedMemberError に写す", async () => {
    deleteMany.mockRejectedValue(new Error("network"));

    const exit = await Effect.runPromiseExit(
      removeMemberInDb({ memberId: "m1", organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedMemberError");
  });
});
