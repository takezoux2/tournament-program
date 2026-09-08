import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "./SignupForm";

const signUpEmail = vi.fn();
const signInSocial = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const trackEvent = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: (...args: unknown[]) => signUpEmail(...args),
    },
    signIn: {
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

describe("SignupForm の Google 登録ボタン", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("{ error } で解決した場合、アラートを表示しボタンが再度有効になる", async () => {
    signInSocial.mockResolvedValue({ error: { code: "SOMETHING" } });
    render(<SignupForm redirectTo="/" />);

    const button = screen.getByRole("button", { name: "Google で登録" });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("Promise が reject した場合も、アラートを表示しボタンが再度有効になる", async () => {
    signInSocial.mockRejectedValue(new Error("network"));
    render(<SignupForm redirectTo="/" />);

    const button = screen.getByRole("button", { name: "Google で登録" });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("ユーザー名の入力欄がある", () => {
    render(<SignupForm redirectTo="/" />);

    expect(screen.getByLabelText("ユーザー名")).toBeInTheDocument();
  });
});

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText("名前"), {
    target: { value: "竹添" },
  });
  fireEvent.change(screen.getByLabelText("ユーザー名"), {
    target: { value: "takezo" },
  });
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText("パスワード"), {
    target: { value: "password123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登録する" }));
};

describe("SignupForm のメール登録", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    signInSocial.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("成功しても遷移せず、確認メールの案内を出す", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    // requireEmailVerification によりセッションは発行されない。
    // 遷移するとログインしていない画面へ飛ばすことになる。
    expect(
      await screen.findByRole("heading", { name: "確認メールを送信しました" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("メールが届かない場合はログインで再送できることを案内する", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    await screen.findByRole("heading", { name: "確認メールを送信しました" });
    // 再登録は列挙対策で成功したふりになり何も送られないため、
    // 復帰手段はログインでの再送しかない。それを画面上で案内する。
    expect(
      screen.getByText(/ログインを試すと確認メールを送り直します/),
    ).toBeInTheDocument();
  });

  it("確認リンクの戻り先に redirect を引き継ぐ", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    await screen.findByRole("heading", { name: "確認メールを送信しました" });
    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        callbackURL: "/login?verified=1&redirect=%2Forgs",
      }),
    );
  });

  it("失敗した場合はフォームのままアラートを出す", async () => {
    signUpEmail.mockResolvedValue({ error: { code: "FAILED_TO_CREATE_USER" } });
    render(<SignupForm redirectTo="/orgs" />);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "登録する" }),
    ).toBeInTheDocument();
  });
});

describe("SignupForm の GA イベント", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    signInSocial.mockReset();
    trackEvent.mockReset();
  });

  const fillAndSubmit = () => {
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "山田太郎" },
    });
    fireEvent.change(screen.getByLabelText("ユーザー名"), {
      target: { value: "yamada" },
    });
    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "yamada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登録する" }));
  };

  it("確認メールの送信まで進んだら sign_up を送る", async () => {
    signUpEmail.mockResolvedValue({ data: {} });
    render(<SignupForm redirectTo="/" />);

    fillAndSubmit();

    expect(
      await screen.findByText("確認メールを送信しました"),
    ).toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith("sign_up", { method: "email" });
  });

  it("登録に失敗したときは送らない", async () => {
    signUpEmail.mockResolvedValue({ error: { code: "USER_ALREADY_EXISTS" } });
    render(<SignupForm redirectTo="/" />);

    fillAndSubmit();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("Google 登録では送らない（成否を観測できないため）", async () => {
    signInSocial.mockResolvedValue({ data: {} });
    render(<SignupForm redirectTo="/" />);

    fireEvent.click(screen.getByRole("button", { name: "Google で登録" }));

    // 送信が終わってボタンが再度有効になるまで待つ
    await screen.findByRole("button", { name: "Google で登録" });
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
