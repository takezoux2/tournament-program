import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { PrintDivisionSection } from "./PrintDivisionSection";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
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
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "第1試合",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "m1", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("PrintDivisionSection", () => {
  it("見出しに部門名と形式を出す", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /男子シングルス/ }),
    ).toHaveTextContent("シングルエリミネーション");
  });

  it("エリミネーションは選手番号つきの SVG で描く", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByRole("img", { name: "トーナメント表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No.2 鈴木 陽菜")).toHaveAttribute(
      "font-weight",
      "700",
    );
  });

  it("空欄モードでは勝者を太字にしない", () => {
    render(
      <PrintDivisionSection
        division={buildDivision()}
        participants={participants}
        overallSeq={noSeq}
        withResults={false}
      />,
    );

    expect(screen.getByText("No.2 鈴木 陽菜")).toHaveAttribute(
      "font-weight",
      "400",
    );
  });

  it("リーグは結果表で描き、空欄モードでは印を付けない", () => {
    const league = buildDivision({
      format: "ROUND_ROBIN",
      matchingConfig: {
        version: 1,
        matches: [
          {
            id: "r1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "e1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      results: {
        version: 1,
        matches: [{ matchId: "r1-0", winnerEntryId: "e2" }],
      },
    });

    const { rerender } = render(
      <PrintDivisionSection
        division={league}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "勝ち" })).toHaveLength(1);

    rerender(
      <PrintDivisionSection
        division={league}
        participants={participants}
        overallSeq={noSeq}
        withResults={false}
      />,
    );
    expect(screen.queryByRole("img", { name: "勝ち" })).not.toBeInTheDocument();
  });

  it("壊れた部門は案内だけを出す", () => {
    render(
      <PrintDivisionSection
        division={buildDivision({ entries: "broken" })}
        participants={participants}
        overallSeq={noSeq}
        withResults
      />,
    );

    expect(
      screen.getByText("ブラケットのデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
