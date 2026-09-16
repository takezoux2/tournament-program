import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

// jsdom は <dialog> の showModal / close を実装していないので、open 属性の
// 付け外しだけを模す。
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

const baseProps = {
  triggerLabel: "公開する",
  title: "大会を公開",
  message: "公開しますか？",
  confirmLabel: "公開する",
  pendingLabel: "公開中...",
  pending: false,
  error: null,
  hiddenFields: { slug: "tennis", tournamentId: "t1" },
};

describe("ConfirmDialog", () => {
  it("トリガーを押すまでダイアログは開かない", () => {
    const { container } = render(
      <ConfirmDialog {...baseProps} formAction={vi.fn()} />,
    );

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("トリガーでダイアログが開き、キャンセルで閉じる", () => {
    render(<ConfirmDialog {...baseProps} formAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("公開しますか？");

    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("確定すると hidden 値を含めて formAction を呼ぶ", async () => {
    const formAction = vi.fn();
    render(<ConfirmDialog {...baseProps} formAction={formAction} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    const dialog = screen.getByRole("dialog", { name: "大会を公開" });
    const form = dialog.querySelector("form");
    if (!form) throw new Error("form が見つからない");
    fireEvent.submit(form);

    await waitFor(() => expect(formAction).toHaveBeenCalled());
    const formData = formAction.mock.calls[0][0] as FormData;
    expect(formData.get("slug")).toBe("tennis");
    expect(formData.get("tournamentId")).toBe("t1");
  });

  it("送信中は確定ボタンが押せず、送信中の文言になる", () => {
    render(<ConfirmDialog {...baseProps} pending formAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    expect(screen.getByRole("button", { name: "公開中..." })).toBeDisabled();
  });

  it("エラーをダイアログ内に表示する", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        error="この大会はすでに公開されています"
        formAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("この大会はすでに公開されています"),
    ).toHaveAttribute("role", "alert");
  });
});
