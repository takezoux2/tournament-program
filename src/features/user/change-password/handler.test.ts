import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const changePasswordApi = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: {
    api: { changePassword: (input: unknown) => changePasswordApi(input) },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { changePasswordAction } = await import("./handler");

const buildFormData = (
  currentPassword: string,
  newPassword: string,
): FormData => {
  const data = new FormData();
  data.set("currentPassword", currentPassword);
  data.set("newPassword", newPassword);
  return data;
};

describe("changePasswordAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    changePasswordApi.mockReset();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    changePasswordApi.mockResolvedValue({ token: null });
  });

  it("未ログインなら requireSession の時点で打ち切られ、変更に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      changePasswordAction(
        INITIAL_PROFILE_FORM_STATE,
        buildFormData("oldpassword", "newpassword"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば変更せずエラーを返す", async () => {
    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("oldpassword", "short"),
    );

    expect(result.error).toBe("パスワードは8文字以上で入力してください");
    expect(changePasswordApi).not.toHaveBeenCalled();
  });

  it("成功したら notice を返す", async () => {
    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("oldpassword", "newpassword"),
    );

    expect(result).toEqual({
      error: null,
      notice: "パスワードを変更しました",
    });
    expect(changePasswordApi).toHaveBeenCalledWith({
      body: { currentPassword: "oldpassword", newPassword: "newpassword" },
      headers: expect.any(Headers),
    });
  });

  it("現在のパスワード違いは、そうと分かる文言で返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "INVALID_PASSWORD" } });
    changePasswordApi.mockRejectedValue(apiError);

    const result = await changePasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("wrongpassword", "newpassword"),
    );

    expect(result).toEqual({
      error: "現在のパスワードが正しくありません",
      notice: null,
    });
  });
});
