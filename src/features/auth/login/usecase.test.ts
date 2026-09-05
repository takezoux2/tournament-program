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
  it("入力と callbackURL をポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignInPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(
      login(port, input, "/login?verified=1"),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // callbackURL は sendOnSignIn による再送メールのリンクに埋め込まれる
    // 戻り先。これが欠けると Better Auth は "/" を使ってしまう。
    expect(port).toHaveBeenCalledWith({
      ...input,
      callbackURL: "/login?verified=1",
    });
  });

  it("資格情報の誤りを InvalidCredentials として返す", async () => {
    const port: SignInPort = vi
      .fn()
      .mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const exit = await Effect.runPromiseExit(
      login(port, input, "/login?verified=1"),
    );
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
