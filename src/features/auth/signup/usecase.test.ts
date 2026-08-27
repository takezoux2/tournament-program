import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { failureTag } from "@/shared/testing/exit";
import type { SignUpPort } from "./usecase";
import { signup } from "./usecase";

const input = {
  name: "竹添",
  email: "user@example.com",
  password: "password123",
};

// Effect への包み方と AuthError への写像そのものは
// src/shared/lib/auth-effect.test.ts が網羅している。ここでは signup が
// サインアップ固有の入力をポートへ渡し、失敗を素通しすることだけを見る。
describe("signup", () => {
  it("入力をそのままポートへ渡し、エラーが無ければ成功する", async () => {
    const port: SignUpPort = vi.fn().mockResolvedValue({ error: null });
    const exit = await Effect.runPromiseExit(signup(port, input));
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith(input);
  });

  it("メール重複を EmailAlreadyExists として返す", async () => {
    const port: SignUpPort = vi.fn().mockResolvedValue({
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    const exit = await Effect.runPromiseExit(signup(port, input));
    expect(failureTag(exit)).toBe("EmailAlreadyExists");
  });
});
