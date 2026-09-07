import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { LoginPorts } from "./usecase";
import { login } from "./usecase";

const ports = (): LoginPorts => ({
  signInEmail: vi.fn().mockResolvedValue({ error: null }),
  signInUsername: vi.fn().mockResolvedValue({ error: null }),
});

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは login が
// 識別子の種別でポートを選び、失敗を素通しすることだけを見る。
describe("login", () => {
  it("メールアドレスならメールのポートだけを呼ぶ", async () => {
    const p = ports();
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "email", email: "user@example.com" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    // callbackURL は sendOnSignIn による再送メールのリンクに埋め込まれる
    // 戻り先。これが欠けると Better Auth は "/" を使ってしまう。
    expect(p.signInEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      callbackURL: "/login?verified=1",
    });
    expect(p.signInUsername).not.toHaveBeenCalled();
  });

  it("ユーザー名ならユーザー名のポートだけを呼ぶ", async () => {
    const p = ports();
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "username", username: "takezoux2" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(p.signInUsername).toHaveBeenCalledWith({
      username: "takezoux2",
      password: "password123",
      callbackURL: "/login?verified=1",
    });
    expect(p.signInEmail).not.toHaveBeenCalled();
  });

  it("ユーザー名での資格情報の誤りを InvalidCredentials として返す", async () => {
    const p: LoginPorts = {
      signInEmail: vi.fn().mockResolvedValue({ error: null }),
      signInUsername: vi
        .fn()
        .mockResolvedValue({ error: { code: "INVALID_USERNAME_OR_PASSWORD" } }),
    };
    const exit = await Effect.runPromiseExit(
      login(
        p,
        {
          identifier: { kind: "username", username: "takezoux2" },
          password: "password123",
        },
        "/login?verified=1",
      ),
    );
    expect(failureTag(exit)).toBe("InvalidCredentials");
  });
});
