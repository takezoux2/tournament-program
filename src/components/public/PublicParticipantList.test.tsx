import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TournamentParticipant } from "@/features/participant/repository";
import { PublicParticipantList } from "./PublicParticipantList";

const participants: TournamentParticipant[] = [
  {
    id: "p1",
    name: "竹添",
    nameKana: "たけぞえ",
    playerNumber: "1",
    team: "A中学",
    divisions: [{ id: "d1", name: "男子の部" }],
  },
  {
    id: "p2",
    name: "山田",
    nameKana: "やまだ",
    playerNumber: "2",
    divisions: [],
  },
];

describe("PublicParticipantList", () => {
  it("番号・氏名・所属を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("No.1")).toBeVisible();
    expect(screen.getByText("竹添")).toBeVisible();
    expect(screen.getByText("A中学")).toBeVisible();
  });

  it("出場部門を出す", () => {
    render(<PublicParticipantList participants={participants} />);

    expect(screen.getByText("男子の部")).toBeVisible();
  });

  it("出場部門が無い参加者には何も添えない", () => {
    // 準備中の大会で未エントリーの参加者を晒す意味がないため、
    // 管理画面と違って「出場部門なし」とは書かない。
    render(<PublicParticipantList participants={participants} />);

    expect(screen.queryByText("出場部門なし")).toBeNull();
    expect(screen.getByText("山田")).toBeVisible();
  });

  it("渡された順に描く", () => {
    // 並べ替えは repository が済ませている。
    render(
      <PublicParticipantList
        participants={[participants[1], participants[0]]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("山田");
    expect(items[1]).toHaveTextContent("竹添");
  });

  it("1 件も無ければその旨を出す", () => {
    render(<PublicParticipantList participants={[]} />);

    expect(screen.getByText("まだ参加者がいません")).toBeVisible();
  });
});
