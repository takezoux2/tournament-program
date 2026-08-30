import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedOrganizationError } from "../errors";
import type { UpdateOrganizationPort } from "./repository";
import { updateOrganization } from "./usecase";

describe("updateOrganization", () => {
  it("組織 id と名前を port に渡す", async () => {
    const port = vi.fn(() =>
      Effect.succeed({ updated: 1 }),
    ) as unknown as UpdateOrganizationPort;

    const exit = await Effect.runPromiseExit(
      updateOrganization(port, { name: "卓球部" }, "o1"),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ updated: 1 });
    }
    expect(port).toHaveBeenCalledWith({
      organizationId: "o1",
      name: "卓球部",
    });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: UpdateOrganizationPort = () =>
      Effect.fail(new UnexpectedOrganizationError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(
      updateOrganization(port, { name: "卓球部" }, "o1"),
    );

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
  });
});
