import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const callOrder: string[] = [];

const requirePermission = vi.fn();
const listUsersInOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) => {
    callOrder.push("requirePermission");
    return requirePermission(slug, code);
  },
}));

vi.mock("@/features/organization-user/repository", () => ({
  listUsersInOrganization: (organizationId: string) => {
    callOrder.push("listUsersInOrganization");
    return listUsersInOrganization(organizationId);
  },
}));

// Server Action は import されるだけで、このテストでは呼ばれない。
vi.mock("@/features/organization-user/search/handler", () => ({
  searchUserAction: vi.fn(),
}));
vi.mock("@/features/organization-user/add/handler", () => ({
  addUserAction: vi.fn(),
}));
vi.mock("@/features/organization-user/remove/handler", () => ({
  removeUserAction: vi.fn(),
}));

const { default: OrganizationUsersPage } = await import("./page");

const pageProps = (slug: string) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "me", name: "竹添" } };
// id と slug をわざと異なる値にする。揃えると取り違えを見逃す。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const contextWith = (codes: readonly string[]) => ({
  session,
  organization,
  permissionCodes: [...codes],
  ability: defineAbilityFor(codes),
});

const users = [
  {
    userId: "me",
    name: "竹添",
    username: "takezo",
    email: "takezo@example.com",
    image: null,
    permissionCodes: ["user.view"],
    joinedAt: new Date("2026-08-01T00:00:00Z"),
  },
];

// canRemove の削除ボタンは自分自身の行には出ないため、
// canRemove/canGrant を区別するテストには自分以外のユーザーが要る。
const otherUser = {
  userId: "u2",
  name: "山田",
  username: "yamada",
  email: "yamada@example.com",
  image: null,
  permissionCodes: ["user.view"],
  joinedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("OrganizationUsersPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    listUsersInOrganization.mockReset();
    callOrder.length = 0;
    requirePermission.mockResolvedValue(contextWith(PERMISSION_CODES));
    listUsersInOrganization.mockResolvedValue(users);
  });

  it("user.view を要求する", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "user.view");
  });

  it("一覧は URL の slug ではなく organization.id で絞り込む", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(listUsersInOrganization).toHaveBeenCalledWith("o1");
  });

  it("requirePermission を一覧取得より先に呼ぶ", async () => {
    await OrganizationUsersPage(pageProps("tennis"));

    expect(callOrder).toEqual(["requirePermission", "listUsersInOrganization"]);
  });

  it("権限が無ければ(notFound)一覧取得は行わずページも失敗する", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(OrganizationUsersPage(pageProps("tennis"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(listUsersInOrganization).not.toHaveBeenCalled();
  });

  it("所属ユーザーを描画する", async () => {
    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("takezo@example.com")).toBeInTheDocument();
  });

  it("user.add を持たなければ追加フォームを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["user.view"]));

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByText("ユーザーを追加")).toBeNull();
  });

  it("user.add を持てば追加フォームを出す", async () => {
    requirePermission.mockResolvedValue(contextWith(["user.view", "user.add"]));

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("ユーザーを追加")).toBeInTheDocument();
  });

  it("user.remove だけ持てば削除ボタンが出て、権限編集リンクは出ない", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["user.view", "user.remove"]),
    );
    listUsersInOrganization.mockResolvedValue([otherUser]);

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText(`${otherUser.name} を削除`)).toBeInTheDocument();
    expect(screen.queryByText(/の権限を編集/)).toBeNull();
  });

  it("user.grant だけ持てば権限編集リンクが出て、削除ボタンは出ない", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["user.view", "user.grant"]),
    );
    listUsersInOrganization.mockResolvedValue([otherUser]);

    const element = await OrganizationUsersPage(pageProps("tennis"));
    render(element);

    expect(
      screen.getByText(`${otherUser.name} の権限を編集`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/を削除/)).toBeNull();
  });
});
