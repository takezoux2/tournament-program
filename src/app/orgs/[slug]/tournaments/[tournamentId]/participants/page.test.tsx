import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAbilityFor, PERMISSION_CODES } from "@/shared/authz/ability";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const listParticipantsWithDivisions = vi.fn();
const listMembersInOrganization = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("@/features/tournament/repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));

vi.mock("@/features/participant/repository", () => ({
  listParticipantsWithDivisions: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsWithDivisions(organizationId, tournamentId),
}));

vi.mock("@/features/member/repository", () => ({
  listMembersInOrganization: (organizationId: string) =>
    listMembersInOrganization(organizationId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/participant/add/handler", () => ({
  addParticipantAction: async () => ({ error: null }),
}));

vi.mock("@/features/participant/remove/handler", () => ({
  removeParticipantAction: async () => ({ error: null }),
}));

vi.mock("@/features/participant/set-player-number/handler", () => ({
  setPlayerNumberAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添", email: "a@example.com" } };

const context = (codes: readonly string[]) => ({
  session,
  organization: { id: "o1", name: "テニス部", slug: "tennis" },
  ability: defineAbilityFor(codes),
});

describe("管理画面の参加者一覧ページ", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    listParticipantsWithDivisions.mockReset();
    listMembersInOrganization.mockReset();
    notFound.mockClear();

    requireOrganization.mockResolvedValue(context(PERMISSION_CODES));
    findTournamentInOrganization.mockResolvedValue({
      id: "t1",
      name: "春季大会",
      status: "DRAFT",
    });
    listParticipantsWithDivisions.mockResolvedValue([
      {
        id: "p1",
        name: "山田",
        nameKana: "やまだ",
        playerNumber: "1",
        divisions: [{ id: "d1", name: "男子の部" }],
      },
    ]);
    listMembersInOrganization.mockResolvedValue([
      { id: "m1", name: "山田", nameKana: "やまだ" },
    ]);
  });

  it("組織に属さない大会なら 404 に倒す", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t9"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("URL の slug ではなく organization.id で絞って読む", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(listParticipantsWithDivisions).toHaveBeenCalledWith("o1", "t1");
  });

  it("参加者と出場部門を出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByText("山田")).toBeVisible();
    expect(screen.getByText("男子の部")).toBeVisible();
  });

  it("tournament.edit があれば追加フォームを出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByText("参加者を追加")).toBeVisible();
  });

  it("tournament.edit が無ければ追加も削除も出さない", async () => {
    // 出し分けは体感のためで、境界は各 Server Action の requirePermission。
    requireOrganization.mockResolvedValue(context([]));

    render(await Page(pageProps("tennis", "t1")));

    expect(screen.queryByText("参加者を追加")).toBeNull();
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("大会詳細へ戻るパンくずを出す", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1",
    );
  });
});
