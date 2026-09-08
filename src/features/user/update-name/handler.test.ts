import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const updateUser = vi.fn();
const revalidatePath = vi.fn();
const nextHeaders = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { updateUser: (input: unknown) => updateUser(input) } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { updateNameAction } = await import("./handler");

const buildFormData = (name: string): FormData => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

describe("updateNameAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    updateUser.mockReset();
    revalidatePath.mockClear();
    nextHeaders.mockReset();
    requireSession.mockResolvedValue({ user: { id: "u1", name: "竹添" } });
    nextHeaders.mockResolvedValue(new Headers());
    updateUser.mockResolvedValue({ status: true });
  });

  it("未ログインなら requireSession の時点で打ち切られ、更新に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      updateNameAction(INITIAL_PROFILE_FORM_STATE, buildFormData("竹添太郎")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("検証に失敗すれば更新せずエラーを返す", async () => {
    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("   "),
    );

    expect(result).toEqual({ error: "名前を入力してください", notice: null });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("成功したら notice を返し、ヘッダーの名前を更新するため再検証する", async () => {
    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("竹添太郎"),
    );

    expect(result).toEqual({ error: null, notice: "表示名を変更しました" });
    expect(updateUser).toHaveBeenCalledWith({
      body: { name: "竹添太郎" },
      headers: expect.any(Headers),
    });
    // ヘッダーは全ページに出るため、レイアウト全体を作り直させる。
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("Better Auth の失敗は文言に写して返す（例外にしない）", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SESSION_NOT_FRESH" } });
    updateUser.mockRejectedValue(apiError);

    const result = await updateNameAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("竹添太郎"),
    );

    expect(result.notice).toBeNull();
    expect(result.error).toContain("ログインし直し");
  });
});
