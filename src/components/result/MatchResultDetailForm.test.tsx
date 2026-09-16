import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MatchResultDetailForm } from "./MatchResultDetailForm";

const noopAction = async () => ({ error: null });

const row = {
  kind: "match" as const,
  key: "k1",
  divisionId: "d1",
  divisionName: "男子シングルス",
  matchId: "m1-0",
  matchName: "第1試合",
  label: "1回戦 第1試合",
  slots: [
    { label: "田中", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ] as [
    { label: string; entryId: string | null },
    { label: string; entryId: string | null },
  ],
  winnerEntryId: "e1",
  state: "recorded" as const,
  downstreamRecordedCount: 0,
  resultConfig: {
    version: 1 as const,
    winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
    score: { enabled: true, count: 3, aggregation: "sum" as const },
    note: { enabled: true },
  },
  winReason: "一本勝ち",
  scores: [{ entryId: "e1", values: [7, 6.8, 7.2] }],
  note: "抗議あり",
};

const renderForm = (override: Partial<typeof row> = {}) =>
  render(
    <MatchResultDetailForm
      row={{ ...row, ...override }}
      slug="acme"
      tournamentId="t1"
      action={noopAction}
    />,
  );

describe("MatchResultDetailForm", () => {
  it("有効な項目だけを出す", () => {
    renderForm({
      resultConfig: {
        ...row.resultConfig,
        score: { enabled: false, count: 3, aggregation: "sum" },
        note: { enabled: false },
      },
    });

    expect(screen.getByRole("combobox", { name: "勝因" })).toBeInTheDocument();
    expect(screen.queryByLabelText("メモ")).not.toBeInTheDocument();
    expect(
      screen.queryByText("メモは公開ページにも表示されます"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("メモが公開ページにも出ることを伝える", () => {
    renderForm();
    expect(screen.getByLabelText("メモ")).toHaveAccessibleDescription(
      "メモは公開ページにも表示されます",
    );
  });

  it("記録済みの値を初期値にする", () => {
    renderForm();
    expect(screen.getByRole("combobox", { name: "勝因" })).toHaveValue(
      "一本勝ち",
    );
    expect(screen.getByLabelText("メモ")).toHaveValue("抗議あり");
    expect(screen.getByLabelText("田中 のスコア 1")).toHaveValue(7);
  });

  it("スコアの数は設定の count ぶん出す", () => {
    renderForm({
      resultConfig: {
        ...row.resultConfig,
        score: { enabled: true, count: 2, aggregation: "sum" },
      },
    });
    expect(screen.getByLabelText("田中 のスコア 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("田中 のスコア 3")).not.toBeInTheDocument();
  });

  it("集計値が入力に追従する", async () => {
    renderForm({ scores: [] });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("田中 のスコア 1"), "7");
    await user.type(screen.getByLabelText("田中 のスコア 2"), "6");

    expect(screen.getByTestId("aggregate-e1")).toHaveTextContent("13");
  });

  it("一覧に無い勝因が記録されていれば選択肢に残す", () => {
    renderForm({ winReason: "反則負け" });
    const select = screen.getByRole("combobox", { name: "勝因" });
    expect(select).toHaveValue("反則負け");
    expect(
      screen.getByRole("option", { name: "（一覧にない）反則負け" }),
    ).toBeInTheDocument();
  });
});
