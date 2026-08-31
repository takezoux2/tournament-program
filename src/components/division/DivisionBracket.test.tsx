import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";

// @xyflow/react は jsdom で実寸を測れないため、描画そのものは差し替える。
// ここで確かめたいのは「描くか、どんな案内を出すか」の分岐。
vi.mock("@/components/tournament/TournamentFlow", () => ({
  TournamentFlow: ({ nodes }: { nodes: unknown[] }) => (
    <div data-testid="flow">{nodes.length}</div>
  ),
}));

const { DivisionBracket } = await import("./DivisionBracket");

const participants = [
  { id: "p1", name: "佐藤 蓮" },
  { id: "p2", name: "鈴木 陽菜" },
];

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
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("DivisionBracket", () => {
  it("組み合わせがあれば描画する", () => {
    render(
      <DivisionBracket
        division={buildDivision()}
        participants={participants}
      />,
    );

    expect(screen.getByTestId("flow")).toHaveTextContent("1");
  });

  it("組み合わせが未作成ならその旨を案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({
          matchingConfig: { version: 1, matches: [] },
        })}
        participants={participants}
      />,
    );

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).toBeNull();
  });

  it("対応していない形式は形式名を添えて案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({ format: "ROUND_ROBIN" })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText(
        "「リーグ（総当たり）」のブラケット表示はまだ対応していません",
      ),
    ).toBeInTheDocument();
  });

  it("敗者復活を含む組み合わせは未対応として案内する", () => {
    render(
      <DivisionBracket
        division={buildDivision({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1",
                bracket: "winners",
                round: 1,
                order: 0,
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "loserOf", matchId: "m0" },
                ],
              },
            ],
          },
        })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("この組み合わせはまだ表示に対応していません"),
    ).toBeInTheDocument();
  });

  // Json は DB の列で、アプリの外から壊れた値が入りうる。ページ全体を
  // 落とさず、この区画だけで受け止める。
  it("Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionBracket
        division={buildDivision({ matchingConfig: { version: 2 } })}
        participants={participants}
      />,
    );

    expect(
      screen.getByText("ブラケットのデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
