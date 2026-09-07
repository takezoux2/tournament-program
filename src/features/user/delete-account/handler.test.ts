import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const findSoleGranterOrganizations = vi.fn();
const deleteUser = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/authz/sole-granter", () => ({
  findSoleGranterOrganizations: (userId: string) =>
    findSoleGranterOrganizations(userId),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { deleteUser: (input: unknown) => deleteUser(input) } },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { deleteAccountAction } = await import("./handler");

describe("deleteAccountAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    findSoleGranterOrganizations.mockReset();
    deleteUser.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    findSoleGranterOrganizations.mockResolvedValue([]);
    deleteUser.mockResolvedValue({
      success: true,
      message: "Verification email sent",
    });
  });

  it("未ログインなら requireSession の時点で打ち切られ、削除に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      deleteAccountAction(INITIAL_PROFILE_FORM_STATE, new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("唯一の権限保持者である組織があれば、メールを送らず組織名を挙げて断る", async () => {
    findSoleGranterOrganizations.mockResolvedValue([
      { id: "o1", name: "テニス部", slug: "tennis" },
      { id: "o2", name: "卓球部", slug: "takkyu" },
    ]);

    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(deleteUser).not.toHaveBeenCalled();
    expect(result.error).toBe(
      "テニス部、卓球部 では、権限を配れるのがあなただけです。他の人に「権限の付与」を渡してから、再度お試しください",
    );
  });

  it("判定はセッションのユーザーに対して行う", async () => {
    await deleteAccountAction(INITIAL_PROFILE_FORM_STATE, new FormData());

    expect(findSoleGranterOrganizations).toHaveBeenCalledWith("u1");
  });

  it("問題なければ確認メールを送り、その旨を返す", async () => {
    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(deleteUser).toHaveBeenCalledWith({
      body: { callbackURL: "/login" },
      headers: expect.any(Headers),
    });
    expect(result).toEqual({
      error: null,
      notice:
        "確認メールを送信しました。ログイン中のこのブラウザでリンクを開くと削除されます",
    });
  });

  it("Better Auth が失敗したら文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "UNAUTHORIZED" } });
    deleteUser.mockRejectedValue(apiError);

    const result = await deleteAccountAction(
      INITIAL_PROFILE_FORM_STATE,
      new FormData(),
    );

    expect(result.notice).toBeNull();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
