import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";

describe("TournamentDescriptionMarkdown", () => {
  it("見出しをレンダリングする", () => {
    render(<TournamentDescriptionMarkdown markdown="# 大会について" />);

    expect(
      screen.getByRole("heading", { name: "大会について" }),
    ).toBeInTheDocument();
  });

  it("GFM の表をレンダリングする", () => {
    render(
      <TournamentDescriptionMarkdown
        markdown={"| 種目 | 定員 |\n| --- | --- |\n| 男子 | 32 |"}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("男子")).toBeInTheDocument();
  });

  it("リンクをレンダリングする", () => {
    render(
      <TournamentDescriptionMarkdown markdown="[会場案内](https://example.com)" />,
    );

    expect(screen.getByRole("link", { name: "会場案内" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("生の HTML を実行可能な要素としてレンダリングしない", () => {
    const { container } = render(
      <TournamentDescriptionMarkdown
        markdown={'<script>alert(1)</script><img src=x onerror="alert(1)">'}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
