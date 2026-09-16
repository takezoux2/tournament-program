import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TournamentFormState } from "@/features/tournament/state";
import { PublishTournamentButton } from "./PublishTournamentButton";

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

describe("PublishTournamentButton", () => {
  it("公開ボタンで大会名入りの確認モーダルが開く", () => {
    render(
      <PublishTournamentButton
        action={async () => ({ error: null })}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));

    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    expect(dialog).toHaveTextContent(
      "「春季大会」を公開しますか？公開すると参加者を含む誰でも公開ページを閲覧できるようになります。",
    );
  });

  it("確定すると slug と大会 id を action に渡し、エラーを表示する", async () => {
    const action = vi.fn(
      async (_state: TournamentFormState, formData: FormData) => {
        expect(formData.get("slug")).toBe("tennis");
        expect(formData.get("tournamentId")).toBe("t1");
        return { error: "この大会はすでに公開されています" };
      },
    );

    render(
      <PublishTournamentButton
        action={action}
        slug="tennis"
        tournamentId="t1"
        tournamentName="春季大会"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    fireEvent.click(within(dialog).getByRole("button", { name: "公開する" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "この大会はすでに公開されています",
    );
  });
});
