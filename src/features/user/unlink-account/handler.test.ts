import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const findLinkedAccounts = vi.fn();
const unlinkAccountApi = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("../repository", () => ({
  findLinkedAccounts: (userId: string) => findLinkedAccounts(userId),
  GOOGLE_PROVIDER_ID: "google",
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { unlinkAccount: (input: unknown) => unlinkAccountApi(input) },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { unlinkGoogleAction } = await import("./handler");

describe("unlinkGoogleAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findLinkedAccounts.mockReset();
    unlinkAccountApi.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    findLinkedAccounts.mockResolvedValue({
      hasPassword: true,
      google: { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") },
    });
    unlinkAccountApi.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、解除に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      unlinkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(unlinkAccountApi).not.toHaveBeenCalled();
  });

  it("解除対象はセッションのユーザーの連携から引き当てる", async () => {
    // accountId をフォームから受け取らないので、他人の連携を指定できない。
    await unlinkGoogleAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(findLinkedAccounts).toHaveBeenCalledWith("u1");
    expect(unlinkAccountApi).toHaveBeenCalledWith({
      body: { accountId: "a2" },
      headers: expect.any(Headers),
    });
  });

  it("連携していなければ解除を呼ばずエラーを返す", async () => {
    findLinkedAccounts.mockResolvedValue({ hasPassword: true, google: null });

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(unlinkAccountApi).not.toHaveBeenCalled();
    expect(result.error).toBe("Google と連携していません");
  });

  it("成功したら notice を返し、節の表示が変わるため再検証する", async () => {
    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      notice: "Google との連携を解除しました",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("最後の 1 つなら、先にパスワードを設定するよう促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, {
      body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
    });
    unlinkAccountApi.mockRejectedValue(apiError);

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toBe(
      "最後のログイン方法は解除できません。先にパスワードを設定してください",
    );
  });

  it("セッションが古ければ、ログインし直しを促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    unlinkAccountApi.mockRejectedValue(apiError);

    const result = await unlinkGoogleAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.error).toContain("ログインし直し");
  });
});
