import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";

const deleteFn = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    organization: { delete: (args: unknown) => deleteFn(args) },
  },
}));

const { deleteOrganizationInDb } = await import("./repository");

describe("deleteOrganizationInDb", () => {
  beforeEach(() => {
    deleteFn.mockReset();
  });

  it("id で対象の組織を削除する", async () => {
    deleteFn.mockResolvedValue({ id: "o1" });

    const exit = await Effect.runPromiseExit(
      deleteOrganizationInDb({ organizationId: "o1" }),
    );

    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("例外は握り潰さず UnexpectedOrganizationError の reason に残す", async () => {
    const cause = new Error("network");
    deleteFn.mockRejectedValue(cause);

    const exit = await Effect.runPromiseExit(
      deleteOrganizationInDb({ organizationId: "o1" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toMatchObject({ reason: cause });
    }
  });
});
