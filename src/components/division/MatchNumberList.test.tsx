import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { MatchNumberList } from "./MatchNumberList";

const rows = [
  {
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m2-0",
    matchNumber: "3",
    label: "2回戦 第1試合",
    card: "第1試合の勝者 vs 第2試合の勝者",
  },
];

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({
    error: null,
  }),
);

describe("MatchNumberList", () => {
  it("全試合の行と現在の番号を表示する", () => {
    render(
      <MatchNumberList
        rows={rows}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );

    expect(screen.getByText("1回戦 第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("保存で matchId と入力した番号が送られる", async () => {
    const user = userEvent.setup();
    render(
      <MatchNumberList
        rows={[rows[0]]}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );

    const input = screen.getByLabelText("1回戦 第1試合の試合番号");
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = noopAction.mock.calls[0][1];
    expect(sent.get("matchId")).toBe("m1-0");
    expect(sent.get("matchNumber")).toBe("A");
    expect(sent.get("slug")).toBe("org");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("試合が無ければ案内だけ出す", () => {
    render(
      <MatchNumberList
        rows={[]}
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={noopAction}
      />,
    );
    expect(screen.getByText("まだ組み合わせがありません")).toBeInTheDocument();
  });
});
