import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";

// ブラケットの組み立ては DivisionBracket.test.tsx が見る。ここでは
// 「どの形式でどれを描くか」だけを確かめたいので、ブラケットは差し替える。
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: ({ heightClassName }: { heightClassName?: string }) => (
    <div data-testid="bracket">{heightClassName ?? "default"}</div>
  ),
}));

const { DivisionMatchingView } = await import("./DivisionMatchingView");

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "ROUND_ROBIN",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "r1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        sequence: 0,
        matchNumber: "1",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "r1-0", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("DivisionMatchingView", () => {
  it("SINGLE_ELIMINATION はブラケットに高さを渡して描く", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "SINGLE_ELIMINATION" })}
        participants={participants}
        heightClassName="h-[20rem]"
      />,
    );

    expect(screen.getByTestId("bracket")).toHaveTextContent("h-[20rem]");
  });

  it("ROUND_ROBIN は結果表を描く", () => {
    render(
      <DivisionMatchingView
        division={buildDivision()}
        participants={participants}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "順位" }),
    ).toBeInTheDocument();
    // 鈴木が勝ったので 1 位の行に来る
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("鈴木 陽菜");
    expect(screen.getByLabelText("勝ち")).toBeInTheDocument();
    expect(screen.queryByTestId("bracket")).toBeNull();
  });

  it("ROUND_ROBIN で組み合わせが未作成なら案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: { version: 1, matches: [] },
        })}
        participants={participants}
      />,
    );

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
  });

  it("ROUND_ROBIN でトーナメントの木が残っていれば形が違うと案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m2-0",
                bracket: "winners",
                round: 2,
                order: 0,
                sequence: 0,
                matchNumber: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "winnerOf", matchId: "m1-0" },
                ],
              },
            ],
          },
        })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("この対戦表はリーグの形ではありません"),
    ).toBeInTheDocument();
  });

  // Json は DB の列で、アプリの外から壊れた値が入りうる。ページ全体を
  // 落とさず、この区画だけで受け止める。
  it("ROUND_ROBIN で Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ matchingConfig: { version: 2 } })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });

  it("対応していない形式は形式名を添えて案内する", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText(
        "「ダブルエリミネーション（優勝決定戦あり）」のブラケット表示はまだ対応していません",
      ),
    ).toBeInTheDocument();
  });
});
