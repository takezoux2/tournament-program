import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionReorderButtons } from "./DivisionReorderButtons";

const noopAction: DivisionFormAction = async () => ({ error: null });

const renderButtons = (canMoveUp: boolean, canMoveDown: boolean) =>
  render(
    <DivisionReorderButtons
      action={noopAction}
      slug="tennis"
      tournamentId="t1"
      divisionId="d1"
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
    />,
  );

describe("DivisionReorderButtons", () => {
  it("向きを submit ボタンの値として送る", () => {
    renderButtons(true, true);

    expect(screen.getByRole("button", { name: "上へ移動" })).toHaveAttribute(
      "value",
      "up",
    );
    expect(screen.getByRole("button", { name: "下へ移動" })).toHaveAttribute(
      "value",
      "down",
    );
  });

  it("どの部門を動かすかを hidden で持つ", () => {
    const { container } = renderButtons(true, true);

    expect(container.querySelector('input[name="slug"]')).toHaveValue("tennis");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });

  // 活性の判定は体感のためのもので、境界ではない。端の要求は handler が
  // swapped: false として受け流す。
  it("先頭では上へ、末尾では下へを押せなくする", () => {
    renderButtons(false, true);

    expect(screen.getByRole("button", { name: "上へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下へ移動" })).toBeEnabled();
  });
});
