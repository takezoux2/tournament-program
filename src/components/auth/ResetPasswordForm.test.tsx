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

  it("INVALID_TOKEN で失敗したら再申請を促す文言を出し、遷移しない", async () => {
    resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    render(<ResetPasswordForm token="t0ken" errorCode={null} />);
    fillAndSubmit("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("お申し込み");
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
