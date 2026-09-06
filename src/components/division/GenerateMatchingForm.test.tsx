import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionFormState } from "@/features/division/state";
import { GenerateMatchingForm } from "./GenerateMatchingForm";

const noopAction = vi.fn(
  async (_state: DivisionFormState, _data: FormData) => ({ error: null }),
);

const props = {
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  action: noopAction,
  disabled: false,
};

describe("GenerateMatchingForm", () => {
  it("渡された文言のボタンを出す", () => {
    render(<GenerateMatchingForm {...props} label="対戦表を生成" />);
    expect(
      screen.getByRole("button", { name: "対戦表を生成" }),
    ).toBeInTheDocument();
  });

  it("3 つの識別子を hidden で送る", () => {
    const { container } = render(
      <GenerateMatchingForm {...props} label="組み合わせを生成" />,
    );
    for (const [name, value] of [
      ["slug", "acme"],
      ["tournamentId", "t1"],
      ["divisionId", "d1"],
    ]) {
      expect(container.querySelector(`input[name="${name}"]`)).toHaveValue(
        value,
      );
    }
  });

  it("disabled のときはボタンを押せない", () => {
    render(<GenerateMatchingForm {...props} disabled label="対戦表を生成" />);
    expect(screen.getByRole("button", { name: "対戦表を生成" })).toBeDisabled();
  });
});
