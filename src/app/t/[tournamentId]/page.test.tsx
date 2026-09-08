import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listDivisionsInTournament = vi.fn();
const getOptionalSession = vi.fn();
const notFound = vi.fn(() => {
  // next/navigation の notFound は例外を投げて制御を打ち切る。
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string, viewerUserId: string | null) =>
    findPublicTournament(tournamentId, viewerUserId),
}));
vi.mock("@/features/division/repository", () => ({
  listDivisionsInTournament: (organizationId: string, tournamentId: string) =>
    listDivisionsInTournament(organizationId, tournamentId),
}));
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve({}),
});

// organizationId と tournamentId をわざと異なる値にする。揃えると取り違えを見逃す。
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

describe("PublicTournamentPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    listDivisionsInTournament.mockReset();
    getOptionalSession.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    getOptionalSession.mockResolvedValue(null);
    listDivisionsInTournament.mockResolvedValue([
      {
        id: "d1",
        name: "男子シングルス",
        order: 0,
        format: "SINGLE_ELIMINATION",
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

  it("部門一覧はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(listDivisionsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、部門一覧も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listDivisionsInTournament).not.toHaveBeenCalled();
  });

  it("大会名と主催組織名を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    // ヘッダのパンくずと概要の両方に出るため getAllByText で数えない。
    expect(screen.getAllByText("テニス部").length).toBeGreaterThan(0);
  });

  it("試合一覧と参加者一覧への導線を出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "試合一覧" })).toHaveAttribute(
      "href",
      "/t/t1/schedule",
    );
    expect(screen.getByRole("link", { name: "参加者一覧" })).toHaveAttribute(
      "href",
      "/t/t1/participants",
    );
  });

  it("部門を公開ブラケットページへのリンクとして出す", async () => {
    render(await Page(pageProps("t1")));

    expect(
      screen.getByRole("link", { name: /男子シングルス/ }),
    ).toHaveAttribute("href", "/t/t1/divisions/d1");
  });

  it("ログアウトなど操作の要素を出さない", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("title は「大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "春季大会 | テニス部",
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
