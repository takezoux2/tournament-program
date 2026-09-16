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
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  // require-organization.test.ts と同じ形で模す。
  throw new Error("NEXT_NOT_FOUND");
});

// TrackCreated が useRouter/usePathname を使うため、既存の notFound モックに足す。
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/shared/middleware/require-organization", () => ({
  requireOrganization: (slug: string) => requireOrganization(slug),
}));

vi.mock("@/features/tournament/repository", () => ({
  findTournamentInOrganization: (
    organizationId: string,
    tournamentId: string,
  ) => findTournamentInOrganization(organizationId, tournamentId),
}));

const listDivisionsInTournament = vi.fn();

vi.mock("@/features/division/repository", () => ({
  listDivisionsInTournament: (organizationId: string, tournamentId: string) =>
    listDivisionsInTournament(organizationId, tournamentId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/division/reorder/handler", () => ({
  reorderDivisionAction: async () => ({ error: null }),
}));

vi.mock("@/features/tournament/publish/handler", () => ({
  publishTournamentAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
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

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "DRAFT" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

describe("TournamentPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    notFound.mockClear();
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
    findTournamentInOrganization.mockResolvedValue(tournament);
    listDivisionsInTournament.mockReset();
    listDivisionsInTournament.mockResolvedValue([]);
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await Page(pageProps("tennis", "t1"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("大会取得は URL の slug ではなく requireOrganization が返した organization.id で絞り込む", async () => {
    await Page(pageProps("tennis", "t1"));

    // "tennis"(slug)ではなく"o1"(id)で呼ばれていることが要点。
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("大会が見つからなければ notFound を呼ぶ", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)大会取得は行わずページも失敗する", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(Page(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(findTournamentInOrganization).not.toHaveBeenCalled();
  });

  it("大会名を描画する", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.getByRole("heading", { name: "春季大会" }),
    ).toBeInTheDocument();
  });

  it("部門一覧も slug ではなく organization.id で絞り込む", async () => {
    await Page(pageProps("tennis", "t1"));

    expect(listDivisionsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("部門名を詳細ページへのリンクとして描画する", async () => {
    listDivisionsInTournament.mockResolvedValue([
      {
        id: "d1",
        name: "男子シングルス",
        order: 0,
        format: "SINGLE_ELIMINATION",
      },
    ]);

    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.getByRole("link", { name: "男子シングルス" }),
    ).toHaveAttribute("href", "/orgs/tennis/tournaments/t1/divisions/d1");
  });

  it("試合一覧ページへの導線を出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("link", { name: "試合一覧" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/matches",
    );
  });

  it("結果入力ページへの導線を出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("link", { name: "結果入力" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/results",
    );
  });

  it("公開ページへのリンクを出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.getByRole("link", { name: "公開ページを開く" }),
    ).toHaveAttribute("href", "/t/t1");
  });

  it("部門の作成ページへの導線を出す", async () => {
    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("link", { name: "部門を作成" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/divisions/new",
    );
  });

  it("準備中の大会には公開ボタンを出す", async () => {
    findTournamentInOrganization.mockResolvedValue({
      ...tournament,
      status: "DRAFT",
    });

    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(screen.getByRole("button", { name: "公開する" })).toBeInTheDocument();
  });

  it.each(["IN_PROGRESS", "COMPLETED"] as const)(
    "公開済み（%s）の大会には公開ボタンを出さない",
    async (status) => {
      findTournamentInOrganization.mockResolvedValue({
        ...tournament,
        status,
      });

      const element = await Page(pageProps("tennis", "t1"));
      render(element);

      expect(
        screen.queryByRole("button", { name: "公開する" }),
      ).not.toBeInTheDocument();
    },
  );

  it("tournament.edit を持たなければ、準備中でも公開ボタンを出さない", async () => {
    const codes = PERMISSION_CODES.filter((code) => code !== "tournament.edit");
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: codes,
      ability: defineAbilityFor(codes),
    });
    findTournamentInOrganization.mockResolvedValue({
      ...tournament,
      status: "DRAFT",
    });

    const element = await Page(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.queryByRole("button", { name: "公開する" }),
    ).not.toBeInTheDocument();
  });
});
