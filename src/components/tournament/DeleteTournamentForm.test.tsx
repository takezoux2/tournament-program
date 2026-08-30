import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { DeleteTournamentForm } from "./DeleteTournamentForm";

const noop = async (): Promise<TournamentFormState> => ({ error: null });

const formIn = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("form が見つからない");
  return form;
};

describe("DeleteTournamentForm", () => {
  it("大会名が一致するまで削除ボタンを押せない", () => {
    render(
      <DeleteTournamentForm
        action={noop}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    const button = screen.getByRole("button", { name: "この大会を削除する" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("確認のため大会名を入力"), {
      target: { value: "春季大会" },
    });
    expect(button).toBeEnabled();
  });

  it("送信すると slug・大会 id・入力値を action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        expect(formData.get("confirmName")).toBe("春季大会");
        return { error: null };
      },
    );

    const { container } = render(
      <DeleteTournamentForm
        action={action}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    fireEvent.change(screen.getByLabelText("確認のため大会名を入力"), {
      target: { value: "春季大会" },
    });
    fireEvent.submit(formIn(container));

    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("action がエラーを返したらアラートとして表示する", async () => {
    const action = async (): Promise<TournamentFormState> => ({
      error: "大会名が一致しません",
    });

    const { container } = render(
      <DeleteTournamentForm
        action={action}
        tournamentName="春季大会"
        slug="tennis"
        tournamentId="t1"
      />,
    );

    fireEvent.submit(formIn(container));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "大会名が一致しません",
    );
  });
});
