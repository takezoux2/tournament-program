import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { AuthCallPort } from "./auth-effect";
import { runAuthCall } from "./auth-effect";

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
