import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationUserSummary } from "@/features/organization-user/repository";
import { OrganizationUserList } from "./OrganizationUserList";

const removeAction = vi.fn(async () => ({ error: null }));

const users: OrganizationUserSummary[] = [
  {
    userId: "me",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
    permissionCodes: ["user.view", "user.add"],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
  },
  {
    userId: "u2",
    name: "山田",
    username: "yamada",
    email: "yamada@example.com",
    image: null,
    permissionCodes: ["user.view"],
    joinedAt: new Date("2026-08-02T00:00:00Z"),
  },
];

const renderList = (
  overrides: Partial<Parameters<typeof OrganizationUserList>[0]> = {},
) =>
  render(
    <OrganizationUserList
      slug="tennis"
      users={users}
      currentUserId="me"
      canRemove={true}
      canGrant={true}
      removeAction={removeAction}
      {...overrides}
    />,
  );

describe("OrganizationUserList", () => {
  beforeEach(() => {
    removeAction.mockClear();
  });

  it("所属ユーザーの表示名とユーザー名とメールを出す", () => {
    renderList();

    expect(screen.getByText("竹添")).toBeInTheDocument();
    expect(screen.getByText("takezo")).toBeInTheDocument();
    expect(screen.getByText("takezo@example.com")).toBeInTheDocument();
  });

  it("保有権限の件数を出す", () => {
    renderList();

    expect(screen.getByText("権限 2 件")).toBeInTheDocument();
    expect(screen.getByText("権限 1 件")).toBeInTheDocument();
  });

  it("canGrant なら権限編集へのリンクを出す", () => {
    renderList();

    expect(
      screen.getByRole("link", { name: "山田 の権限を編集" }),
    ).toHaveAttribute("href", "/orgs/tennis/users/u2/permissions");
  });

  it("canGrant が false なら権限編集のリンクを出さない", () => {
    renderList({ canGrant: false });

    expect(screen.queryByRole("link", { name: /権限を編集/ })).toBeNull();
  });

  it("canRemove が false なら削除ボタンを出さない", () => {
    renderList({ canRemove: false });

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("自分自身の行には削除ボタンを出さない", () => {
    renderList();

    // 「山田 を削除」はあるが「竹添 を削除」は無い。
    expect(
      screen.getByRole("button", { name: "山田 を削除" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "竹添 を削除" })).toBeNull();
  });

  it("ユーザーが 0 人なら案内を出す", () => {
    renderList({ users: [] });

    expect(
      screen.getByText("この組織に所属しているユーザーはいません"),
    ).toBeInTheDocument();
  });

  describe("削除の確認ダイアログ", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("確認をキャンセルすると削除アクションを呼ばない", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "山田 を削除" }));

      expect(removeAction).not.toHaveBeenCalled();
    });

    it("確認を承諾すると削除アクションを呼ぶ", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "山田 を削除" }));

      expect(removeAction).toHaveBeenCalled();
    });
  });
});
