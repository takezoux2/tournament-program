import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { UnpublishTournamentForm } from "./UnpublishTournamentForm";

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

describe("UnpublishTournamentForm", () => {
  it("非公開ボタンで大会名入りの確認モーダルが開く", () => {
    render(
      <UnpublishTournamentForm
        action={async () => ({ error: null })}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "公開設定" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "非公開にする" }));

    const dialog = screen.getByRole("dialog", { name: "大会を非公開にする" });
    expect(dialog).toHaveTextContent(
      "「春季大会」を非公開にしますか？参加者は公開ページを閲覧できなくなります。",
    );
  });

  it("確定すると slug と大会 id を action に渡す", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        return { error: null };
      },
    );

    render(
      <UnpublishTournamentForm
        action={action}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "非公開にする" }));
    const dialog = screen.getByRole("dialog", { name: "大会を非公開にする" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "非公開にする" }),
    );

    await waitFor(() => expect(action).toHaveBeenCalled());
  });
});
