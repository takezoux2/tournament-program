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
vi.mock("@/features/division/generate-matching/handler", () => ({
  generateMatchingAction: vi.fn(),
}));
vi.mock("@/features/division/set-match-name/handler", () => ({
  setMatchNameAction: vi.fn(),
}));
vi.mock("@/features/division/add-first-round-match/handler", () => ({
  addFirstRoundMatchAction: vi.fn(),
}));
vi.mock("@/features/division/remove-first-round-match/handler", () => ({
  removeFirstRoundMatchAction: vi.fn(),
}));
vi.mock("@/features/division/assign-slot/handler", () => ({
  assignSlotAction: vi.fn(),
}));
vi.mock("@/features/division/clear-slot/handler", () => ({
  clearSlotAction: vi.fn(),
}));

// actions プロップに何を渡したかを見たいので、受け取った props を控えるダミーに差し替える。
const bracketEditorSetupProps = vi.fn();
vi.mock("@/components/division/BracketEditorSetup", () => ({
  BracketEditorSetup: (props: unknown) => {
    bracketEditorSetupProps(props);
    return <div>bracket-setup</div>;
  },
}));

const { default: DivisionSetupPage } = await import("./page");
const { generateMatchingAction } = await import(
  "@/features/division/generate-matching/handler"
);
const { setMatchNameAction } = await import(
  "@/features/division/set-match-name/handler"
);
const { addFirstRoundMatchAction } = await import(
  "@/features/division/add-first-round-match/handler"
);
const { removeFirstRoundMatchAction } = await import(
  "@/features/division/remove-first-round-match/handler"
);
const { assignSlotAction } = await import(
  "@/features/division/assign-slot/handler"
);
const { clearSlotAction } = await import(
  "@/features/division/clear-slot/handler"
);

const pageProps = () => ({
  params: Promise.resolve({
    slug: "acme",
    tournamentId: "t1",
    divisionId: "d1",
  }),
  searchParams: Promise.resolve({}),
});

const session = { user: { id: "u1", name: "竹添" } };

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
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

  requireOrganization.mockResolvedValue({
    session,
    organization: { id: "o1", name: "アクメ", slug: "acme" },
  });
  findTournamentInOrganization.mockResolvedValue({
    id: "t1",
    name: "春季大会",
  });
  findDivisionInTournament.mockResolvedValue(division);
  listParticipantsInTournament.mockResolvedValue([]);
  listMembersInOrganization.mockResolvedValue([]);
  listOverallOrderSources.mockResolvedValue(new Map());
  bracketEditorSetupProps.mockClear();
});

describe("DivisionSetupPage", () => {
  it("組織の認可を確かめてから描く", async () => {
    render(await DivisionSetupPage(pageProps()));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(screen.getByText("bracket-setup")).toBeInTheDocument();
  });

  it("パンくずに大会と部門を出す", async () => {
    render(await DivisionSetupPage(pageProps()));

    expect(screen.getByText("春季大会")).toBeInTheDocument();
    expect(screen.getByText("男子シングルス")).toBeInTheDocument();
  });

  it("部門が無ければ 404 にする", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("大会が無ければ 404 にする", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("リーグは 404 に倒す", async () => {
    // リーグには専用画面（/league）があるので、この画面では扱わない。
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN",
    });
    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("大会 id で通し番号を読み、BracketEditorSetup にそのまま渡す", async () => {
    const overallSeq = new Map([["d1:m1-0", 1]]);
    listOverallOrderSources.mockResolvedValue(overallSeq);

    render(await DivisionSetupPage(pageProps()));

    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
    expect(bracketEditorSetupProps).toHaveBeenCalledTimes(1);
    const { overallSeq: passed } = bracketEditorSetupProps.mock.calls[0][0] as {
      overallSeq: unknown;
    };
    expect(passed).toBe(overallSeq);
  });

  it("シングルエリミは BracketEditorSetup に 6 つのアクションを渡す", async () => {
    // 6 つとも別モジュールの vi.fn() なので参照が異なる。取り違えて渡すと
    // toEqual が落ちる。同じ関数を使い回すダミーでは検出できない観点。
    render(await DivisionSetupPage(pageProps()));
    const props = bracketEditorSetupProps.mock.calls[0][0] as {
      actions: Record<string, unknown>;
    };
    expect(props.actions).toEqual({
      addFirstRoundMatch: addFirstRoundMatchAction,
      removeFirstRoundMatch: removeFirstRoundMatchAction,
      assignSlot: assignSlotAction,
      clearSlot: clearSlotAction,
      generateMatching: generateMatchingAction,
      setMatchName: setMatchNameAction,
    });
  });
});
