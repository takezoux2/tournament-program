import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const requestPasswordReset = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  },
}));

const submitWith = (email: string) => {
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "リセット用リンクを送る" }),
  );
};

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
  });

  it("形式が正しくないメールアドレスでは送信しない", async () => {
    render(<ForgotPasswordForm />);
    submitWith("not-an-email");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("固定の redirectTo を付けて申請する", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    submitWith("user@example.com");

    await screen.findByText(/送信しました/);
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "user@example.com",
      redirectTo: "/reset-password",
    });
  });

  it("成功したら案内表示に切り替え、宛先を示す", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    submitWith("  User@Example.COM  ");

    // 正規化後のアドレスを見せる。入力どおりに見せると、実際に送った先と
    // 表示がずれる。
    expect(await screen.findByText(/user@example\.com/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "リセット用リンクを送る" }),
    ).not.toBeInTheDocument();
  });

  it("Promise が reject した場合は案内へ切り替えずエラーを出す", async () => {
    requestPasswordReset.mockRejectedValue(new Error("network"));
    render(<ForgotPasswordForm />);
    submitWith("user@example.com");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // 送っていないのに「送りました」と言わない。
    expect(screen.queryByText(/送信しました/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "リセット用リンクを送る" }),
    ).not.toBeDisabled();
  });
});
