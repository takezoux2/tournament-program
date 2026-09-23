import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { overallSeqKey } from "@/lib/division/overall-order";

// @xyflow/react は jsdom で実寸を測れないため、描画そのものは差し替える。
vi.mock("@/components/tournament/TournamentFlow", () => ({
  TournamentFlow: ({ nodes }: { nodes: unknown[] }) => (
    <div data-testid="flow">{nodes.length}</div>
  ),
}));

const findPublicTournament = vi.fn();
const findDivisionInTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const listOverallOrderSources = vi.fn();
const getOptionalSession = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string, viewerUserId: string | null) =>
    findPublicTournament(tournamentId, viewerUserId),
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
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (tournamentId: string, divisionId: string) => ({
  params: Promise.resolve({ tournamentId, divisionId }),
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

const division = {
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [] },
  resultConfig: {
    version: 1,
    winReason: { enabled: false, options: [] },
    score: { enabled: false, count: 3, aggregation: "sum" },
    note: { enabled: false },
  },
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

describe("PublicDivisionPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    findDivisionInTournament.mockReset();
    listParticipantsInTournament.mockReset();
    getOptionalSession.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    getOptionalSession.mockResolvedValue(null);
    findDivisionInTournament.mockResolvedValue(division);
    listParticipantsInTournament.mockResolvedValue([
      { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
      {
        id: "p2",
        name: "鈴木 陽菜",
        nameKana: "スズキ ハルナ",
        playerNumber: "2",
      },
    ]);
    listOverallOrderSources.mockReset();
    listOverallOrderSources.mockResolvedValue(new Map());
  });

  it("部門はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1", "d1"));

    expect(findDivisionInTournament).toHaveBeenCalledWith("o1", "t1", "d1");
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1", "d1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", null);
  });

  it("ログイン中は閲覧者の user.id を公開ゲートに渡す", async () => {
    // 渡さないとメンバーでも準備中の大会が 404 になる。
    getOptionalSession.mockResolvedValue({ user: { id: "u1" } });

    await Page(pageProps("t1", "d1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", "u1");
  });

  it("公開対象でなければ notFound を呼び、部門も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1", "d1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(findDivisionInTournament).not.toHaveBeenCalled();
    expect(listOverallOrderSources).not.toHaveBeenCalled();
  });

  it("部門が見つからなければ notFound を呼ぶ", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1", "d1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("ブラケットを描画する", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("部門名を見出しにする", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "男子シングルス" }),
    ).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("ROUND_ROBIN の部門では参加者一覧を引いて結果表を描く", async () => {
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN" as const,
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: {
        version: 1,
        matches: [{ matchId: "r1-0", winnerEntryId: "e1" }],
      },
    });

    render(await Page(pageProps("t1", "d1")));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
    expect(
      screen.getByRole("columnheader", { name: "順位" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("勝ち")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("title は「部門名 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1", "d1"))).resolves.toEqual({
      title: "男子シングルス | 春季大会 | テニス部",
    });
  });

  it("部門が見つからなければ title を付けない", async () => {
    findDivisionInTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1", "d1"))).resolves.toEqual({});
  });

  it("準備中のプレビューでは準備中バナーを出す", async () => {
    findPublicTournament.mockResolvedValue({
      ...tournament,
      status: "DRAFT" as const,
      isPreview: true,
    });

    render(await Page(pageProps("t1", "d1")));

    // 大会トップは概要のステータス欄にも「準備中」を出すため、
    // 文字列ではなく role で引く。
    expect(screen.getByRole("status")).toHaveTextContent(
      "組織のメンバーにしか表示されません",
    );
  });

  it("公開済みの大会では準備中バナーを出さない", async () => {
    render(await Page(pageProps("t1", "d1")));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("リーグの結果表には大会全体の通し番号で展開した試合名を出す", async () => {
    listOverallOrderSources.mockResolvedValue(
      new Map([[overallSeqKey("d1", "r1-0"), 4]]),
    );
    findDivisionInTournament.mockResolvedValue({
      ...division,
      format: "ROUND_ROBIN" as const,
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第{{OverallSeq}}試合",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    });

    render(await Page(pageProps("t1", "d1")));

    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
    expect(screen.getAllByText("第4試合")).toHaveLength(2);
  });
});
