import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentDetailView } from "./TournamentDetail";

const tournament = {
  id: "t1",
  name: "春季大会",
  startsAt: new Date(2026, 7, 29, 10, 5),
  status: "DRAFT" as const,
  createdAt: new Date(2026, 7, 1, 9, 0),
};

describe("TournamentDetailView", () => {
  it("大会名とステータスの日本語表記を表示する", () => {
    render(<TournamentDetailView slug="tennis" tournament={tournament} />);

    expect(
      screen.getByRole("heading", { name: "春季大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("準備中")).toBeInTheDocument();
  });

  it.each([
    ["IN_PROGRESS", "進行中"],
    ["COMPLETED", "完了"],
  ] as const)("ステータスが %s なら「%s」と表示する", (status, label) => {
    // DRAFT だけで検証していると、IN_PROGRESS と COMPLETED の文言を
    // 入れ替えても他のテストは全部通ってしまう。
    render(
      <TournamentDetailView
        slug="tennis"
        tournament={{ ...tournament, status }}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("開始日時が未設定なら「未設定」と出す", () => {
    render(
      <TournamentDetailView
        slug="tennis"
        tournament={{ ...tournament, startsAt: null }}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("編集ページへのリンクを持つ", () => {
    render(<TournamentDetailView slug="tennis" tournament={tournament} />);

    expect(screen.getByRole("link", { name: "大会を編集" })).toHaveAttribute(
      "href",
      "/orgs/tennis/tournaments/t1/edit",
    );
  });
});
