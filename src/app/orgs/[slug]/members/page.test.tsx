import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const callOrder: string[] = [];

const requirePermission = vi.fn();
const listMembersInOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requirePermission: (slug: string, code: string) => {
    callOrder.push("requirePermission");
    return requirePermission(slug, code);
  },
}));

vi.mock("@/features/member/repository", () => ({
  listMembersInOrganization: (organizationId: string) => {
    callOrder.push("listMembersInOrganization");
    return listMembersInOrganization(organizationId);
  },
}));

// Server Action は import されるだけで、このテストでは呼ばれない。
vi.mock("@/features/member/add/handler", () => ({
  addMemberAction: vi.fn(),
}));
vi.mock("@/features/member/remove/handler", () => ({
  removeMemberAction: vi.fn(),
}));

const { default: OrganizationMembersPage } = await import("./page");

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

const members = [{ id: "m1", name: "山田", nameKana: "やまだ" }];

describe("OrganizationMembersPage", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    listMembersInOrganization.mockReset();
    callOrder.length = 0;
    requirePermission.mockResolvedValue(contextWith(PERMISSION_CODES));
    listMembersInOrganization.mockResolvedValue(members);
  });

  it("member.view を要求する", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(requirePermission).toHaveBeenCalledWith("tennis", "member.view");
  });

  it("一覧は URL の slug ではなく organization.id で絞り込む", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(listMembersInOrganization).toHaveBeenCalledWith("o1");
  });

  it("requirePermission を一覧取得より先に呼ぶ", async () => {
    await OrganizationMembersPage(pageProps("tennis"));

    expect(callOrder).toEqual([
      "requirePermission",
      "listMembersInOrganization",
    ]);
  });

  it("権限が無ければ(notFound)一覧取得は行わずページも失敗する", async () => {
    requirePermission.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(OrganizationMembersPage(pageProps("tennis"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(listMembersInOrganization).not.toHaveBeenCalled();
  });

  it("メンバーを描画する", async () => {
    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("山田")).toBeInTheDocument();
    expect(screen.getByText("やまだ")).toBeInTheDocument();
  });

  it("member.add を持たなければ追加フォームを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["member.view"]));

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByText("メンバーを追加")).toBeNull();
  });

  it("member.add を持てば追加フォームを出す", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["member.view", "member.add"]),
    );

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.getByText("メンバーを追加")).toBeInTheDocument();
  });

  it("member.remove を持たなければ削除ボタンを出さない", async () => {
    requirePermission.mockResolvedValue(contextWith(["member.view"]));

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("member.remove を持てば削除ボタンを出す", async () => {
    requirePermission.mockResolvedValue(
      contextWith(["member.view", "member.remove"]),
    );

    const element = await OrganizationMembersPage(pageProps("tennis"));
    render(element);

    expect(
      screen.getByRole("button", { name: "山田 を削除" }),
    ).toBeInTheDocument();
  });
});
