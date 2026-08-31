import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionForm } from "./DivisionForm";

const noopAction: DivisionFormAction = async () => ({ error: null });

describe("DivisionForm", () => {
  it("試合形式を日本語ラベルの選択肢として出す", () => {
    render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    const select = screen.getByLabelText("試合形式");
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "シングルエリミネーション" }),
    ).toHaveValue("SINGLE_ELIMINATION");
    expect(
      screen.getByRole("option", { name: "リーグ（総当たり）" }),
    ).toHaveValue("ROUND_ROBIN");
  });

  it("作成時は divisionId を送らない", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    expect(container.querySelector('input[name="divisionId"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "作成する" }),
    ).toBeInTheDocument();
  });

  it("編集時は既定値と divisionId を持つ", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="保存する"
        defaultName="男子シングルス"
        defaultFormat="ROUND_ROBIN"
        divisionId="d1"
      />,
    );

    expect(screen.getByLabelText("部門名")).toHaveValue("男子シングルス");
    expect(screen.getByLabelText("試合形式")).toHaveValue("ROUND_ROBIN");
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });
});
