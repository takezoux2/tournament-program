import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LeagueRoundView } from "@/features/division/round-robin/view";
import type { DivisionFormState } from "@/features/division/state";
import { LeagueRoundList } from "./LeagueRoundList";

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
);

const rounds: LeagueRoundView[] = [
  {
    round: 1,
    matches: [
      {
        matchId: "r1-0",
        matchNumber: "1",
        label: "第1節 第1試合",
        card: "山田 vs 田中",
      },
    ],
    restingLabels: ["鈴木"],
  },
  {
    round: 2,
    matches: [
      {
        matchId: "r2-0",
        matchNumber: "2",
        label: "第2節 第1試合",
        card: "山田 vs 鈴木",
      },
    ],
    restingLabels: [],
  },
];

const props = {
  rounds,
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  action: noopAction,
};

describe("LeagueRoundList", () => {
  it("節ごとに見出しを出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByRole("heading", { name: "第1節" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "第2節" })).toBeInTheDocument();
  });

  it("試合の位置と対戦を出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByText("第1節 第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 田中")).toBeInTheDocument();
  });

  it("試合番号を編集できる", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByLabelText("第1節 第1試合の試合番号")).toHaveValue("1");
  });

  it("休みが居る節だけ休みを出す", () => {
    render(<LeagueRoundList {...props} />);
    expect(screen.getByText("休み: 鈴木")).toBeInTheDocument();
    expect(screen.queryByText("休み: ")).not.toBeInTheDocument();
  });

  it("対戦表が未作成なら案内を出す", () => {
    render(<LeagueRoundList {...props} rounds={[]} />);
    expect(screen.getByText("まだ対戦表がありません")).toBeInTheDocument();
  });
});
