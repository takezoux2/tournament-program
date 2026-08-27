import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SignInPort } from "./usecase";
import { login } from "./usecase";

const input = { email: "user@example.com", password: "password123" };

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは login が
// ログイン固有の入力をポートへ渡し、失敗を素通しすることだけを見る。
describe("login", () => {
  it("入力をそのままポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignInPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(login(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("資格情報の誤りを InvalidCredentials として返す", async () => {
    const port: SignInPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const exit = await Effect.runPromiseExit(login(port, input));
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
