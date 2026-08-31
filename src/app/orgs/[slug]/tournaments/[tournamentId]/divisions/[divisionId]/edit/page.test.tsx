import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LogoutButton は authClient / useRouter に依存するクライアントコンポーネントで、
// ページ本体の検証に集中したいので他のページテストと同じ方針で差し替える。
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: () => <button type="button">ログアウト</button>,
}));

const requireOrganization = vi.fn();
const findTournamentInOrganization = vi.fn();
const findDivisionInTournament = vi.fn();
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

vi.mock("@/features/division/repository", () => ({
  findDivisionInTournament: (
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ) => findDivisionInTournament(organizationId, tournamentId, divisionId),
}));

// handler.ts は repository 経由で prisma モジュールを読み込み、
// DATABASE_URL 未設定のテスト環境では import するだけで例外になる。
// updateDivisionAction / deleteDivisionAction を区別できるダミー値へ差し替え、
// DivisionForm / DeleteDivisionForm どちらに渡っているかを後段で検証する。
vi.mock("@/features/division/update/handler", () => ({
  updateDivisionAction: "update-action-sentinel",
}));
vi.mock("@/features/division/delete/handler", () => ({
  deleteDivisionAction: "delete-action-sentinel",
}));

// DivisionForm / DeleteDivisionForm はどちらも同じ DivisionFormAction 型を
// action として受け取るため、取り違えても型検査は通ってしまう。
// 実コンポーネントの代わりに action prop をそのまま表示するダミーへ差し替え、
// どちらの sentinel が渡っているかを画面に出して検証できるようにする。
vi.mock("@/components/division/DivisionForm", () => ({
  DivisionForm: (props: { action: unknown }) => (
    <div data-testid="division-form-action">{String(props.action)}</div>
  ),
}));
vi.mock("@/components/division/DeleteDivisionForm", () => ({
  DeleteDivisionForm: (props: { action: unknown }) => (
    <div data-testid="delete-division-form-action">{String(props.action)}</div>
  ),
}));

const { default: EditDivisionPage } = await import("./page");

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

describe("EditDivisionPage", () => {
  beforeEach(() => {
    requireOrganization.mockReset();
    findTournamentInOrganization.mockReset();
    findDivisionInTournament.mockReset();
    notFound.mockClear();
    requireOrganization.mockResolvedValue({
      session,
      organization,
      role: "OWNER",
    });
    findTournamentInOrganization.mockResolvedValue(tournament);
    findDivisionInTournament.mockResolvedValue(division);
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await EditDivisionPage(pageProps("tennis", "t1", "d1"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("大会取得・部門取得ともに URL の slug ではなく organization.id で絞り込む", async () => {
    await EditDivisionPage(pageProps("tennis", "t1", "d1"));

    // "tennis"(slug)ではなく"o1"(id)で呼ばれていることが要点。
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t1", "d1");
  });

  it("部門取得には URL の tournamentId と divisionId をそのまま渡す", async () => {
    await EditDivisionPage(pageProps("tennis", "t2", "d2"));

    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t2", "d2");
  });

  it("大会が見つからなければ notFound を呼ぶ", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(
      EditDivisionPage(pageProps("tennis", "t1", "d1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("部門が見つからなければ notFound を呼ぶ", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(
      EditDivisionPage(pageProps("tennis", "t1", "d1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)大会取得・部門取得とも行わずページも失敗する", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(
      EditDivisionPage(pageProps("tennis", "t1", "d1")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findTournamentInOrganization).not.toHaveBeenCalled();
    expect(findDivisionInTournament).not.toHaveBeenCalled();
  });

  it("DivisionForm には updateDivisionAction を、DeleteDivisionForm には deleteDivisionAction を渡す", async () => {
    const element = await EditDivisionPage(pageProps("tennis", "t1", "d1"));
    render(element);

    // action を入れ替えても DivisionFormAction 型は変わらないため型検査では
    // 検出できない。sentinel 文字列を画面に出させて実際の値で見分ける。
    expect(screen.getByTestId("division-form-action")).toHaveTextContent(
      "update-action-sentinel",
    );
    expect(screen.getByTestId("delete-division-form-action")).toHaveTextContent(
      "delete-action-sentinel",
    );
  });

  it("部門名を見出しに描画する", async () => {
    const element = await EditDivisionPage(pageProps("tennis", "t1", "d1"));
    render(element);

    expect(screen.getByText("部門を編集")).toBeInTheDocument();
  });
});
