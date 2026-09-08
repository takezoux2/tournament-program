import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./ResetPasswordForm";

const resetPassword = vi.fn();
const push = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    resetPassword: (...args: unknown[]) => resetPassword(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const fillAndSubmit = (newPassword: string, confirmPassword: string) => {
  fireEvent.change(screen.getByLabelText("新しいパスワード"), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "パスワードを設定する" }));
};

describe("ResetPasswordForm のトークン検査", () => {
  beforeEach(() => {
    resetPassword.mockReset();
    push.mockClear();
  });

  it("トークンが無ければフォームを出さず案内を出す", () => {
    render(<ResetPasswordForm token={null} errorCode={null} />);

    expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
    expect(screen.getByText(/リンクが無効か期限切れです/)).toBeInTheDocument();
  });

  it("error が付いていればフォームを出さない", () => {
    render(<ResetPasswordForm token="t0ken" errorCode="INVALID_TOKEN" />);

    expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
  });

  it("フォームを出さない場合は再申請への導線を出す", () => {
    render(<ResetPasswordForm token={null} errorCode="INVALID_TOKEN" />);

    expect(
      screen.getByRole("link", { name: "パスワードの再設定を申し込む" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});

describe("ResetPasswordForm の送信", () => {
  beforeEach(() => {
    resetPassword.mockReset();
    push.mockClear();
  });

  it("確認用が一致しない場合は送信しない", async () => {
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password124");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("短すぎるパスワードは送信しない", async () => {
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("short", "short");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("成功したら新しいパスワードとトークンを渡し、ログイン画面へ遷移する", async () => {
    resetPassword.mockResolvedValue({ error: null });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith("/login?reset=1");
    });
    // confirmPassword はサーバーへ送らない。
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: "password123",
      token: "t0ken",
    });
  });

  it("INVALID_TOKEN で失敗したらフォームを引っ込め、再申請への導線を出す", async () => {
    // 送信時点でトークンが失効するのは、戻る操作での再送や複数タブでの
    // 二重送信で普通に起こる。ここで残るボタンが「押しても必ず失敗する
    // フォーム」にならないよう、事前チェック（resetTokenState）と同じ
    // 「もう一度申し込む」導線に切り替える。
    resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(
      await screen.findByRole("link", { name: "パスワードの再設定を申し込む" }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("新しいパスワード")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("PASSWORD_TOO_SHORT で失敗したらフォームを残し、インラインの案内を出す", async () => {
    // トークン自体は有効なので、同じ画面で入力し直せば再送信できる。
    // Fix 1 が INVALID_TOKEN だけを退避先の画面に切り替えることの裏返し。
    resetPassword.mockResolvedValue({ error: { code: "PASSWORD_TOO_SHORT" } });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "パスワードの長さが要件を満たしていません",
    );
    expect(screen.getByLabelText("新しいパスワード")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Promise が reject した場合もエラーを出しボタンが再度有効になる", async () => {
    resetPassword.mockRejectedValue(new Error("network"));
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "パスワードを設定する" }),
    ).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});
