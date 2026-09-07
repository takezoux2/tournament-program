import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const linkSocialAccount = vi.fn();
const nextHeaders = vi.fn();
const redirect = vi.fn((_url: string) => {
  // next/navigation の redirect は例外を投げて制御を打ち切る。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { linkSocialAccount: (input: unknown) => linkSocialAccount(input) },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

const { linkGoogleAction } = await import("./handler");

describe("linkGoogleAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    linkSocialAccount.mockReset();
    nextHeaders.mockReset();
    redirect.mockClear();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    linkSocialAccount.mockResolvedValue({
      url: "https://accounts.google.test/o/oauth2/auth?x=1",
      redirect: true,
    });
  });

  it("未ログインなら requireSession の時点で打ち切られ、連携に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(linkSocialAccount).not.toHaveBeenCalled();
  });

  it("成否どちらでも /profile へ戻る callbackURL を渡す", async () => {
    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(linkSocialAccount).toHaveBeenCalledWith({
      body: {
        provider: "google",
        callbackURL: "/profile",
        errorCallbackURL: "/profile",
      },
      headers: expect.any(Headers),
    });
  });

  it("返った url へ遷移させる", async () => {
    // 成功時は redirect が例外として制御を奪うので、例外側で成功を確認する。
    await expect(
      linkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "https://accounts.google.test/o/oauth2/auth?x=1",
    );
  });

  it("url が返らなければ遷移せずエラーを返す", async () => {
    linkSocialAccount.mockResolvedValue({ url: "", redirect: false });

    const result = await linkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });

  it("Better Auth が失敗したら遷移せず文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    linkSocialAccount.mockRejectedValue(apiError);

    const result = await linkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
