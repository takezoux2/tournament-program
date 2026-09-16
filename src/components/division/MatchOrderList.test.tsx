import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MatchNameRowView } from "@/features/division/match-name-view";
import type { DivisionFormState } from "@/features/division/state";
import { MatchOrderList } from "./MatchOrderList";

const rows: MatchNameRowView[] = [
  {
    matchId: "m1-0",
    matchName: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    matchId: "m1-1",
    matchName: "2",
    label: "1回戦 第2試合",
    card: "鈴木 vs 田中",
  },
];

const noop = vi.fn(async () => ({ error: null }));

const renderList = (list: MatchNameRowView[]) =>
  render(
    <MatchOrderList
      rows={list}
      slug="acme"
      tournamentId="t1"
      divisionId="d1"
      setMatchNameAction={noop}
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

  it("行ごとに試合名の編集フォームを出す", () => {
    renderList(rows);

    expect(screen.getByLabelText("1回戦 第1試合の試合名")).toHaveValue("1");
  });

  it("行の保存で matchId と入力した番号が送られる", async () => {
    // MatchNameList.test.tsx から引き継いだ観点。MatchNameRow の hidden
    // input の name（slug/tournamentId/divisionId/matchId）と入力欄の name
    // （matchName）を、一覧側の props に合わせて配線したままであることを
    // 確かめる。ここが無いと、行側が名前を書き換えても検知できない。
    const setMatchNameAction = vi.fn(
      async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
    );
    const user = userEvent.setup();
    render(
      <MatchOrderList
        rows={[rows[0]]}
        slug="acme"
        tournamentId="t1"
        divisionId="d1"
        setMatchNameAction={setMatchNameAction}
        emptyMessage="まだ組み合わせがありません"
      />,
    );

    const input = screen.getByLabelText("1回戦 第1試合の試合名");
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = setMatchNameAction.mock.calls[0][1];
    expect(sent.get("matchId")).toBe("m1-0");
    expect(sent.get("matchName")).toBe("A");
    expect(sent.get("slug")).toBe("acme");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("並べ替えの操作を出さない", () => {
    // 試合の順番は大会の進行順（/matches）だけが決める。部門の中で
    // 並べ替える操作を残すと、番号が変わると誤解させる。
    renderList(rows);

    expect(screen.queryByRole("button", { name: /並べ替え/ })).toBeNull();
    expect(screen.queryByText(/ドラッグ/)).toBeNull();
  });

  it("行が無ければ渡された文言を出す", () => {
    renderList([]);

    expect(screen.getByText("まだ組み合わせがありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("位置の文言が空の行（リーグ）は対戦カードで入力欄を名付け、位置の行を出さない", () => {
    renderList([
      {
        matchId: "r1-0",
        matchName: "1",
        label: "",
        card: "山田 vs 田中",
      },
    ]);

    expect(screen.getByLabelText("山田 vs 田中の試合名")).toHaveValue("1");
    // 行の中の段落は対戦カードの 1 つだけ（空の位置の段落を描かない）。
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(1);
  });
});
