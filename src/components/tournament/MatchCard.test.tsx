import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";
import { MatchCard } from "./MatchCard";

const confirmed = (
  id: string,
  name: string,
  seed: number,
  isWinner: boolean,
): ResolvedSlot => ({
  participant: { id, name, seed },
  state: "confirmed",
  isWinner,
});

const pending: ResolvedSlot = {
  participant: null,
  state: "pending",
  isWinner: false,
};

const bye: ResolvedSlot = {
  participant: null,
  state: "bye",
  isWinner: false,
};

const doneMatch: ResolvedMatch = {
  id: "r2-m1",
  round: 2,
  order: 0,
  slots: [
    confirmed("p1", "佐藤 蓮", 1, true),
    confirmed("p8", "中村 芽依", 8, false),
  ],
  winnerId: "p1",
  score: "3-1",
  status: "done",
  sourceMatchIds: ["r1-m1", "r1-m2"],
  matchNumber: null,
};

describe("MatchCard", () => {
  it("両者の名前とシード番号を表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(screen.getByText("中村 芽依")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("スコアを表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("3-1")).toBeInTheDocument();
  });

  it("勝者の行だけ data-winner が true になる", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("slot-r2-m1-0")).toHaveAttribute(
      "data-winner",
      "true",
    );
    expect(screen.getByTestId("slot-r2-m1-1")).toHaveAttribute(
      "data-winner",
      "false",
    );
  });

  it("勝者が決まった試合では敗者の行だけ data-loser が true になる", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("slot-r2-m1-0")).toHaveAttribute(
      "data-loser",
      "false",
    );
    expect(screen.getByTestId("slot-r2-m1-1")).toHaveAttribute(
      "data-loser",
      "true",
    );
  });

  it("勝者の行は緑、敗者の行はグレーで表示する", () => {
    render(<MatchCard match={doneMatch} />);
    const winner = screen.getByTestId("slot-r2-m1-0");
    const loser = screen.getByTestId("slot-r2-m1-1");
    expect(winner).toHaveClass("bg-green-100", "font-bold");
    expect(loser).toHaveClass("bg-slate-100", "text-slate-400");
    expect(loser).not.toHaveClass("font-bold");
  });

  it("勝者が未決定の試合には敗者がいない", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r3-m2",
          slots: [
            confirmed("p1", "佐藤 蓮", 1, false),
            confirmed("p8", "中村 芽依", 8, false),
          ],
          winnerId: null,
          score: null,
          status: "ready",
        }}
      />,
    );
    for (const index of [0, 1]) {
      const row = screen.getByTestId(`slot-r3-m2-${index}`);
      expect(row).toHaveAttribute("data-loser", "false");
      expect(row).toHaveClass("text-slate-700");
      expect(row).not.toHaveClass("bg-slate-100");
    }
  });

  it("ルート要素に status を出す", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("match-r2-m1")).toHaveAttribute(
      "data-status",
      "done",
    );
  });

  it("未確定スロットは「未定」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r4-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, false), pending],
          winnerId: null,
          score: null,
          status: "waiting",
        }}
      />,
    );
    expect(screen.getByText("未定")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r4-m1-1")).toHaveAttribute(
      "data-slot-state",
      "pending",
    );
  });

  it("BYE スロットは「BYE」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r1-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, true), bye],
          score: null,
          status: "bye",
        }}
      />,
    );
    expect(screen.getByText("BYE")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r1-m1-1")).toHaveAttribute(
      "data-slot-state",
      "bye",
    );
  });

  it("スコアが無ければ何も表示しない", () => {
    render(<MatchCard match={{ ...doneMatch, id: "r3-m1", score: null }} />);
    expect(screen.queryByText("3-1")).not.toBeInTheDocument();
  });

  it("試合番号があればバッジで表示する", () => {
    render(<MatchCard match={{ ...doneMatch, matchNumber: "7" }} />);
    expect(
      screen.getByTestId(`match-number-${doneMatch.id}`),
    ).toHaveTextContent("7");
  });

  it("試合番号が null ならバッジを出さない", () => {
    render(<MatchCard match={{ ...doneMatch, matchNumber: null }} />);
    expect(
      screen.queryByTestId(`match-number-${doneMatch.id}`),
    ).not.toBeInTheDocument();
  });
});
