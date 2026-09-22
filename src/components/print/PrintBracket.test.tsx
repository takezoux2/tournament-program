import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { prepareBracket } from "@/components/division/prepare-bracket";
import {
  layoutBracket,
  sectionLabels,
} from "@/features/bracket/layout-bracket";
import { resolveBracket } from "@/features/bracket/resolve-bracket";
import type {
  Bracket,
  MatchResult,
  Participant,
} from "@/features/bracket/types";
import { buildDoubleElimination } from "@/features/division/double-elimination/build";
import type {
  DivisionDetail,
  DivisionParticipant,
} from "@/features/division/repository";
import { generateSlots } from "@/features/division/single-elimination/edit";
import { PrintBracket } from "./PrintBracket";

const participants: Participant[] = [
  { id: "a", name: "No.1 佐藤", seed: 0 },
  { id: "b", name: "No.2 鈴木", seed: 1 },
  { id: "c", name: "No.3 高橋", seed: 2 },
  { id: "d", name: "No.4 田中", seed: 3 },
];

const bracket: Bracket = {
  id: "d1",
  name: "男子",
  matches: [
    {
      id: "m1",
      round: 1,
      order: 0,
      matchName: "第1試合",
      slots: [
        { kind: "participant", participantId: "a" },
        { kind: "participant", participantId: "b" },
      ],
    },
    {
      id: "m2",
      round: 1,
      order: 1,
      matchName: "第2試合",
      slots: [
        { kind: "participant", participantId: "c" },
        { kind: "participant", participantId: "d" },
      ],
    },
    {
      id: "m3",
      round: 2,
      order: 0,
      matchName: "決勝",
      slots: [
        { kind: "winnerOf", matchId: "m1" },
        { kind: "winnerOf", matchId: "m2" },
      ],
    },
  ],
};

const renderBracket = (target: Bracket, results: MatchResult[]) => {
  const matches = resolveBracket(participants, target, results);
  const positions = layoutBracket(matches);
  return render(
    <PrintBracket
      matches={matches}
      positions={positions}
      labels={sectionLabels(matches, positions)}
    />,
  );
};

describe("PrintBracket", () => {
  it("試合ごとにカードを描き、勝ち上がりを線で結ぶ", () => {
    renderBracket(bracket, []);

    expect(
      screen.getByRole("img", { name: "トーナメント表" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^print-match-/)).toHaveLength(3);
    expect(screen.getAllByTestId("print-connector")).toHaveLength(2);
    expect(screen.getByText("決勝")).toBeInTheDocument();
  });

  it("小さいトーナメント表は実寸のまま、最小サイズ (1100x700) まで viewBox を広げる", () => {
    renderBracket(bracket, []);

    const svg = screen.getByRole("img", { name: "トーナメント表" });
    const [, , width, height] = (svg.getAttribute("viewBox") ?? "")
      .split(" ")
      .map(Number);
    expect(width).toBeGreaterThanOrEqual(1100);
    expect(height).toBeGreaterThanOrEqual(700);
  });

  it("試合名はカードの幅で切れる見出し用の svg に入れる", () => {
    renderBracket(bracket, []);

    const matchName = screen.getByText("決勝");
    expect(matchName.closest("svg")).toHaveAttribute("width", "220");
  });

  it("結果があれば勝者を太字にし、スコアを添える", () => {
    renderBracket(bracket, [{ matchId: "m1", winnerId: "a", score: "3-1" }]);

    // 勝者は 1 回戦と、勝ち上がった決勝の 2 か所に出る。1 回戦のカードだけを見る
    const winner = screen
      .getAllByText("No.1 佐藤")
      .find((element) => element.closest("[data-testid='print-match-m1']"));
    expect(winner).toHaveAttribute("font-weight", "700");
    expect(screen.getByText("No.2 鈴木")).toHaveAttribute("font-weight", "400");
    expect(screen.getByText("3-1")).toBeInTheDocument();
  });

  it("結果が無ければ誰も太字にせず、未確定のスロットは空欄にする", () => {
    renderBracket(bracket, []);

    for (const name of ["No.1 佐藤", "No.2 鈴木", "No.3 高橋", "No.4 田中"]) {
      expect(screen.getByText(name)).toHaveAttribute("font-weight", "400");
    }
    // 決勝の 2 スロットは未確定。名前は出さない
    const final = screen.getByTestId("print-match-m3");
    expect(final).not.toHaveTextContent("佐藤");
  });

  it("不戦のスロットは「不戦」と書く", () => {
    renderBracket(
      {
        id: "d2",
        name: "女子",
        matches: [
          {
            id: "m1",
            round: 1,
            order: 0,
            slots: [
              { kind: "participant", participantId: "a" },
              { kind: "bye" },
            ],
          },
        ],
      },
      [],
    );

    expect(screen.getByText("不戦")).toBeInTheDocument();
  });

  it("ダブルエリミネーションは勝者側・敗者側・決勝を描き、線の本数は供給元の数と揃う", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
        { id: "e3", participantId: "p3", seed: 2 },
        { id: "e4", participantId: "p4", seed: 3 },
      ],
    };
    const division: DivisionDetail = {
      id: "d1",
      name: "男子ダブルス",
      order: 0,
      format: "DOUBLE_ELIMINATION_GRAND_FINAL",
      entries,
      matchingConfig: buildDoubleElimination(
        generateSlots(entries.entries),
        "grandFinal",
      ),
      results: { version: 1, matches: [] },
      resultConfig: null,
      createdAt: new Date("2026-08-01T00:00:00Z"),
    };
    const participants: DivisionParticipant[] = [
      { id: "p1", name: "佐藤", nameKana: "サトウ", playerNumber: "1" },
      { id: "p2", name: "鈴木", nameKana: "スズキ", playerNumber: "2" },
      { id: "p3", name: "高橋", nameKana: "タカハシ", playerNumber: "3" },
      { id: "p4", name: "田中", nameKana: "タナカ", playerNumber: "4" },
    ];

    const prepared = prepareBracket(division, participants, new Map());
    if (prepared.kind !== "ready") {
      throw new Error(`ブラケットを組み立てられなかった: ${prepared.message}`);
    }

    render(
      <PrintBracket
        matches={prepared.matches}
        positions={prepared.positions}
        labels={prepared.labels}
      />,
    );

    expect(screen.getByText("勝者側")).toBeInTheDocument();
    expect(screen.getByText("敗者側")).toBeInTheDocument();
    expect(screen.getByText("決勝")).toBeInTheDocument();

    const expectedConnectors = prepared.matches.reduce(
      (count, match) =>
        count + match.sourceMatchIds.filter((id) => id !== null).length,
      0,
    );
    expect(screen.getAllByTestId("print-connector")).toHaveLength(
      expectedConnectors,
    );
  });
});
