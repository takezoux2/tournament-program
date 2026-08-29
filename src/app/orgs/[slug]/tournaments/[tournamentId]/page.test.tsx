import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
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
      role: "OWNER",
    });
    findTournamentInOrganization.mockResolvedValue(tournament);
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
});
