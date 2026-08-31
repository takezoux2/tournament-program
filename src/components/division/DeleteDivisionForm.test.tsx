import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DeleteDivisionForm } from "./DeleteDivisionForm";

const noopAction: DivisionFormAction = async () => ({ error: null });

const renderForm = () =>
  render(
    <DeleteDivisionForm
      action={noopAction}
      divisionName="男子シングルス"
      slug="tennis"
      tournamentId="t1"
      divisionId="d1"
    />,
  );

describe("DeleteDivisionForm", () => {
  it("結果ごと失われることを伝える", () => {
    renderForm();

    expect(
      screen.getByText(
        "エントリー・組み合わせ・勝敗記録もすべて削除されます。元に戻せません。",
      ),
    ).toBeInTheDocument();
  });

  it("部門名を入力するまで削除できない", async () => {
    renderForm();

    const button = screen.getByRole("button", { name: "この部門を削除する" });
    expect(button).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("確認のため部門名を入力"),
      "男子シングルス",
    );

    expect(button).toBeEnabled();
  });

  it("入力が一致しないうちは押せない", async () => {
    renderForm();

    await userEvent.type(
      screen.getByLabelText("確認のため部門名を入力"),
      "男子",
    );

    expect(
      screen.getByRole("button", { name: "この部門を削除する" }),
    ).toBeDisabled();
  });
});
