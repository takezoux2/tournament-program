import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolvedMatch, ResolvedSlot } from "@/features/bracket/types";
import { MatchCard } from "./MatchCard";

const confirmed = (
  id: string,
  name: string,
  seed: number,
  isWinner: boolean,
): ResolvedSlot => ({
  participant: { id, name, seed },
  state: "confirmed",
  isWinner,
  score: null,
});

const pending: ResolvedSlot = {
  participant: null,
  state: "pending",
  isWinner: false,
  score: null,
};

const bye: ResolvedSlot = {
  participant: null,
  state: "bye",
  isWinner: false,
  score: null,
};

const doneMatch: ResolvedMatch = {
  id: "r2-m1",
  round: 2,
  order: 0,
  slots: [
    confirmed("p1", "佐藤 蓮", 1, true),
    confirmed("p8", "中村 芽依", 8, false),
  ],
  winnerId: "p1",
  score: "3-1",
  winReason: null,
  note: null,
  status: "done",
  sourceMatchIds: ["r1-m1", "r1-m2"],
  matchNumber: null,
};

describe("MatchCard", () => {
  it("両者の名前とシード番号を表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("佐藤 蓮")).toBeInTheDocument();
    expect(screen.getByText("中村 芽依")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("スコアを表示する", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByText("3-1")).toBeInTheDocument();
  });

  it("勝者の行だけ data-winner が true になる", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("slot-r2-m1-0")).toHaveAttribute(
      "data-winner",
      "true",
    );
    expect(screen.getByTestId("slot-r2-m1-1")).toHaveAttribute(
      "data-winner",
      "false",
    );
  });

  it("ルート要素に status を出す", () => {
    render(<MatchCard match={doneMatch} />);
    expect(screen.getByTestId("match-r2-m1")).toHaveAttribute(
      "data-status",
      "done",
    );
  });

  it("未確定スロットは「未定」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r4-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, false), pending],
          winnerId: null,
          score: null,
          status: "waiting",
        }}
      />,
    );
    expect(screen.getByText("未定")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r4-m1-1")).toHaveAttribute(
      "data-slot-state",
      "pending",
    );
  });

  it("BYE スロットは「BYE」と表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          id: "r1-m1",
          slots: [confirmed("p1", "佐藤 蓮", 1, true), bye],
          score: null,
          status: "bye",
        }}
      />,
    );
    expect(screen.getByText("BYE")).toBeInTheDocument();
    expect(screen.getByTestId("slot-r1-m1-1")).toHaveAttribute(
      "data-slot-state",
      "bye",
    );
  });

  it("スコアが無ければ何も表示しない", () => {
    render(<MatchCard match={{ ...doneMatch, id: "r3-m1", score: null }} />);
    expect(screen.queryByText("3-1")).not.toBeInTheDocument();
  });

  it("試合番号があればバッジで表示する", () => {
    render(<MatchCard match={{ ...doneMatch, matchNumber: "7" }} />);
    expect(
      screen.getByTestId(`match-number-${doneMatch.id}`),
    ).toHaveTextContent("7");
  });

  it("試合番号が null ならバッジを出さない", () => {
    render(<MatchCard match={{ ...doneMatch, matchNumber: null }} />);
    expect(
      screen.queryByTestId(`match-number-${doneMatch.id}`),
    ).not.toBeInTheDocument();
  });

  it("スロットにスコアがあれば各行に表示する", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          slots: [
            { ...doneMatch.slots[0], score: "21" },
            { ...doneMatch.slots[1], score: "18" },
          ],
        }}
      />,
    );
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  // スロットにスコアがあるときは旧来の右上バッジ（match.score）と重なるため出さない。
  it("スロットにスコアがあれば右上の旧バッジは出さない", () => {
    render(
      <MatchCard
        match={{
          ...doneMatch,
          score: "3-1",
          slots: [
            { ...doneMatch.slots[0], score: "21" },
            { ...doneMatch.slots[1], score: "18" },
          ],
        }}
      />,
    );
    expect(screen.queryByText("3-1")).not.toBeInTheDocument();
  });

  it("勝因は勝者の行にだけ表示する", () => {
    render(<MatchCard match={{ ...doneMatch, winReason: "一本勝ち" }} />);
    const winnerRow = screen.getByTestId(`slot-${doneMatch.id}-0`);
    const loserRow = screen.getByTestId(`slot-${doneMatch.id}-1`);
    expect(winnerRow).toHaveTextContent("一本勝ち");
    expect(loserRow).not.toHaveTextContent("一本勝ち");
  });

  it("メモがあり試合番号もあれば「第N試合のメモ」を読み上げ用ラベルにする", () => {
    render(
      <MatchCard
        match={{ ...doneMatch, note: "抗議あり", matchNumber: "7" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "第7試合のメモ" }),
    ).toBeInTheDocument();
  });

  // 試合番号が無いとき、内部 id をそのままラベルに出すと読み上げに適さない
  // ため、汎用の文言に落とす。
  it("メモがあり試合番号が無ければ「試合のメモ」を読み上げ用ラベルにする", () => {
    render(
      <MatchCard
        match={{ ...doneMatch, note: "抗議あり", matchNumber: null }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "試合のメモ" }),
    ).toBeInTheDocument();
  });

  // React Flow のノード内では、opt-out クラスが無いとボタン上の押下が
  // ノードのドラッグ・パンに取られる。
  it("メモボタンは React Flow のドラッグ・パンから外す", () => {
    render(<MatchCard match={{ ...doneMatch, note: "抗議あり" }} />);
    const wrapper = screen.getByRole("button", {
      name: "試合のメモ",
    }).parentElement;
    expect(wrapper).toHaveClass("nodrag", "nopan");
  });

  it("メモが無ければメモボタンを表示しない", () => {
    render(<MatchCard match={{ ...doneMatch, note: null }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
