import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const setPasswordApi = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { setPassword: (input: unknown) => setPasswordApi(input) } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { setPasswordAction } = await import("./handler");

const buildFormData = (newPassword: string): FormData => {
  const data = new FormData();
  data.set("newPassword", newPassword);
  return data;
};

describe("setPasswordAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    setPasswordApi.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1" } });
    nextHeaders.mockResolvedValue(new Headers());
    setPasswordApi.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、設定に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      setPasswordAction(
        INITIAL_PROFILE_FORM_STATE,
        buildFormData("newpassword"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(setPasswordApi).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば設定せずエラーを返す", async () => {
    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("short"),
    );

    expect(result.error).toBe("パスワードは8文字以上で入力してください");
    expect(setPasswordApi).not.toHaveBeenCalled();
  });

  it("成功したら notice を返し、節の出し分けが変わるため再検証する", async () => {
    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("newpassword"),
    );

    expect(result).toEqual({
      error: null,
      notice: "パスワードを設定しました",
    });
    // 設定後は「変更」フォームに切り替わり、連携解除も可能になる。
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("既に設定済みなら、変更から操作するよう促す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "PASSWORD_ALREADY_SET" } });
    setPasswordApi.mockRejectedValue(apiError);

    const result = await setPasswordAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("newpassword"),
    );

    expect(result.error).toBe(
      "パスワードは既に設定されています。変更から操作してください",
    );
  });
});
