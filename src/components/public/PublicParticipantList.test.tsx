import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionParticipant } from "@/features/division/repository";
import { PublicParticipantList } from "./PublicParticipantList";

const participants: DivisionParticipant[] = [
  {
    id: "p3",
    name: "高橋 葵",
    nameKana: "タカハシ アオイ",
    playerNumber: "10",
  },
  {
    id: "p1",
    name: "佐藤 蓮",
    nameKana: "サトウ レン",
    playerNumber: "2",
  },
  {
    id: "p2",
    name: "鈴木 陽菜",
    nameKana: "スズキ ハルナ",
    playerNumber: "1",
    team: "A チーム",
  },
];

describe("PublicParticipantList", () => {
  it("選手番号を数値として比較して並べる（10 が 2 より後ろ）", () => {
    render(<PublicParticipantList participants={participants} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("鈴木 陽菜");
    expect(items[1]).toHaveTextContent("佐藤 蓮");
    expect(items[2]).toHaveTextContent("高橋 葵");
  });

  it("渡された配列を破壊しない", () => {
    const input = [...participants];
    render(<PublicParticipantList participants={input} />);

    expect(input[0].id).toBe("p3");
  });

  it("選手番号を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("No.10")).toBeInTheDocument();
  });

  it("チームがあれば出し、無ければ出さない", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("A チーム")).toBeInTheDocument();
    // 2 番目は佐藤（team なし）。
    expect(screen.getAllByRole("listitem")[1]).not.toHaveTextContent("チーム");
  });

  it("参加者が居なければその旨を出す", () => {
    render(<PublicParticipantList participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeInTheDocument();
  });
});
