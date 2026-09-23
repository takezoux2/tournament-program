import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("敗者側・決勝を含むブラケットでは区画の見出しを描く", () => {
    renderBracket(
      {
        id: "d3",
        name: "混合",
        matches: [
          {
            id: "m1",
            round: 1,
            order: 0,
            slots: [
              { kind: "participant", participantId: "a" },
              { kind: "participant", participantId: "b" },
            ],
          },
          {
            id: "m2",
            round: 1,
            order: 1,
            slots: [
              { kind: "participant", participantId: "c" },
              { kind: "participant", participantId: "d" },
            ],
          },
          {
            id: "wf",
            round: 2,
            order: 0,
            slots: [
              { kind: "winnerOf", matchId: "m1" },
              { kind: "winnerOf", matchId: "m2" },
            ],
          },
          {
            id: "l1",
            bracket: "losers",
            round: 2,
            order: 0,
            slots: [
              { kind: "loserOf", matchId: "m1" },
              { kind: "loserOf", matchId: "m2" },
            ],
          },
          {
            id: "gf",
            bracket: "final",
            round: 3,
            order: 0,
            slots: [
              { kind: "winnerOf", matchId: "wf" },
              { kind: "winnerOf", matchId: "l1" },
            ],
          },
        ],
      },
      [],
    );

    expect(screen.getByText("勝者側")).toBeInTheDocument();
    expect(screen.getByText("敗者側")).toBeInTheDocument();
    expect(screen.getByText("決勝")).toBeInTheDocument();
  });
});
