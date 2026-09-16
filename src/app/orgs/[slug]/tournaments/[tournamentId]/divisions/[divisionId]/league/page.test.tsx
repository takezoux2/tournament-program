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
const listOverallOrderSources = vi.fn();
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
  listOverallOrderSources: (tournamentId: string) =>
    listOverallOrderSources(tournamentId),
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
vi.mock("@/features/division/set-match-name/handler", () => ({
  setMatchNameAction: vi.fn(),
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
const { addEntryAction } = await import(
  "@/features/division/add-entry/handler"
);
const { removeEntryAction } = await import(
  "@/features/division/remove-entry/handler"
);
const { reorderEntryAction } = await import(
  "@/features/division/reorder-entry/handler"
);
const { generateMatchingAction } = await import(
  "@/features/division/generate-matching/handler"
);
const { setMatchNameAction } = await import(
  "@/features/division/set-match-name/handler"
);
const { setPlayerNumberAction } = await import(
  "@/features/division/set-player-number/handler"
);

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
  listOverallOrderSources.mockReset();
  notFound.mockClear();
  leagueSetupProps.mockClear();

  requireOrganization.mockResolvedValue({
    session: { user: { name: "運営者" } },
    organization: { id: "o1", name: "アクメ" },
  });
  findTournamentInOrganization.mockResolvedValue({
    id: "t1",
    name: "春季大会",
  });
  findDivisionInTournament.mockResolvedValue(league);
  listParticipantsInTournament.mockResolvedValue([]);
  listMembersInOrganization.mockResolvedValue([]);
  listOverallOrderSources.mockResolvedValue(new Map());
});

describe("LeagueSetupPage", () => {
  it("組織の認可を確かめてから描く", async () => {
    render(await LeagueSetupPage(pageProps()));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(screen.getByText("league")).toBeInTheDocument();
  });

  it("requireOrganization が解決した organization.id を後続に渡す", async () => {
    // slug やルートパラメータそのものではなく、認可を経た organization.id が
    // 届いていることを確かめる。取り違えると別組織のデータを引いてしまう。
    render(await LeagueSetupPage(pageProps()));

    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t1", "d1");
    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("部門が無ければ 404 に倒す", async () => {
    findDivisionInTournament.mockResolvedValue(null);
    await expect(LeagueSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("大会が無ければ 404 に倒す", async () => {
    findTournamentInOrganization.mockResolvedValue(null);
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

  it("大会 id で通し番号を読み、LeagueSetup にそのまま渡す", async () => {
    const overallSeq = new Map([["d1:m1-0", 1]]);
    listOverallOrderSources.mockResolvedValue(overallSeq);

    render(await LeagueSetupPage(pageProps()));

    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
    expect(leagueSetupProps).toHaveBeenCalledTimes(1);
    const { overallSeq: passed } = leagueSetupProps.mock.calls[0][0] as {
      overallSeq: unknown;
    };
    expect(passed).toBe(overallSeq);
  });

  it("6 つの Server Action をそれぞれ対応する actions のプロパティに渡す", async () => {
    // 6 つとも別モジュールの vi.fn() なので参照が異なる。Object.keys().sort()
    // だけの比較では 2 つの action を取り違えて渡しても通ってしまうため、
    // setup/page.test.tsx と同じく 1 つずつ toBe で参照を確かめる。
    render(await LeagueSetupPage(pageProps()));

    expect(leagueSetupProps).toHaveBeenCalledTimes(1);
    const { actions } = leagueSetupProps.mock.calls[0][0] as {
      actions: Record<string, unknown>;
    };
    expect(actions.addEntry).toBe(addEntryAction);
    expect(actions.removeEntry).toBe(removeEntryAction);
    expect(actions.reorderEntry).toBe(reorderEntryAction);
    expect(actions.generateMatching).toBe(generateMatchingAction);
    expect(actions.setMatchName).toBe(setMatchNameAction);
    expect(actions.setPlayerNumber).toBe(setPlayerNumberAction);
    expect(actions).not.toHaveProperty("reorderMatches");
  });
});
