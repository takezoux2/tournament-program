import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentList } from "./TournamentList";

describe("TournamentList", () => {
  it("大会名を詳細ページへのリンクとして表示する", () => {
    render(
      <TournamentList
        slug="tennis"
        tournaments={[
          {
            id: "t1",
            name: "春季大会",
            startsAt: new Date(2026, 7, 29, 10, 0),
            status: "DRAFT",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "春季大会" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1",
    );
    expect(screen.getByText("準備中")).toBeInTheDocument();
  });

  it("開始日が未設定の大会にも「未設定」と出す", () => {
    render(
      <TournamentList
        slug="tennis"
        tournaments={[
          { id: "t1", name: "春季大会", startsAt: null, status: "DRAFT" },
        ]}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("大会が無いときは空であることを伝える", () => {
    render(<TournamentList slug="tennis" tournaments={[]} />);

    expect(screen.getByText("まだ大会がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
