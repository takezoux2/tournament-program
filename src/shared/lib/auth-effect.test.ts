import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { AuthCallPort } from "./auth-effect";
import { runAuthApiCall, runAuthCall } from "./auth-effect";

const input = { email: "user@example.com" };

describe("runAuthCall", () => {
  it("エラーが無ければ成功し、入力をそのまま渡す", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("error が undefined でも成功として扱う", async () => {
    const port: AuthCallPort<typeof input> = vi.fn().mockResolvedValue({});
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("エラーコードを AuthError に写像する", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });

  it("未知のコードは UnexpectedAuthError にする", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockResolvedValue({ error: { code: "WAT" } });
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });

  it("Promise が reject したら UnexpectedAuthError にする", async () => {
    const port: AuthCallPort<typeof input> = vi
      .fn()
      .mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(runAuthCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});

describe("runAuthApiCall", () => {
  /** better-call の APIError は name が "APIError" で body.code を持つ。 */
  const apiError = (code: string): Error => {
    const error = new Error("boom");
    error.name = "APIError";
    Object.assign(error, { body: { code }, status: "BAD_REQUEST" });
    return error;
  };

  it("解決した値をそのまま返す（link-social の url を受け取るため）", async () => {
    const port = vi.fn().mockResolvedValue({ url: "https://example.test/x" });
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ url: "https://example.test/x" });
    }
    expect(port).toHaveBeenCalledWith(input);
  });

  it("APIError の body.code を AuthError に写像する", async () => {
    const port = vi.fn().mockRejectedValue(apiError("SESSION_NOT_FRESH"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("SessionNotFresh");
  });

  it("未知のコードの APIError は UnexpectedAuthError にする", async () => {
    const port = vi.fn().mockRejectedValue(apiError("WAT"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });

  it("APIError でない例外も UnexpectedAuthError にする", async () => {
    const port = vi.fn().mockRejectedValue(new Error("network"));
    const exit = await Effect.runPromiseExit(runAuthApiCall(port, input));
    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
