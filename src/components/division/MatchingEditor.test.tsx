import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SetupMatchView } from "@/features/division/single-elimination/view";
import { MatchingEditor } from "./MatchingEditor";

const matches: SetupMatchView[] = [
  {
    matchId: "m1-0",
    slots: [
      { index: 0, label: "山田太郎" },
      { index: 1, label: null },
    ],
  },
  {
    matchId: "m1-1",
    slots: [
      { index: 2, label: "佐藤花子" },
      { index: 3, label: "鈴木一郎" },
    ],
  },
];

describe("MatchingEditor", () => {
  it("組み合わせが無ければその旨を出す", () => {
    render(<MatchingEditor matches={[]} onSwap={vi.fn()} disabled={false} />);

    expect(screen.getByText("組み合わせが未作成です")).toBeInTheDocument();
  });

  it("1 回戦のカードを並べる", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("スロットに氏名を出す", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("山田太郎")).toBeInTheDocument();
    expect(within(cards[1]).getByText("鈴木一郎")).toBeInTheDocument();
  });

  it("bye は不戦勝として出す", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(screen.getByText("（不戦勝）")).toBeInTheDocument();
  });

  it("入れ替えの操作方法を案内する", () => {
    render(
      <MatchingEditor matches={matches} onSwap={vi.fn()} disabled={false} />,
    );

    expect(
      screen.getByText(
        "スロットをドラッグして別のスロットへ落とすと入れ替わります",
      ),
    ).toBeInTheDocument();
  });
});
