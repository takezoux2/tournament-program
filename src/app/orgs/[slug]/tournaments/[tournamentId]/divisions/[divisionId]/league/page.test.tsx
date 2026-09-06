import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const findDivisionInTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const listMembersInOrganization = vi.fn();
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

vi.mock("@/features/division/repository", () => ({
  findDivisionInTournament: (
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ) => findDivisionInTournament(organizationId, tournamentId, divisionId),
  listParticipantsInTournament: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsInTournament(organizationId, tournamentId),
}));

vi.mock("@/features/organization/repository", () => ({
  listMembersInOrganization: (organizationId: string) =>
    listMembersInOrganization(organizationId),
}));

// 6 つの Server Action は "use server" を持つので、テストでは差し替える。
vi.mock("@/features/division/add-entry/handler", () => ({
  addEntryAction: vi.fn(),
}));
vi.mock("@/features/division/remove-entry/handler", () => ({
  removeEntryAction: vi.fn(),
}));
vi.mock("@/features/division/reorder-entry/handler", () => ({
  reorderEntryAction: vi.fn(),
}));
vi.mock("@/features/division/generate-matching/handler", () => ({
  generateMatchingAction: vi.fn(),
}));
vi.mock("@/features/division/set-match-number/handler", () => ({
  setMatchNumberAction: vi.fn(),
}));
vi.mock("@/features/division/set-player-number/handler", () => ({
  setPlayerNumberAction: vi.fn(),
}));

const leagueSetupProps = vi.fn();
vi.mock("@/components/division/LeagueSetup", () => ({
  LeagueSetup: (props: unknown) => {
    leagueSetupProps(props);
    return <div>league</div>;
  },
}));

const { default: LeagueSetupPage } = await import("./page");

// PageProps<".../league"> は searchParams も必須のため、呼び出しのたびに
// 書き直さずに済むようここでまとめて組み立てる。
const pageProps = () => ({
  params: Promise.resolve({
    slug: "acme",
    tournamentId: "t1",
    divisionId: "d1",
  }),
  searchParams: Promise.resolve({}),
});

const league = {
  id: "d1",
  name: "総当たりリーグ",
  order: 0,
  format: "ROUND_ROBIN",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  requireOrganization.mockReset();
  findTournamentInOrganization.mockReset();
  findDivisionInTournament.mockReset();
  listParticipantsInTournament.mockReset();
  listMembersInOrganization.mockReset();
  notFound.mockClear();
  leagueSetupProps.mockClear();

  requireOrganization.mockResolvedValue({
    session: { user: { name: "運営者" } },
    organization: { id: "o1", name: "アクメ" },
  });
  findTournamentInOrganization.mockResolvedValue({ id: "t1", name: "春季大会" });
  findDivisionInTournament.mockResolvedValue(league);
  listParticipantsInTournament.mockResolvedValue([]);
  listMembersInOrganization.mockResolvedValue([]);
});

describe("LeagueSetupPage", () => {
  it("リーグの部門なら編集画面を描く", async () => {
    render(await LeagueSetupPage(pageProps()));
    expect(screen.getByText("league")).toBeInTheDocument();
  });

  it("部門が無ければ 404 に倒す", async () => {
    findDivisionInTournament.mockResolvedValue(null);
    await expect(LeagueSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("リーグ以外の形式は 404 に倒す", async () => {
    // 専用画面が別にあるので、案内より 404 が正しい。
    findDivisionInTournament.mockResolvedValue({
      ...league,
      format: "SINGLE_ELIMINATION",
    });
    await expect(LeagueSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("6 つの Server Action を配線する", async () => {
    render(await LeagueSetupPage(pageProps()));
    const props = leagueSetupProps.mock.calls[0][0] as {
      actions: Record<string, unknown>;
    };
    expect(Object.keys(props.actions).sort()).toEqual([
      "addEntry",
      "generateMatching",
      "removeEntry",
      "reorderEntry",
      "setMatchNumber",
      "setPlayerNumber",
    ]);
  });
});
