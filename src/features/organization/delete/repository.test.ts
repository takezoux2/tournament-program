import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { deleteMany: (args: unknown) => deleteMany(args) },
  },
}));

const { deleteOrganizationInDb } = await import("./repository");

describe("deleteOrganizationInDb", () => {
  beforeEach(() => {
    deleteMany.mockReset();
  });

  it("id で対象の組織を削除する", async () => {
    deleteMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      deleteOrganizationInDb({ organizationId: "o1" }),
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 1 });
    }
  });

  it("対象が既に無ければ 0 件を返す（例外にはしない）", async () => {
    // delete だと P2025 の例外になるところを、deleteMany なら 0 件の成功として
    // 返せる。handler 側がこれを見て notFound にする。
    deleteMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      deleteOrganizationInDb({ organizationId: "o1" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ deleted: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    deleteMany.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      deleteOrganizationInDb({ organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
