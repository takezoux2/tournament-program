import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const signInEmail = vi.fn();
const signInSocial = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => signInEmail(...args),
      social: (...args: unknown[]) => signInSocial(...args),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("LoginForm の Google ログインボタン", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("{ error } で解決した場合、アラートを表示しボタンが再度有効になる", async () => {
    signInSocial.mockResolvedValue({ error: { code: "SOMETHING" } });
    render(<LoginForm redirectTo="/" />);

    const button = screen.getByRole("button", { name: "Google でログイン" });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("Promise が reject した場合も、アラートを表示しボタンが再度有効になる", async () => {
    signInSocial.mockRejectedValue(new Error("network"));
    render(<LoginForm redirectTo="/" />);

    const button = screen.getByRole("button", { name: "Google でログイン" });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("LoginForm の確認メール案内", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("確認が済んだ場合に案内を出す", () => {
    render(<LoginForm redirectTo="/" verified />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "登録が完了しました。ログインしてください",
    );
  });

  it("期限切れの場合に案内を出す", () => {
    render(<LoginForm redirectTo="/" verified verifyError="TOKEN_EXPIRED" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "リンクの有効期限が切れています",
    );
  });

  it("確認リンク経由でなければ案内を出さない", () => {
    render(<LoginForm redirectTo="/" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ログイン時に callbackURL を渡す", async () => {
    signInEmail.mockResolvedValue({ error: null });
    render(<LoginForm redirectTo="/orgs" />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    // sendOnSignIn による再送メールの戻り先。渡し忘れると Better Auth は
    // "/" を使ってしまい、案内も元の遷移先も失われる。
    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "/login?verified=1&redirect=%2Forgs",
        }),
      ),
    );
  });

  it("未確認のままログインした場合に再送を伝える", async () => {
    signInEmail.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED" } });
    render(<LoginForm redirectTo="/" />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスが未確認です。確認メールを再送しました",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
