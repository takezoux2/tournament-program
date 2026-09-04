import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ここではページ本体の検証に集中したいので AppHeader.test.tsx と同じ方針で
// モジュールごと差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const callOrder: string[] = [];

const requireOrganization = vi.fn();
const listTournamentsInOrganization = vi.fn();

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => {
    callOrder.push("requireOrganization");
    return requireOrganization(slug);
  },
}));

vi.mock("@/features/tournament/repository", () => ({
  listTournamentsInOrganization: (organizationId: string) => {
    callOrder.push("listTournamentsInOrganization");
    return listTournamentsInOrganization(organizationId);
  },
}));

const { default: OrganizationPage } = await import("./page");

// PageProps<"/orgs/[slug]"> は searchParams も必須のため、呼び出しのたびに
// 書き直さずに済むようここでまとめて組み立てる。
const pageProps = (slug: string) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
// id と slug をわざと異なる値にする。揃えてしまうと「slug を誤って渡しても
// id を渡しても結果が同じ」テストになり、本来検出したい取り違えを見逃す。
const organization = {
  id: "o1",
  name: "テニス部",
  slug: "tennis",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

describe("OrganizationPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    listTournamentsInOrganization.mockReset();
    callOrder.length = 0;
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
    listTournamentsInOrganization.mockResolvedValue([]);
  });

  it("大会一覧は URL の slug ではなく requireOrganization が返した organization.id で絞り込む", async () => {
    await OrganizationPage(pageProps("tennis"));

    // "tennis"(slug)ではなく"o1"(id)で呼ばれていることが要点。
    expect(listTournamentsInOrganization).toHaveBeenCalledWith("o1");
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await OrganizationPage(pageProps("tennis"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("requireOrganization を大会取得より先に呼ぶ", async () => {
    await OrganizationPage(pageProps("tennis"));

    expect(callOrder).toEqual([
      "requireOrganization",
      "listTournamentsInOrganization",
    ]);
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)大会取得は行わずページも失敗する", async () => {
    // 実装では notFound() が例外を投げて制御を打ち切る。
    // require-organization.test.ts と同じ形で模す。
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(OrganizationPage(pageProps("tennis"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(listTournamentsInOrganization).not.toHaveBeenCalled();
  });

  it("組織名と大会一覧を実際に描画する", async () => {
    listTournamentsInOrganization.mockResolvedValue([
      { id: "t1", name: "春季大会", startsAt: null, status: "DRAFT" },
    ]);

    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.getAllByText("テニス部").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1",
    );
  });

  it("user.view を持てばユーザー管理へのリンクを出す", async () => {
    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.getByRole("link", { name: "ユーザー管理" })).toHaveAttribute(
      "href",
      "/orgs/tennis/users",
    );
  });

  it("user.view を持たなければユーザー管理へのリンクを出さない", async () => {
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [],
      ability: defineAbilityFor([]),
    });

    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("link", { name: "ユーザー管理" })).toBeNull();
  });

  it("member.view を持てばメンバー管理へのリンクを出す", async () => {
    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.getByRole("link", { name: "メンバー管理" })).toHaveAttribute(
      "href",
      "/orgs/tennis/members",
    );
  });

  it("member.view を持たなければメンバー管理のリンクを出さない", async () => {
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: ["user.view"],
      ability: defineAbilityFor(["user.view"]),
    });

    const element = await OrganizationPage(pageProps("tennis"));
    render(element);

    expect(screen.queryByRole("link", { name: "メンバー管理" })).toBeNull();
  });
});
