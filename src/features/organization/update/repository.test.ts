import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const update = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { update: (args: unknown) => update(args) },
  },
}));

const { updateOrganizationInDb } = await import("./repository");

describe("updateOrganizationInDb", () => {
  beforeEach(() => {
    update.mockReset();
  });

  it("id で対象を特定し、name だけを更新する", async () => {
    update.mockResolvedValue({ id: "o1", name: "卓球部" });

    const exit = await Effect.runPromiseExit(
      updateOrganizationInDb({ organizationId: "o1", name: "卓球部" }),
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { name: "卓球部" },
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    update.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      updateOrganizationInDb({ organizationId: "o1", name: "卓球部" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
