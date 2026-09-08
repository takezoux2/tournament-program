import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SetPasswordPort } from "./usecase";
import { setPassword } from "./usecase";

const headers = new Headers();

describe("setPassword", () => {
  it("newPassword を body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      setPassword(port, { newPassword: "newpassword" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { newPassword: "newpassword" },
      headers,
    });
  });

  it("設定済みの場合を PasswordAlreadySet として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "PASSWORD_ALREADY_SET" } });
    const port: SetPasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      setPassword(port, { newPassword: "newpassword" }, headers),
    );

    expect(failureTag(exit)).toBe("PasswordAlreadySet");
  });
});
