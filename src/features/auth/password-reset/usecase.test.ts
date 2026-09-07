import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import { PASSWORD_RESET_REDIRECT_TO } from "./domain";
import type { RequestPasswordResetPort, ResetPasswordPort } from "./usecase";
import { requestPasswordReset, resetPassword } from "./usecase";

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは
// リセット固有の入力がポートへ正しく渡ることだけを見る。
describe("requestPasswordReset", () => {
  it("メールアドレスと固定の redirectTo をポートへ渡す", async () => {
    const port: RequestPasswordResetPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(port, { email: "user@example.com" }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      email: "user@example.com",
      redirectTo: PASSWORD_RESET_REDIRECT_TO,
    });
  });

  it("Promise が reject した場合も AuthError に畳む", async () => {
    const port: RequestPasswordResetPort = vi.fn().mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(port, { email: "user@example.com" }),
    );

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});

describe("resetPassword", () => {
  it("新しいパスワードとトークンだけをポートへ渡す", async () => {
    const port: ResetPasswordPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    // confirmPassword はクライアント側だけの検証用なので、サーバーへは送らない。
    expect(port).toHaveBeenCalledWith({
      newPassword: "password123",
      token: "t0ken",
    });
  });

  it("INVALID_TOKEN を InvalidResetToken として返す", async () => {
    const port: ResetPasswordPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(failureTag(exit)).toBe("InvalidResetToken");
  });

  it("PASSWORD_TOO_SHORT を WeakPassword として返す", async () => {
    const port: ResetPasswordPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "PASSWORD_TOO_SHORT" } });
    const exit = await Effect.runPromiseExit(
      resetPassword(
        port,
        { newPassword: "password123", confirmPassword: "password123" },
        "t0ken",
      ),
    );

    expect(failureTag(exit)).toBe("WeakPassword");
  });
});
