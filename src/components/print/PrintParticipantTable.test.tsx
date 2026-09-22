import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintParticipantTable } from "./PrintParticipantTable";

describe("PrintParticipantTable", () => {
  it("選手番号・氏名・所属・出場部門を 1 行に並べる", () => {
    render(
      <PrintParticipantTable
        participants={[
          {
            id: "p1",
            name: "佐藤 蓮",
            nameKana: "サトウ レン",
            playerNumber: "1",
            team: "東高",
            divisions: [
              { id: "d1", name: "男子" },
              { id: "d2", name: "混合" },
            ],
          },
          {
            id: "p2",
            name: "鈴木 陽菜",
            nameKana: "スズキ ハルナ",
            playerNumber: "2",
            divisions: [],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "選手一覧" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    // 見出し行 + 2 人
    expect(rows).toHaveLength(3);
    const first = within(rows[1]);
    expect(first.getByText("1")).toBeInTheDocument();
    expect(first.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(first.getByText("東高")).toBeInTheDocument();
    expect(first.getByText("男子、混合")).toBeInTheDocument();
  });

  it("参加者がいなければその旨を出す", () => {
    render(<PrintParticipantTable participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
