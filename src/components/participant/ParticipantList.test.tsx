import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TournamentParticipant } from "@/features/participant/repository";
import { ParticipantList } from "./ParticipantList";

const noop = async () => ({ error: null });

const participants: TournamentParticipant[] = [
  {
    id: "p1",
    name: "竹添",
    nameKana: "たけぞえ",
    playerNumber: "1",
    team: "A中学",
    divisions: [
      { id: "d1", name: "男子の部" },
      { id: "d2", name: "団体戦" },
    ],
  },
  {
    id: "p2",
    name: "山田",
    nameKana: "やまだ",
    playerNumber: "2",
    divisions: [],
  },
];

const renderList = (canEdit: boolean) =>
  render(
    <ParticipantList
      slug="tennis"
      tournamentId="t1"
      participants={participants}
      canEdit={canEdit}
      setPlayerNumberAction={noop}
      removeAction={noop}
    />,
  );

describe("ParticipantList", () => {
  it("番号・氏名・かな・所属を出す", () => {
    renderList(true);

    expect(screen.getByText("No.1")).toBeVisible();
    expect(screen.getByText("竹添")).toBeVisible();
    expect(screen.getByText("たけぞえ")).toBeVisible();
    expect(screen.getByText("A中学")).toBeVisible();
  });

  it("出場部門を並べる", () => {
    renderList(true);

    expect(screen.getByText("男子の部")).toBeVisible();
    expect(screen.getByText("団体戦")).toBeVisible();
  });

  it("どの部門にも居ない参加者はその旨を出す", () => {
    // 運営がこの行を消せると分かる手がかりになる。
    renderList(true);

    expect(screen.getByText("出場部門なし")).toBeVisible();
  });

  it("編集できないときは番号の編集も削除も出さない", () => {
    renderList(false);

    expect(screen.queryByLabelText("竹添の選手番号")).toBeNull();
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("編集できるときは番号の編集と削除を出す", () => {
    renderList(true);

    expect(screen.getByLabelText("竹添の選手番号")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(2);
  });

  it("1 件も無ければその旨を出す", () => {
    render(
      <ParticipantList
        slug="tennis"
        tournamentId="t1"
        participants={[]}
        canEdit
        setPlayerNumberAction={noop}
        removeAction={noop}
      />,
    );

    expect(screen.getByText("まだ参加者がいません")).toBeVisible();
  });
});
