import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CrossTableView } from "@/features/division/round-robin/view";
import { LeagueCrossTable } from "./LeagueCrossTable";

const table: CrossTableView = {
  headers: [
    { entryId: "e1", label: "山田" },
    { entryId: "e2", label: "佐藤" },
    { entryId: "e3", label: "鈴木" },
  ],
  rows: [
    {
      entryId: "e1",
      label: "山田",
      cells: [
        { kind: "self" },
        { kind: "match", matchName: "1" },
        { kind: "none" },
      ],
    },
    {
      entryId: "e2",
      label: "佐藤",
      cells: [
        { kind: "match", matchName: "1" },
        { kind: "self" },
        { kind: "match", matchName: "2" },
      ],
    },
    {
      entryId: "e3",
      label: "鈴木",
      cells: [
        { kind: "none" },
        { kind: "match", matchName: "2" },
        { kind: "self" },
      ],
    },
  ],
};

describe("LeagueCrossTable", () => {
  it("エントリーを行と列の見出しに出す", () => {
    render(<LeagueCrossTable table={table} />);
    // 行見出しと列見出しで 2 回ずつ出る。
    expect(screen.getAllByText("山田")).toHaveLength(2);
    expect(screen.getAllByText("鈴木")).toHaveLength(2);
  });

  it("対戦があるマスにマスが持つ試合名をそのまま出す", () => {
    // 通し番号の展開は toCrossTableView 側で済んでいる。ここで「第◯試合」の
    // 飾りを足すと、展開済みの文言（例: 第9試合）が二重になってしまう。
    render(<LeagueCrossTable table={table} />);
    // 見出し行にも「山田」が出るので、行の名前ではなく位置で選ぶ。
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("1")).toBeInTheDocument();
  });

  it("対角は自分自身なので印を出す", () => {
    render(<LeagueCrossTable table={table} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("エントリーが無いときは案内を出す", () => {
    render(<LeagueCrossTable table={{ headers: [], rows: [] }} />);
    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });
});
