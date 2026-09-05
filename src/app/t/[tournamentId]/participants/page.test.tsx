import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findPublicTournament = vi.fn();
const listParticipantsInTournament = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("@/features/tournament/repository", () => ({
  findPublicTournament: (tournamentId: string) =>
    findPublicTournament(tournamentId),
}));
vi.mock("@/features/division/repository", () => ({
  listParticipantsInTournament: (
    organizationId: string,
    tournamentId: string,
  ) => listParticipantsInTournament(organizationId, tournamentId),
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
};

describe("PublicParticipantsPage", () => {
  beforeEach(() => {
    findPublicTournament.mockReset();
    listParticipantsInTournament.mockReset();
    notFound.mockClear();
    findPublicTournament.mockResolvedValue(tournament);
    listParticipantsInTournament.mockResolvedValue([
      { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
    ]);
  });

  it("公開ゲートに params の tournamentId をそのまま渡す", async () => {
    await Page(pageProps("t1"));

    expect(findPublicTournament).toHaveBeenCalledWith("t1");
  });

  it("参加者はゲートが返した organizationId で絞り込む", async () => {
    await Page(pageProps("t1"));

    expect(listParticipantsInTournament).toHaveBeenCalledWith("o1", "t1");
  });

  it("公開対象でなければ notFound を呼び、参加者も引かない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(Page(pageProps("t1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listParticipantsInTournament).not.toHaveBeenCalled();
  });

  it("参加者を描画する", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(screen.getByText("No.1")).toBeInTheDocument();
  });

  it("大会ページへ戻るパンくずを出す", async () => {
    render(await Page(pageProps("t1")));

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("title は「参加者一覧 | 大会名 | 組織名」にする", async () => {
    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({
      title: "参加者一覧 | 春季大会 | テニス部",
    });
  });

  it("公開対象でなければ title を付けない", async () => {
    findPublicTournament.mockResolvedValue(null);

    await expect(generateMetadata(pageProps("t1"))).resolves.toEqual({});
  });
});
