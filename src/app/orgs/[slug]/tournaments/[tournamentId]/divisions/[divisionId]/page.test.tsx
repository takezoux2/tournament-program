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
const findDivisionInTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
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

// DivisionMatchingView は組み合わせの組み立てまで踏み込むため、ページのテストでは
// division / participants をそのまま受け取っているかだけを見たいのでダミーへ差し替える。
// needsParticipants は本物を使う（参加者を引く条件がページの責務だから）。
vi.mock(
  "@/components/division/DivisionMatchingView",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/division/DivisionMatchingView")
      >();
    return {
      needsParticipants: actual.needsParticipants,
      DivisionMatchingView: () => <div>matching</div>,
    };
  },
);

const { default: DivisionPage } = await import("./page");

const pageProps = (slug: string, tournamentId: string, divisionId: string) => ({
  params: Promise.resolve({ slug, tournamentId, divisionId }),
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
  startsAt: new Date(2026, 7, 29, 10, 5),
  status: "DRAFT" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

// id / name / order をわざと異なる値にしておく。取り違えた実装を見分けるため。
const division = {
  id: "d1",
  name: "男子シングルス",
  order: 3,
  format: "SINGLE_ELIMINATION" as const,
  entries: [],
  matchingConfig: { matches: [] },
  results: [],
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

describe("DivisionPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    findDivisionInTournament.mockReset();
    listParticipantsInTournament.mockReset();
    notFound.mockClear();
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: [...PERMISSION_CODES],
      ability: defineAbilityFor(PERMISSION_CODES),
    });
    findTournamentInOrganization.mockResolvedValue(tournament);
    findDivisionInTournament.mockResolvedValue(division);
    listParticipantsInTournament.mockResolvedValue([]);
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("大会取得・部門取得ともに URL の slug ではなく organization.id で絞り込む", async () => {
    await DivisionPage(pageProps("tennis", "t1", "d1"));

    // "tennis"(slug)ではなく"o1"(id)で呼ばれていることが要点。
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t1", "d1");
  });

  it("部門取得には URL の tournamentId と divisionId をそのまま渡す", async () => {
    await DivisionPage(pageProps("tennis", "t2", "d2"));

    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t2", "d2");
  });

  it("大会が見つからなければ notFound を呼ぶ", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(DivisionPage(pageProps("tennis", "t1", "d1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("部門が見つからなければ notFound を呼ぶ", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(DivisionPage(pageProps("tennis", "t1", "d1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)大会取得・部門取得とも行わずページも失敗する", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(DivisionPage(pageProps("tennis", "t1", "d1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(findTournamentInOrganization).not.toHaveBeenCalled();
    expect(findDivisionInTournament).not.toHaveBeenCalled();
  });

  it("SINGLE_ELIMINATION の部門では参加者一覧を organization.id と tournamentId で取得する", async () => {
    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("ROUND_ROBIN の部門でも参加者一覧を取得する（結果表に名前が要る）", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN",
    });

    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("描画に参加者を使わない形式では参加者一覧を取得しない", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
    });

    await DivisionPage(pageProps("tennis", "t1", "d1"));

    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });

  it("部門名を見出しに描画する", async () => {
    const element = await DivisionPage(pageProps("tennis", "t1", "d1"));
    render(element);

    expect(
      screen.getByRole("heading", { name: "男子シングルス" }),
    ).toBeInTheDocument();
  });
});
