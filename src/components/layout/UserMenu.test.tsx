import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// テスト環境ではルーターが無いためモジュールごと差し替える。
// ログアウトの分岐そのものは LogoutButton.test.tsx が持つ。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const renderMenu = () =>
  render(<UserMenu userName="竹添太郎" userEmail="taro@example.test" />);

describe("UserMenu", () => {
  it("閉じている間は項目を描画しない", () => {
    renderMenu();

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
  });

  it("閉じている間は aria-expanded が false", () => {
    renderMenu();

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("ユーザー名を押すと開き、aria-expanded が true になる", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("開くとプロフィール・所属組織・ログアウトが出る", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(screen.getByRole("link", { name: "プロフィール" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: "所属組織" })).toHaveAttribute(
      "href",
      "/profile/orgs",
    );
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("開くとメールアドレスが見出しに出る", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));

    expect(screen.getByText("taro@example.test")).toBeInTheDocument();
  });

  it("もう一度押すと閉じる", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "竹添太郎" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
  });

  it("Escape で閉じ、フォーカスがトリガーへ戻る", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "竹添太郎" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("外側をクリックすると閉じる", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <UserMenu userName="竹添太郎" userEmail="taro@example.test" />
        <button type="button">外側</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));
    await user.click(screen.getByRole("button", { name: "外側" }));

    expect(screen.queryByRole("link", { name: "プロフィール" })).toBeNull();
  });

  it("メニューの中をクリックしても閉じない", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "竹添太郎" }));
    await user.click(screen.getByText("taro@example.test"));

    expect(
      screen.getByRole("link", { name: "プロフィール" }),
    ).toBeInTheDocument();
  });
});
