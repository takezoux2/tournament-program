import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const signInEmail = vi.fn();
const signInUsername = vi.fn();
const signInSocial = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const trackEvent = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => signInEmail(...args),
      username: (...args: unknown[]) => signInUsername(...args),
      social: (...args: unknown[]) => signInSocial(...args),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/shared/lib/analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

describe("LoginForm の Google ログインボタン", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInUsername.mockReset();
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
    signInUsername.mockReset();
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

    fireEvent.change(screen.getByLabelText("ユーザー名またはメールアドレス"), {
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

    fireEvent.change(screen.getByLabelText("ユーザー名またはメールアドレス"), {
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

describe("LoginForm の識別子", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInUsername.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  const submit = (identifier: string) => {
    render(<LoginForm redirectTo="/orgs" />);
    fireEvent.change(screen.getByLabelText("ユーザー名またはメールアドレス"), {
      target: { value: identifier },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
  };

  it("ユーザー名を入力するとユーザー名でサインインする", async () => {
    signInUsername.mockResolvedValue({ error: null });
    submit("takezoux2");

    await waitFor(() =>
      expect(signInUsername).toHaveBeenCalledWith(
        expect.objectContaining({ username: "takezoux2" }),
      ),
    );
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("メールアドレスを入力するとメールでサインインする", async () => {
    signInEmail.mockResolvedValue({ error: null });
    submit("user@example.com");

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user@example.com" }),
      ),
    );
    expect(signInUsername).not.toHaveBeenCalled();
  });

  it("識別子欄をメール専用にしない", () => {
    // type="email" のままだと、ブラウザの検証がユーザー名の入力を
    // 送信前に弾いてしまう（jsdom では再現しないので属性で固定する）。
    render(<LoginForm redirectTo="/" />);
    expect(
      screen.getByLabelText("ユーザー名またはメールアドレス"),
    ).toHaveAttribute("type", "text");
  });
});

describe("LoginForm の GA イベント", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    signInUsername.mockReset();
    trackEvent.mockReset();
  });

  const fillAndSubmit = (identifier = "yamada@example.com") => {
    fireEvent.change(screen.getByLabelText("ユーザー名またはメールアドレス"), {
      target: { value: identifier },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
  };

  it("ログインに成功したら login を送る", async () => {
    signInEmail.mockResolvedValue({ error: null });
    render(<LoginForm redirectTo="/" />);

    fillAndSubmit();

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("login", { method: "email" }),
    );
  });

  it("ユーザー名でログインに成功したら method: username を送る", async () => {
    signInUsername.mockResolvedValue({ error: null });
    render(<LoginForm redirectTo="/" />);

    fillAndSubmit("takezoux2");

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("login", {
        method: "username",
      }),
    );
  });

  it("ログインに失敗したときは送らない", async () => {
    signInEmail.mockResolvedValue({
      error: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    render(<LoginForm redirectTo="/" />);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
