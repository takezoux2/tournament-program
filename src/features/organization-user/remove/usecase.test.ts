import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedOrganizationUserError } from "../errors";
import type { RemoveUserPort } from "./repository";
import { removeUser } from "./usecase";

describe("removeUser", () => {
  it("入力と組織 id を合わせて port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ removed: 1 }),
    ) as unknown as RemoveUserPort;

    const exit = await Effect.runPromiseExit(
      removeUser(port, { userId: "u1" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ userId: "u1", organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: RemoveUserPort = () =>
      Effect.fail(new UnexpectedOrganizationUserError({ reason: "boom" }));

    const exit = await Effect.runPromiseExit(
      removeUser(port, { userId: "u1" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationUserError");
  });
});
