import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const loadResultRows = vi.fn();
const notFound = vi.fn(() => {
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
  loadResultRows: (organizationId: string, tournamentId: string) =>
    loadResultRows(organizationId, tournamentId),
}));
vi.mock("@/features/division/record-result/handler", () => ({
  recordResultAction: async () => ({ error: null }),
}));
vi.mock("@/features/division/update-result-detail/handler", () => ({
  updateResultDetailAction: async () => ({ error: null }),
}));

const { default: Page } = await import("./page");

const pageProps = (slug: string, tournamentId: string) => ({
  params: Promise.resolve({ slug, tournamentId }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };
const organization = { id: "o1", name: "テニス部", slug: "tennis" };
const tournament = { id: "t1", name: "春季大会" };

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  loadResultRows.mockReset();
  notFound.mockClear();
  requireOrganization.mockResolvedValue({ session, organization });
  findTournamentInOrganization.mockResolvedValue(tournament);
  loadResultRows.mockResolvedValue([
    {
      kind: "match",
      key: "match:d1:m1-0",
      divisionId: "d1",
      divisionName: "男子",
      matchId: "m1-0",
      matchName: "1",
      label: "1回戦 第1試合",
      slots: [
        { label: "山田", entryId: "e1" },
        { label: "佐藤", entryId: "e2" },
      ],
      winnerEntryId: null,
      state: "ready",
      downstreamRecordedCount: 0,
      resultConfig: {
        version: 1,
        winReason: { enabled: false, options: [] },
        score: { enabled: false, count: 3, aggregation: "sum" },
        note: { enabled: false },
      },
      winReason: null,
      scores: [],
      note: null,
    },
  ]);
});

describe("TournamentResultsPage", () => {
  it("組織の所有権を確かめ、大会の行を読む", async () => {
    render(await Page(pageProps("tennis", "t1")));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
    expect(loadResultRows).toHaveBeenCalledWith("o1", "t1");
    expect(
      screen.getByRole("button", { name: "男子 1 山田の勝ち" }),
    ).toBeInTheDocument();
  });

  it("大会がこの組織に無ければ notFound へ倒す", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(Page(pageProps("tennis", "t9"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(loadResultRows).not.toHaveBeenCalled();
  });
});
