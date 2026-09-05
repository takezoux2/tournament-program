import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicHeader } from "./PublicHeader";

describe("PublicHeader", () => {
  it("href のあるパンくずはリンクにする", () => {
    render(
      <PublicHeader
        crumbs={[
          { label: "テニス部" },
          { label: "春季大会", href: "/t/t1" },
          { label: "試合一覧" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/t/t1",
    );
  });

  it("href のないパンくずはリンクにしない", () => {
    render(<PublicHeader crumbs={[{ label: "試合一覧" }]} />);

    expect(screen.getByText("試合一覧")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ログアウトやユーザー名を出さない（公開ページのため）", () => {
    render(<PublicHeader crumbs={[{ label: "春季大会" }]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
