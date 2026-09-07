import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import { MatchOrderList } from "./MatchOrderList";

const rows: MatchNumberRowView[] = [
  {
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m1-1",
    matchNumber: "2",
    label: "1回戦 第2試合",
    card: "鈴木 vs 田中",
  },
];

const noop = vi.fn(async () => ({ error: null }));

const renderList = (list: MatchNumberRowView[]) =>
  render(
    <MatchOrderList
      rows={list}
      slug="acme"
      tournamentId="t1"
      divisionId="d1"
      reorderAction={noop}
      setMatchNumberAction={noop}
      emptyMessage="まだ組み合わせがありません"
    />,
  );

describe("MatchOrderList", () => {
  it("渡された順に行を出す", () => {
    renderList(rows);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1回戦 第1試合");
    expect(items[0]).toHaveTextContent("山田 vs 佐藤");
    expect(items[1]).toHaveTextContent("1回戦 第2試合");
  });

  it("行ごとに試合番号の編集フォームを出す", () => {
    renderList(rows);

    expect(screen.getByLabelText("1回戦 第1試合の試合番号")).toHaveValue("1");
  });

  it("行ごとに区別できる名前のドラッグハンドルを出す", () => {
    // 一覧には似た行が並ぶので、ハンドルの名前に行の中身を混ぜる。
    // 固定文言だと支援技術には同じ名前のボタンが並んで見える。
    renderList(rows);

    expect(
      screen.getByRole("button", {
        name: "1行目 1回戦 第1試合をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2行目 1回戦 第2試合をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
  });

  it("行が無ければ渡された文言を出す", () => {
    renderList([]);

    expect(screen.getByText("まだ組み合わせがありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
