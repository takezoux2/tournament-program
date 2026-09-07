import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import type { DivisionFormState } from "@/features/division/state";
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

  it("行の保存で matchId と入力した番号が送られる", async () => {
    // MatchNumberList.test.tsx から引き継いだ観点。MatchNumberRow の hidden
    // input の name（slug/tournamentId/divisionId/matchId）と入力欄の name
    // （matchNumber）を、一覧側の props に合わせて配線したままであることを
    // 確かめる。ここが無いと、行側が名前を書き換えても検知できない。
    const setMatchNumberAction = vi.fn(
      async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
    );
    const user = userEvent.setup();
    render(
      <MatchOrderList
        rows={[rows[0]]}
        slug="acme"
        tournamentId="t1"
        divisionId="d1"
        reorderAction={noop}
        setMatchNumberAction={setMatchNumberAction}
        emptyMessage="まだ組み合わせがありません"
      />,
    );

    const input = screen.getByLabelText("1回戦 第1試合の試合番号");
    await user.clear(input);
    await user.type(input, "A");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = setMatchNumberAction.mock.calls[0][1];
    expect(sent.get("matchId")).toBe("m1-0");
    expect(sent.get("matchNumber")).toBe("A");
    expect(sent.get("slug")).toBe("acme");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
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
