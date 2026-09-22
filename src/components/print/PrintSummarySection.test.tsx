import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintSummarySection } from "./PrintSummarySection";

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: null,
  status: "IN_PROGRESS" as const,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  isPreview: false,
};

describe("PrintSummarySection", () => {
  it("大会名・組織名・開始日時・ステータスを出す", () => {
    render(<PrintSummarySection tournament={tournament} divisions={[]} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("テニス部")).toBeInTheDocument();
    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("概要が空なら概要の見出しを出さない", () => {
    render(<PrintSummarySection tournament={tournament} divisions={[]} />);

    expect(
      screen.queryByRole("heading", { name: "概要" }),
    ).not.toBeInTheDocument();
  });

  it("概要があれば Markdown として出す", () => {
    render(
      <PrintSummarySection
        tournament={{ ...tournament, description: "**集合** 9 時" }}
        divisions={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "概要" })).toBeInTheDocument();
    expect(screen.getByText("集合").tagName).toBe("STRONG");
  });

  it("部門を形式つきで並べ、無ければその旨を出す", () => {
    const { rerender } = render(
      <PrintSummarySection
        tournament={tournament}
        divisions={[
          { id: "d1", name: "男子", order: 0, format: "SINGLE_ELIMINATION" },
        ]}
      />,
    );
    expect(
      screen.getByText("男子（シングルエリミネーション）"),
    ).toBeInTheDocument();

    rerender(<PrintSummarySection tournament={tournament} divisions={[]} />);
    expect(screen.getByText("部門がありません")).toBeInTheDocument();
  });
});
