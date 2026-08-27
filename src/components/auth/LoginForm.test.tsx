import { fireEvent, render, screen } from "@testing-library/react";
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
