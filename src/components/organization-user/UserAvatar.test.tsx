import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./UserAvatar";

describe("UserAvatar", () => {
  it("image があれば画像を表示する", () => {
    render(<UserAvatar name="竹添" image="https://example.com/a.png" />);

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
  });

  it("image が無ければ名前の頭文字を表示する", () => {
    render(<UserAvatar name="竹添" image={null} />);

    expect(screen.getByText("竹")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("名前が空文字でも落ちない", () => {
    render(<UserAvatar name="" image={null} />);

    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
