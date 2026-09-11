import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const loadScheduleView = vi.fn();
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
vi.mock("@/features/schedule/repository", () => ({
  loadScheduleView: (organizationId: string, tournamentId: string) =>
    loadScheduleView(organizationId, tournamentId),
}));

// Server Action はページ本体の検証に関係しないので、素通しの関数へ差し替える。
vi.mock("@/features/schedule/reorder/handler", () => ({
  reorderScheduleAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/insert-divider/handler", () => ({
  insertDividerAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/update-divider/handler", () => ({
  updateDividerAction: async () => ({ error: null }),
}));
vi.mock("@/features/schedule/remove-divider/handler", () => ({
  removeDividerAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
// id と slug をわざと異なる値にする。揃えてしまうと取り違えを見逃す。
const organization = { id: "o1", name: "テニス部", slug: "tennis" };
const tournament = { id: "t1", name: "春季大会" };

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  loadScheduleView.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ session, organization });
  findTournamentInOrganization.mockResolvedValue(tournament);
  loadScheduleView.mockResolvedValue([
    {
      kind: "match",
      key: "match:dA:m1-0",
      divisionId: "dA",
      divisionName: "男子シングルス",
      matchId: "m1-0",
      matchName: "1",
      label: "1回戦 第1試合",
      card: "山田 vs 佐藤",
    },
  ]);
});

describe("TournamentMatchesPage", () => {
  it("組織 id で一覧を読み、試合を描く", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(loadScheduleView).toHaveBeenCalledWith("o1", "t1");
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
    // 見出しは h1 から始める（他のページと同じ）。
    expect(
      screen.getByRole("heading", { level: 1, name: "試合一覧" }),
    ).toBeInTheDocument();
  });

  it("大会が無ければ 404 にする", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(loadScheduleView).not.toHaveBeenCalled();
  });
});
