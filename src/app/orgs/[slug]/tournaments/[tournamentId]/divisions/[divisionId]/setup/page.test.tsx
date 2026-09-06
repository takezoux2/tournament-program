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

// 7 つの Server Action は "use server" を持つので、テストでは差し替える。
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
vi.mock("@/features/division/swap-slots/handler", () => ({
  swapSlotsAction: vi.fn(),
}));
vi.mock("@/features/division/set-match-number/handler", () => ({
  setMatchNumberAction: vi.fn(),
}));
vi.mock("@/features/division/set-player-number/handler", () => ({
  setPlayerNumberAction: vi.fn(),
}));

// actions プロップに何を渡したかを見たいので、受け取った props を控えるダミーに差し替える。
const divisionSetupProps = vi.fn();
vi.mock("@/components/division/DivisionSetup", () => ({
  DivisionSetup: (props: unknown) => {
    divisionSetupProps(props);
    return <div>setup</div>;
  },
}));

const { default: DivisionSetupPage } = await import("./page");
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
const { swapSlotsAction } = await import(
  "@/features/division/swap-slots/handler"
);
const { setMatchNumberAction } = await import(
  "@/features/division/set-match-number/handler"
);
const { setPlayerNumberAction } = await import(
  "@/features/division/set-player-number/handler"
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
  divisionSetupProps.mockClear();
});

describe("DivisionSetupPage", () => {
  it("組織の認可を確かめてから描く", async () => {
    render(await DivisionSetupPage(pageProps()));

    expect(requireOrganization).toHaveBeenCalledWith("acme");
    expect(screen.getByText("setup")).toBeInTheDocument();
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

  it("シングルエリミネーション以外は 404 に倒す", async () => {
    // リーグには専用画面（/league）があるので、この画面では扱わない。
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN",
    });
    await expect(DivisionSetupPage(pageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("7 つの Server Action をそれぞれ対応する actions のプロパティに渡す", async () => {
    // 7 つとも別モジュールの vi.fn() なので参照が異なる。取り違えて渡すと
    // toBe が落ちる。同じ関数を使い回すダミーでは検出できない観点。
    render(await DivisionSetupPage(pageProps()));

    expect(divisionSetupProps).toHaveBeenCalledTimes(1);
    const { actions } = divisionSetupProps.mock.calls[0][0] as {
      actions: Record<string, unknown>;
    };
    expect(actions.addEntry).toBe(addEntryAction);
    expect(actions.removeEntry).toBe(removeEntryAction);
    expect(actions.reorderEntry).toBe(reorderEntryAction);
    expect(actions.generateMatching).toBe(generateMatchingAction);
    expect(actions.swapSlots).toBe(swapSlotsAction);
    expect(actions.setMatchNumber).toBe(setMatchNumberAction);
    expect(actions.setPlayerNumber).toBe(setPlayerNumberAction);
  });
});
