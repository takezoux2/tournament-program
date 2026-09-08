import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

// UserMenu 自体の挙動（開閉・Escape・外側クリック）は UserMenu.test.tsx で
// 検証済みのため、ここでは AppHeader のパンくず描画ロジックだけに集中できる
// ようモジュールごと差し替える。
vi.mock("@/components/layout/UserMenu", () => ({
  UserMenu: ({ userName }: { userName: string }) => (
    <button type="button">{userName}</button>
  ),
}));

describe("AppHeader", () => {
  it("href を持つパンくずはリンクとして描画される", () => {
    render(
      <AppHeader
        crumbs={[{ label: "組織一覧", href: "/orgs" }]}
        userName="竹添"
        userEmail="taro@example.test"
      />,
    );

    expect(screen.getByRole("link", { name: "組織一覧" })).toHaveAttribute(
      "href",
      "/orgs",
    );
  });

  it("href を持たないパンくずはリンクではなくテキストとして描画される", () => {
    render(
      <AppHeader
        crumbs={[{ label: "テニス部" }]}
        userName="竹添"
        userEmail="taro@example.test"
      />,
    );

    expect(screen.getByText("テニス部")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "テニス部" })).toBeNull();
  });

  it("3件のパンくずでは区切りが2つだけ描画される（先頭には区切りがない）", () => {
    const { container } = render(
      <AppHeader
        crumbs={[
          { label: "組織一覧", href: "/orgs" },
          { label: "テニス部", href: "/orgs/tennis" },
          { label: "設定" },
        ]}
        userName="竹添"
        userEmail="taro@example.test"
      />,
    );

    // 区切り文字「/」はパンくず内のスラッシュ専用要素にのみ現れる想定。
    const separators = container.querySelectorAll(
      "nav > span > span.text-slate-400",
    );
    expect(separators).toHaveLength(2);
  });

  it("ユーザー名はメニューを開くボタンとして描画される", () => {
    render(
      <AppHeader
        crumbs={[{ label: "組織一覧" }]}
        userName="竹添太郎"
        userEmail="taro@example.test"
      />,
    );

    expect(
      screen.getByRole("button", { name: "竹添太郎" }),
    ).toBeInTheDocument();
  });

  it("パンくずナビは aria-label 'パンくず' というアクセシブルネームで参照できる", () => {
    render(
      <AppHeader
        crumbs={[{ label: "組織一覧" }]}
        userName="竹添"
        userEmail="taro@example.test"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "パンくず" }),
    ).toBeInTheDocument();
  });

  describe("key の衝突", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("href を持たない2件のパンくずがあっても key 重複の警告が出ない", () => {
      render(
        <AppHeader
          crumbs={[{ label: "設定" }, { label: "設定" }]}
          userName="竹添"
          userEmail="taro@example.test"
        />,
      );

      const duplicateKeyWarning = consoleErrorSpy.mock.calls.some(
        (call: unknown[]) =>
          call.some((arg) => typeof arg === "string" && arg.includes("key")),
      );
      expect(duplicateKeyWarning).toBe(false);
    });
  });
});
