import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { MatchResultRow } from "./MatchResultRow";

vi.mock("@/shared/lib/analytics/events", () => ({
  trackEvent: vi.fn(),
}));

const action = vi.fn<DivisionFormAction>(async () => ({ error: null }));
const detailAction = vi.fn<DivisionFormAction>(async () => ({ error: null }));

type MatchRow = Extract<ResultRowView, { kind: "match" }>;

const recordedRow = (overrides: Partial<MatchRow> = {}): MatchRow => ({
  kind: "match",
  key: "match:d1:m1-0",
  divisionId: "d1",
  divisionName: "男子",
  matchId: "m1-0",
  matchNumber: "1",
  label: "1回戦 第1試合",
  slots: [
    { label: "田中", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ],
  winnerEntryId: "e1",
  state: "recorded",
  downstreamRecordedCount: 0,
  resultConfig: {
    version: 1,
    winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
    score: { enabled: true, count: 3, aggregation: "sum" },
    note: { enabled: true },
  },
  winReason: "一本勝ち",
  scores: [{ entryId: "e1", values: [7, 6, 7] }],
  note: "抗議あり",
  ...overrides,
});

const renderRow = (row: MatchRow) =>
  render(
    <MatchResultRow
      row={row}
      slug="tennis"
      tournamentId="t1"
      action={action}
      detailAction={detailAction}
    />,
  );

describe("MatchResultRow の詳細", () => {
  it("記録済みの行は要約とメモのボタンを出す", () => {
    renderRow(recordedRow());

    expect(screen.getByText(/一本勝ち/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "男子 第1試合のメモ" }),
    ).toBeInTheDocument();
  });

  it("メモが無効な設定なら記録済みのメモがあってもボタンを出さない", () => {
    renderRow(
      recordedRow({
        resultConfig: {
          version: 1,
          winReason: { enabled: false, options: [] },
          score: { enabled: false, count: 3, aggregation: "sum" },
          note: { enabled: false },
        },
      }),
    );

    expect(
      screen.queryByRole("button", { name: "男子 第1試合のメモ" }),
    ).not.toBeInTheDocument();
  });

  it("詳細を開いたあとに記録が取り消されると詳細フォームごと閉じる", async () => {
    const user = userEvent.setup();
    const row = recordedRow();
    const { rerender } = renderRow(row);

    await user.click(screen.getByRole("button", { name: /詳細/ }));
    expect(
      screen.getByRole("combobox", { name: "勝因" }),
    ).toBeInTheDocument();

    // 取り消し後は state が "ready" に戻り、record は残らない想定。
    // 詳細トグル自体が recorded の行にしか出ないため、フォームも一緒に消える。
    rerender(
      <MatchResultRow
        row={{
          ...row,
          state: "ready",
          winnerEntryId: null,
          winReason: null,
          scores: [],
          note: null,
        }}
        slug="tennis"
        tournamentId="t1"
        action={action}
        detailAction={detailAction}
      />,
    );

    expect(
      screen.queryByRole("combobox", { name: "勝因" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /詳細/ })).not.toBeInTheDocument();
  });
});
