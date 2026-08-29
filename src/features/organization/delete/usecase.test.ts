import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { UnexpectedOrganizationError } from "../errors";
import type { DeleteOrganizationPort } from "./repository";
import { deleteOrganization } from "./usecase";

describe("deleteOrganization", () => {
  it("組織 id を port に渡す", async () => {
    const port = vi.fn(() => Effect.void) as unknown as DeleteOrganizationPort;

    const exit = await Effect.runPromiseExit(deleteOrganization(port, "o1"));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ organizationId: "o1" });
  });

  it("port の失敗をそのまま伝える", async () => {
    const port: DeleteOrganizationPort = () =>
      Effect.fail(new UnexpectedOrganizationError({ reason: new Error("x") }));

    const exit = await Effect.runPromiseExit(deleteOrganization(port, "o1"));

    expect(failureTag(exit)).toBe("UnexpectedOrganizationError");
  });
});
