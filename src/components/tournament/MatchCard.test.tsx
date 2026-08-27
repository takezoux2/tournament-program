import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolvedMatch, ResolvedSlot } from "@/features/tournament/types";
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
});
