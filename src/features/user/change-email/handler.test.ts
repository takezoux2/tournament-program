import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_PROFILE_FORM_STATE } from "../state";

const requireSession = vi.fn();
const changeEmailApi = vi.fn();
const nextHeaders = vi.fn();
const send = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { changeEmail: (input: unknown) => changeEmailApi(input) } },
}));

vi.mock("@/shared/lib/mail", () => ({
  getMailer: () => ({ send }),
  resolveMailFrom: () => ({ email: "no-reply@example.test", name: "大会運営" }),
}));

vi.mock("next/headers", () => ({
  headers: () => nextHeaders(),
}));

const { changeEmailAction } = await import("./handler");

const buildFormData = (newEmail: string): FormData => {
  const data = new FormData();
  data.set("newEmail", newEmail);
  return data;
};

describe("changeEmailAction", () => {
  beforeEach(() => {
    requireSession.mockReset();
    changeEmailApi.mockReset();
    nextHeaders.mockReset();
    send.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "old@example.test" },
    });
    nextHeaders.mockResolvedValue(new Headers());
    changeEmailApi.mockResolvedValue({ status: true });
    send.mockResolvedValue(undefined);
  });

  it("未ログインなら requireSession の時点で打ち切られ、送信に進まない", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      changeEmailAction(
        INITIAL_PROFILE_FORM_STATE,
        buildFormData("new@example.test"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(changeEmailApi).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("形式が正しくないアドレスは送信せずエラーを返す", async () => {
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("not-an-email"),
    );

    expect(result.error).toBe("メールアドレスの形式が正しくありません");
    expect(changeEmailApi).not.toHaveBeenCalled();
  });

  it("今と同じアドレスは、Better Auth へ送らず案内だけ返す", async () => {
    // Better Auth 側は "Email is the same" をコード無しの 400 で返すため、
    // 写像すると「処理に失敗しました」になってしまう。手前で畳む。
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("old@example.test"),
    );

    expect(result.error).toBe("現在と違うメールアドレスを入力してください");
    expect(changeEmailApi).not.toHaveBeenCalled();
  });

  it("成功したら新アドレスへの確認と、現アドレスへの通知を送る", async () => {
    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(changeEmailApi).toHaveBeenCalledWith({
      body: {
        newEmail: "new@example.test",
        callbackURL: "/profile?emailChanged=1",
      },
      headers: expect.any(Headers),
    });
    // 確認メールは Better Auth が送る。ここが送るのは通知だけ。
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toEqual([
      { email: "old@example.test", name: "竹添太郎" },
    ]);
    expect(send.mock.calls[0][0].text).toContain("new@example.test");
    expect(result.notice).toContain("確認メールを送信しました");
  });

  it("通知メールの送信に失敗しても、申請そのものは成功として返す", async () => {
    // 確認メールは既に送られている。通知が届かないことを理由に
    // 「失敗しました」と出すと、実際には進んでいる操作を再試行させる。
    send.mockRejectedValue(new Error("smtp down"));

    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(result.error).toBeNull();
    expect(result.notice).toContain("確認メールを送信しました");
  });

  it("Better Auth が失敗したら通知を送らず、文言に写して返す", async () => {
    const apiError = new Error("boom");
    apiError.name = "APIError";
    Object.assign(apiError, { body: { code: "SOMETHING_WE_DO_NOT_HANDLE" } });
    changeEmailApi.mockRejectedValue(apiError);

    const result = await changeEmailAction(
      INITIAL_PROFILE_FORM_STATE,
      buildFormData("new@example.test"),
    );

    expect(send).not.toHaveBeenCalled();
    expect(result.notice).toBeNull();
    expect(result.error).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
