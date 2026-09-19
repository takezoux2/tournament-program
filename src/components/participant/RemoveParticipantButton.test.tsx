import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { RemoveParticipantButton } from "./RemoveParticipantButton";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const participant = {
  id: "p1",
  name: "竹添",
  nameKana: "たけぞえ",
  playerNumber: "1",
  divisions: [],
};

describe("RemoveParticipantButton", () => {
  it("出場部門が無ければ押せる", () => {
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={participant}
        action={async () => ({ error: null })}
      />,
    );

    expect(screen.getByRole("button", { name: "削除" })).toBeEnabled();
  });

  it("出場部門があれば押せず、理由を添える", () => {
    // 拒否の境界は Server Action 側。ここは体感のための出し分け。
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={{
          ...participant,
          divisions: [{ id: "d1", name: "男子の部" }],
        }}
        action={async () => ({ error: null })}
      />,
    );

    const button = screen.getByRole("button", { name: "削除" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "男子の部 にエントリー中のため削除できません",
    );
  });

  it("確認ダイアログに氏名を出す", async () => {
    const user = userEvent.setup();
    render(
      <RemoveParticipantButton
        slug="tennis"
        tournamentId="t1"
        participant={participant}
        action={async () => ({ error: null })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(
      screen.getByText(
        "「竹添」を大会から削除しますか？組織のメンバーは残ります。",
      ),
    ).toBeVisible();
  });
});
