import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeagueTableView } from "@/features/division/round-robin/standings";
import { LeagueResultTable } from "./LeagueResultTable";

const table: LeagueTableView = {
  headers: [
    { entryId: "e1", label: "山田" },
    { entryId: "e2", label: "佐藤" },
    { entryId: "e3", label: "鈴木" },
  ],
  rows: [
    {
      entryId: "e1",
      label: "山田",
      rank: 1,
      wins: 1,
      draws: 1,
      losses: 0,
      points: 4,
      cells: [
        { kind: "self" },
        { kind: "match", matchName: "第1試合", outcome: "win" },
        { kind: "match", matchName: "第3試合", outcome: "draw" },
      ],
    },
    {
      entryId: "e2",
      label: "佐藤",
      rank: 2,
      wins: 0,
      draws: 0,
      losses: 1,
      points: 0,
      cells: [
        { kind: "match", matchName: "第1試合", outcome: "loss" },
        { kind: "self" },
        { kind: "match", matchName: "第2試合", outcome: null },
      ],
    },
    {
      entryId: "e3",
      label: "鈴木",
      rank: 2,
      wins: 0,
      draws: 1,
      losses: 0,
      points: 1,
      cells: [
        { kind: "match", matchName: "第3試合", outcome: "draw" },
        { kind: "match", matchName: "第2試合", outcome: null },
        { kind: "self" },
      ],
    },
  ],
};

describe("LeagueResultTable", () => {
  it("順位表の列見出しを出す", () => {
    render(<LeagueResultTable table={table} />);

    for (const label of ["順位", "勝", "分", "敗", "勝点"]) {
      expect(
        screen.getByRole("columnheader", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("エントリーを行と列の見出しに出す", () => {
    render(<LeagueResultTable table={table} />);

    // 行見出しと列見出しで 2 回ずつ出る
    expect(screen.getAllByText("山田")).toHaveLength(2);
    expect(screen.getAllByText("鈴木")).toHaveLength(2);
  });

  it("各行に順位・勝・分・敗・勝点を出す", () => {
    render(<LeagueResultTable table={table} />);

    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    // 順位 / 3 マス / 勝 / 分 / 敗 / 勝点 の順。名前は rowheader なので含まれない
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "1",
      "—",
      "○第1試合",
      "△第3試合",
      "1",
      "1",
      "0",
      "4",
    ]);
  });

  it("勝敗の印に読み上げ用の名前を付ける", () => {
    render(<LeagueResultTable table={table} />);

    expect(screen.getAllByLabelText("勝ち")).toHaveLength(1);
    expect(screen.getAllByLabelText("負け")).toHaveLength(1);
    expect(screen.getAllByLabelText("引き分け")).toHaveLength(2);
  });

  it("未実施のマスは試合名だけを出す", () => {
    render(<LeagueResultTable table={table} />);

    const row = screen.getAllByRole("row")[2];
    const cell = within(row).getAllByRole("cell")[3];
    expect(cell).toHaveTextContent("第2試合");
    expect(within(cell).queryByRole("img")).toBeNull();
  });

  it("エントリーが無いときは案内を出す", () => {
    render(<LeagueResultTable table={{ headers: [], rows: [] }} />);

    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });

  it("kind: none のマスは何も描かない（対戦が組まれていない組み合わせ）", () => {
    const noneTable: LeagueTableView = {
      headers: [
        { entryId: "e1", label: "山田" },
        { entryId: "e2", label: "佐藤" },
      ],
      rows: [
        {
          entryId: "e1",
          label: "山田",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [{ kind: "self" }, { kind: "none" }],
        },
        {
          entryId: "e2",
          label: "佐藤",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [{ kind: "none" }, { kind: "self" }],
        },
      ],
    };
    render(<LeagueResultTable table={noneTable} />);

    // row[0] は thead、row[1] が山田の行。cell[0] が順位、cell[1] が
    // 自分自身（self）の列、cell[2] が佐藤との対戦（none）の列。
    const row = screen.getAllByRole("row")[1];
    const cell = within(row).getAllByRole("cell")[2];
    expect(cell).toBeEmptyDOMElement();
    expect(within(cell).queryByRole("img")).toBeNull();
  });

  it("マスには渡された試合名をそのまま出し、飾りを足さない", () => {
    const named: LeagueTableView = {
      headers: [
        { entryId: "e1", label: "山田" },
        { entryId: "e2", label: "佐藤" },
      ],
      rows: [
        {
          entryId: "e1",
          label: "山田",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [
            { kind: "self" },
            { kind: "match", matchName: "決勝", outcome: null },
          ],
        },
        {
          entryId: "e2",
          label: "佐藤",
          rank: 1,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          cells: [
            { kind: "match", matchName: "決勝", outcome: null },
            { kind: "self" },
          ],
        },
      ],
    };
    render(<LeagueResultTable table={named} />);

    // cell[0] が順位、cell[1] が自分自身、cell[2] が佐藤との対戦。
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent(/^決勝$/);
  });
});

describe("LeagueResultTable（印刷向け）", () => {
  it("showStandings={false} なら集計の数字を出さない", () => {
    render(<LeagueResultTable table={table} showStandings={false} />);

    expect(screen.queryByText("4")).not.toBeInTheDocument();
    // 列そのものは残す（手書きの欄になる）
    expect(
      screen.getByRole("columnheader", { name: "勝点" }),
    ).toBeInTheDocument();
  });

  it("既定では集計の数字を出す", () => {
    render(<LeagueResultTable table={table} />);

    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("print なら横スクロールの箱に入れない", () => {
    const { container } = render(<LeagueResultTable table={table} print />);

    expect(container.firstChild).not.toHaveClass("overflow-x-auto");
  });
});
