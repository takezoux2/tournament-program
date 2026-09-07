import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { UnlinkAccountPort } from "./usecase";
import { unlinkAccount } from "./usecase";

const headers = new Headers();

describe("unlinkAccount", () => {
  it("accountId を body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({ body: { accountId: "a2" }, headers });
  });

  it("最後の 1 つの解除を LastAccountUnlinkForbidden として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, {
      body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
    });
    const port: UnlinkAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(failureTag(exit)).toBe("LastAccountUnlinkForbidden");
  });

  it("古いセッションを SessionNotFresh として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    const port: UnlinkAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      unlinkAccount(port, "a2", headers),
    );

    expect(failureTag(exit)).toBe("SessionNotFresh");
  });
});
