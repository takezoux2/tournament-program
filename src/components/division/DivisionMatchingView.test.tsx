import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { overallSeqKey } from "@/lib/division/overall-order";

// ブラケットの組み立ては DivisionBracket.test.tsx が見る。ここでは
// 「どの形式でどれを描くか」と、何を渡したかだけを確かめる。
const bracketProps = vi.fn();
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: (props: { heightClassName?: string }) => {
    bracketProps(props);
    return (
      <div data-testid="bracket">{props.heightClassName ?? "default"}</div>
    );
  },
}));

const { DivisionMatchingView } = await import("./DivisionMatchingView");

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
        matchName: "1",
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
        overallSeq={noSeq}
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
        overallSeq={noSeq}
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
        overallSeq={noSeq}
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
                matchName: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "winnerOf", matchId: "m1-0" },
                ],
              },
            ],
          },
        })}
        participants={participants}
        overallSeq={noSeq}
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
        overallSeq={noSeq}
      />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });

  it("SINGLE_ELIMINATION は大会全体の通し番号をブラケットへそのまま渡す", () => {
    const overallSeq = new Map([[overallSeqKey("d1", "m1-0"), 2]]);
    render(
      <DivisionMatchingView
        division={buildDivision({ format: "SINGLE_ELIMINATION" })}
        participants={participants}
        overallSeq={overallSeq}
      />,
    );

    expect(bracketProps.mock.lastCall?.[0].overallSeq).toBe(overallSeq);
  });

  it("ROUND_ROBIN のマスには大会全体の通し番号で展開した試合名を出す", () => {
    render(
      <DivisionMatchingView
        division={buildDivision({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "r1-0",
                bracket: "winners",
                round: 1,
                order: 0,
                matchName: "第{{OverallSeq}}試合",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e2" },
                ],
              },
            ],
          },
        })}
        participants={participants}
        overallSeq={new Map([[overallSeqKey("d1", "r1-0"), 4]])}
      />,
    );

    // 星取表は左右対称なので同じ試合名が 2 マスに出る。
    expect(screen.getAllByText("第4試合")).toHaveLength(2);
  });
});
