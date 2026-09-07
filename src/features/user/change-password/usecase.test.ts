import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { ChangePasswordPort } from "./usecase";
import { changePassword } from "./usecase";

const headers = new Headers();
const input = { currentPassword: "oldpassword", newPassword: "newpassword" };

describe("changePassword", () => {
  it("両方のパスワードを body に入れ、headers をそのまま渡す", async () => {
    const port = vi.fn().mockResolvedValue({ token: null });

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: { currentPassword: "oldpassword", newPassword: "newpassword" },
      headers,
    });
  });

  it("現在のパスワード違いを InvalidPassword として伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "INVALID_PASSWORD" } });
    const port: ChangePasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(failureTag(exit)).toBe("InvalidPassword");
  });

  it("パスワード未設定を InvalidCredentials として伝える", async () => {
    // 画面が設定フォームを出すべき状態。表示後に状態が変わった競合にあたる。
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "CREDENTIAL_ACCOUNT_NOT_FOUND" } });
    const port: ChangePasswordPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changePassword(port, input, headers),
    );

    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
