import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { PlayerNumberForm } from "./PlayerNumberForm";

describe("PlayerNumberForm", () => {
  it("participantId と入力した番号を送る", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (_state: DivisionFormState, _data: FormData) => ({
        error: null,
      }),
    );
    render(
      <PlayerNumberForm
        participantId="p1"
        playerNumber="1"
        participantName="山田"
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={action}
      />,
    );

    const input = screen.getByLabelText("山田の選手番号");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const sent = action.mock.calls[0][1];
    expect(sent.get("participantId")).toBe("p1");
    expect(sent.get("playerNumber")).toBe("10");
    expect(sent.get("confirmedNumber")).toBe("");
  });

  it("確認待ちの state ではメッセージを出し confirmedNumber を積む", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (
        _state: DivisionFormState,
        _data: FormData,
      ): Promise<DivisionFormState> => ({
        error: null,
        confirm: {
          message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
          value: "10",
        },
      }),
    );
    render(
      <PlayerNumberForm
        participantId="p1"
        playerNumber="1"
        participantName="山田"
        slug="org"
        tournamentId="t1"
        divisionId="d1"
        action={action}
      />,
    );

    const input = screen.getByLabelText("山田の選手番号");
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText(
        "同じ番号の選手がすでにいます。もう一度保存すると確定します",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));
    const second = action.mock.calls[1][1];
    expect(second.get("confirmedNumber")).toBe("10");
  });
});
