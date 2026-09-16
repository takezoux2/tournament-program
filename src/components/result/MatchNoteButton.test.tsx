import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchNoteButton } from "./MatchNoteButton";

describe("MatchNoteButton", () => {
  it("メモが無ければ何も出さない", () => {
    const { container } = render(
      <MatchNoteButton note={null} label="第1試合のメモ" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("空文字のメモも出さない", () => {
    const { container } = render(
      <MatchNoteButton note="" label="第1試合のメモ" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("メモがあればボタンと本文を出す", () => {
    render(<MatchNoteButton note="抗議あり" label="第1試合のメモ" />);
    const button = screen.getByRole("button", { name: "第1試合のメモ" });
    expect(button).toHaveAttribute("popovertarget");
    expect(screen.getByText("抗議あり")).toBeInTheDocument();
  });
});
