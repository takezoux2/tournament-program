import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireSession = vi.fn();
const listMembershipsForUser = vi.fn();

vi.mock("@/shared/middleware/require-session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("@/features/organization/repository", () => ({
  listMembershipsForUser: (userId: string) => listMembershipsForUser(userId),
}));

const { default: ProfileOrgsPage } = await import("./page");

describe("ProfileOrgsPage", () => {
  beforeEach(() => {
    requireSession.mockReset();
    listMembershipsForUser.mockReset();
    requireSession.mockResolvedValue({
      user: { id: "u1", name: "竹添太郎", email: "taro@example.test" },
    });
    listMembershipsForUser.mockResolvedValue([
      {
        id: "o1",
        name: "テニス部",
        slug: "tennis",
        joinedAt: new Date("2026-08-01T00:00:00Z"),
        permissions: [{ code: "org.edit", description: "組織の編集" }],
      },
    ]);
  });

  it("セッションのユーザーの所属だけを引く", async () => {
    render(await ProfileOrgsPage());

    expect(listMembershipsForUser).toHaveBeenCalledWith("u1");
  });

  it("所属組織と権限が出る", async () => {
    render(await ProfileOrgsPage());

    expect(screen.getByRole("link", { name: "テニス部" })).toBeInTheDocument();
    expect(screen.getByText("組織の編集")).toBeInTheDocument();
  });

  it("プロフィールへ戻るパンくずがある", async () => {
    render(await ProfileOrgsPage());

    expect(screen.getByRole("link", { name: "プロフィール" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });
});
