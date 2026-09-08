import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { EMAIL_CHANGE_CALLBACK_URL } from "@/shared/lib/auth-email-change-email";
import { failureTag } from "@/shared/testing/exit";
import type { ChangeEmailPort } from "./usecase";
import { changeEmail } from "./usecase";

const headers = new Headers();

describe("changeEmail", () => {
  it("新アドレスと戻り先の callbackURL を body に入れる", async () => {
    const port = vi.fn().mockResolvedValue({ status: true });

    const exit = await Effect.runPromiseExit(
      changeEmail(port, { newEmail: "new@example.test" }, headers),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(port).toHaveBeenCalledWith({
      body: {
        newEmail: "new@example.test",
        // この値が確認メールの文面の出し分けにも使われる。
        callbackURL: EMAIL_CHANGE_CALLBACK_URL,
      },
      headers,
    });
  });

  it("port が投げた APIError を AuthError に写して伝える", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SOMETHING_WE_DO_NOT_HANDLE" } });
    const port: ChangeEmailPort = () => Promise.reject(apiError);

    const exit = await Effect.runPromiseExit(
      changeEmail(port, { newEmail: "new@example.test" }, headers),
    );

    expect(failureTag(exit)).toBe("UnexpectedAuthError");
  });
});
