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

// handler.ts は repository 経由で prisma モジュールを読み込み、
// DATABASE_URL 未設定のテスト環境では import するだけで例外になる。
// ページのテストでは Server Action の中身ではなく、渡し方だけを見たいので
// 実体には触れずダミーへ差し替える。
vi.mock("@/features/tournament/update/handler", () => ({
  updateTournamentAction: vi.fn(),
}));
vi.mock("@/features/tournament/delete/handler", () => ({
  deleteTournamentAction: vi.fn(),
}));
vi.mock("@/features/tournament/unpublish/handler", () => ({
  unpublishTournamentAction: async () => ({ error: null }),
}));

const { default: EditTournamentPage } = await import("./page");

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
  startsAt: new Date(2026, 7, 29, 10, 5),
  status: "DRAFT" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

describe("EditTournamentPage", () => {
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
  });

  it("requireOrganization には params の slug をそのまま渡す", async () => {
    await EditTournamentPage(pageProps("tennis", "t1"));

    expect(requireOrganization).toHaveBeenCalledWith("tennis");
  });

  it("大会取得は URL の slug ではなく requireOrganization が返した organization.id で絞り込む", async () => {
    await EditTournamentPage(pageProps("tennis", "t1"));

    // "tennis"(slug)ではなく"o1"(id)で呼ばれていることが要点。
    expect(findTournamentInOrganization).toHaveBeenCalledWith("o1", "t1");
  });

  it("大会が見つからなければ notFound を呼ぶ", async () => {
    findTournamentInOrganization.mockResolvedValue(null);

    await expect(EditTournamentPage(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("requireOrganization が例外を投げたら(非所属時の notFound)大会取得は行わずページも失敗する", async () => {
    requireOrganization.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(EditTournamentPage(pageProps("tennis", "t1"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(findTournamentInOrganization).not.toHaveBeenCalled();
  });

  it("大会の現在の名前と開始日時をフォームへ渡して描画する", async () => {
    const element = await EditTournamentPage(pageProps("tennis", "t1"));
    render(element);

    // TournamentForm 側: defaultName / defaultStartsAt の初期値として入る
    expect(screen.getByLabelText("大会名")).toHaveValue("春季大会");
    expect(screen.getByLabelText("開始日時")).toHaveValue("2026-08-29T10:05");

    // DeleteTournamentForm 側にも大会名が渡っている
    expect(
      screen.getByRole("button", { name: "この大会を削除する" }),
    ).toBeInTheDocument();
  });

  it.each(["IN_PROGRESS", "COMPLETED"] as const)(
    "公開中（%s）の大会には非公開ボタンを出す",
    async (status) => {
      findTournamentInOrganization.mockResolvedValue({ ...tournament, status });

      const element = await EditTournamentPage(pageProps("tennis", "t1"));
      render(element);

      expect(
        screen.getByRole("button", { name: "非公開にする" }),
      ).toBeInTheDocument();
    },
  );

  it("準備中の大会には非公開ボタンを出さない", async () => {
    findTournamentInOrganization.mockResolvedValue({
      ...tournament,
      status: "DRAFT",
    });

    const element = await EditTournamentPage(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.queryByRole("button", { name: "非公開にする" }),
    ).not.toBeInTheDocument();
  });

  it("tournament.edit を持たなければ、公開中でも非公開ボタンを出さない", async () => {
    const codes = PERMISSION_CODES.filter((code) => code !== "tournament.edit");
    requireOrganization.mockResolvedValue({
      session,
      organization,
      permissionCodes: codes,
      ability: defineAbilityFor(codes),
    });
    findTournamentInOrganization.mockResolvedValue({
      ...tournament,
      status: "IN_PROGRESS",
    });

    const element = await EditTournamentPage(pageProps("tennis", "t1"));
    render(element);

    expect(
      screen.queryByRole("button", { name: "非公開にする" }),
    ).not.toBeInTheDocument();
  });
});
