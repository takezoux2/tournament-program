import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const updateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { updateMany: (args: unknown) => updateMany(args) },
  },
}));

const { updateOrganizationInDb } = await import("./repository");

describe("updateOrganizationInDb", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("id で対象を特定し、name だけを更新する", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    const exit = await Effect.runPromiseExit(
      updateOrganizationInDb({ organizationId: "o1", name: "卓球部" }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { name: "卓球部" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
  });

  it("対象が既に無ければ 0 件を返す（例外にはしない）", async () => {
    // update だと P2025 の例外になるところを、updateMany なら 0 件の成功として
    // 返せる。handler 側がこれを見て notFound にする。
    updateMany.mockResolvedValue({ count: 0 });

    const exit = await Effect.runPromiseExit(
      updateOrganizationInDb({ organizationId: "o1", name: "卓球部" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 0 });
    }
  });

  it("例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    updateMany.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      updateOrganizationInDb({ organizationId: "o1", name: "卓球部" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
