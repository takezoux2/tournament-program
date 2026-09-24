import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listDivisionDetailsInTournament = vi.fn();
const listOverallOrderSources = vi.fn();
const listParticipantsWithDivisions = vi.fn();
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
  listDivisionDetailsInTournament: (organizationId: string, id: string) =>
    listDivisionDetailsInTournament(organizationId, id),
  listOverallOrderSources: (id: string) => listOverallOrderSources(id),
  loadEntrySourceContext: () =>
    Promise.resolve({ views: new Map(), divisions: [] }),
}));
vi.mock("@/features/participant/repository", () => ({
  listParticipantsWithDivisions: (organizationId: string, id: string) =>
    listParticipantsWithDivisions(organizationId, id),
}));
vi.mock("@/shared/middleware/require-session", () => ({
  getOptionalSession: () => getOptionalSession(),
}));

const { default: Page, generateMetadata } = await import("./page");

const pageProps = (
  tournamentId: string,
  searchParams: Record<string, string> = {},
) => ({
  params: Promise.resolve({ tournamentId }),
  searchParams: Promise.resolve(searchParams),
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
  results: {
    version: 1,
    matches: [{ matchId: "m1", winnerEntryId: "e1" }],
  },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const participants = [
  {
    id: "p1",
    name: "佐藤 蓮",
    nameKana: "サトウ レン",
    playerNumber: "1",
    divisions: [{ id: "d1", name: "男子シングルス" }],
  },
  {
    id: "p2",
    name: "鈴木 陽菜",
    nameKana: "スズキ ハルナ",
    playerNumber: "2",
    divisions: [{ id: "d1", name: "男子シングルス" }],
  },
];

describe("PublicPrintPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findPublicTournament.mockResolvedValue(tournament);
    getOptionalSession.mockResolvedValue(null);
    listDivisionDetailsInTournament.mockResolvedValue([division]);
    listParticipantsWithDivisions.mockResolvedValue(participants);
    listOverallOrderSources.mockResolvedValue(new Map());
  });

  it("ログイン中は閲覧者の user.id を公開ゲートに渡す", async () => {
    getOptionalSession.mockResolvedValue({ user: { id: "u1" } });

    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1", "u1");
  });

  it("公開対象でなければ notFound を呼び、部門も参加者も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listDivisionDetailsInTournament).not.toHaveBeenCalled();
    expect(listParticipantsWithDivisions).not.toHaveBeenCalled();
  });

  it("ゲートが返した organizationId で部門と参加者を引く", async () => {
    await Page(pageProps("t1"));

    expect(listDivisionDetailsInTournament).toHaveBeenCalledWith("o1", "t1");
    expect(listParticipantsWithDivisions).toHaveBeenCalledWith("o1", "t1");
    expect(listOverallOrderSources).toHaveBeenCalledWith("t1");
  });

  it("概要・選手一覧・部門のセクションを並べる", async () => {
    render(await Page(pageProps("t1")));

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "選手一覧" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /男子シングルス/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "トーナメント表" }),
    ).toBeInTheDocument();
  });

  it("用紙サイズをクエリから読み、@page に反映する", async () => {
    const { container } = render(await Page(pageProps("t1", { paper: "a3" })));

    expect(container.querySelector("style")?.textContent).toContain(
      "@page division { size: A3 landscape; }",
    );
  });

  it("準備中のプレビューなら案内を出す", async () => {
    findPublicTournament.mockResolvedValue({ ...tournament, isPreview: true });

    render(await Page(pageProps("t1")));

    expect(screen.getByText(/この大会は準備中です/)).toBeInTheDocument();
  });

  it("results=0 ならブラケットの勝者も太字にしない（空欄モード）", async () => {
    render(await Page(pageProps("t1", { results: "0" })));

    expect(screen.getByText("No.1 佐藤 蓮")).toHaveAttribute(
      "font-weight",
      "400",
    );
  });

  it("results 未指定ならブラケットの勝者を太字にする", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByText("No.1 佐藤 蓮")).toHaveAttribute(
      "font-weight",
      "700",
    );
  });

  it("タイトルに「印刷用」を付ける", async () => {
    const metadata = await generateMetadata(pageProps("t1"));

    expect(metadata.title).toContain("印刷用");
  });
});
