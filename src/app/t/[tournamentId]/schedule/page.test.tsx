import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const loadScheduleView = vi.fn();
const getOptionalSession = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string, viewerUserId: string | null) =>
    findPublicTournament(tournamentId, viewerUserId),
}));
vi.mock("@/features/schedule/repository", () => ({
  loadScheduleView: (organizationId: string, tournamentId: string) =>
    loadScheduleView(organizationId, tournamentId),
}));
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve({}),
});

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  isPreview: false,
};

describe("PublicSchedulePage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    loadScheduleView.mockReset();
    getOptionalSession.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    getOptionalSession.mockResolvedValue(null);
    loadScheduleView.mockResolvedValue([
      {
        kind: "match",
        key: "match:d1:m1-0",
        divisionId: "d1",
        divisionName: "男子シングルス",
        matchId: "m1-0",
        matchName: "1",
        label: "1回戦 第1試合",
        card: "佐藤 蓮 vs 鈴木 陽菜",
      },
    ]);
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", null);
  });

  it("ログイン中は閲覧者の user.id を公開ゲートに渡す", async () => {
    // 渡さないとメンバーでも準備中の大会が 404 になる。
    getOptionalSession.mockResolvedValue({ user: { id: "u1" } });

    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", "u1");
  });

  it("試合一覧はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(loadScheduleView).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、試合一覧も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(loadScheduleView).not.toHaveBeenCalled();
  });

  it("試合を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByText("佐藤 蓮 vs 鈴木 陽菜")).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("並べ替えや区切りの編集を出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("title は「試合一覧 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "試合一覧 | 春季大会 | テニス部",
    });
  });

  it("公開対象でなければ title を付けない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({});
  });

  it("準備中のプレビューでは準備中バナーを出す", async () => {
    findPublicTournament.mockResolvedValue({
      ...tournament,
      status: "DRAFT" as const,
      isPreview: true,
    });

    render(await Page(pageProps("t1")));

    // 大会トップは概要のステータス欄にも「準備中」を出すため、
    // 文字列ではなく role で引く。
    expect(screen.getByRole("status")).toHaveTextContent(
      "組織のメンバーにしか表示されません",
    );
  });

  it("公開済みの大会では準備中バナーを出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
