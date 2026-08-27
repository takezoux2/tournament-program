import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./LogoutButton";

const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    signOut.mockReset();
    push.mockClear();
    refresh.mockClear();
  });

  it("成功時は /login へ遷移し、ボタンは再度有効になる", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "ログアウト" }),
    ).not.toBeDisabled();
  });

  it("Promise が reject した場合、ボタンが再度有効になりエラーを表示し遷移しない", async () => {
    signOut.mockRejectedValue(new Error("network"));
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("{ error } で解決した場合も、ボタンが再度有効になりエラーを表示し遷移しない", async () => {
    signOut.mockResolvedValue({ error: { code: "SOMETHING" } });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).not.toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });
});
