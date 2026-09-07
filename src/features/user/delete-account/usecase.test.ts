import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { DeleteAccountPort } from "./usecase";
import { deleteAccount } from "./usecase";

const headers = new Headers();

describe("deleteAccount", () => {
  it("削除後の戻り先を callbackURL に入れる", async () => {
    const port = vi.fn().mockResolvedValue({ success: true });

    const exit = await Effect.runPromiseExit(deleteAccount(port, headers));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { callbackURL: "/login" },
      headers,
    });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    const port: DeleteAccountPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(deleteAccount(port, headers));

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
