import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicTournament } from "@/features/tournament/repository";
import { PublicTournamentSummary } from "./PublicTournamentSummary";

const buildTournament = (
  overrides: Partial<PublicTournament> = {},
): PublicTournament => ({
  id: "t1",
  name: "春季大会",
  startsAt: new Date("2026-09-12T09:00:00+09:00"),
  status: "IN_PROGRESS",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  description: "",
  organizationId: "o1",
  organizationName: "テニス部",
  ...overrides,
});

describe("PublicTournamentSummary", () => {
  it("大会名を見出しにする", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "春季大会" }),
    ).toBeInTheDocument();
  });

  it("主催組織名とステータスの日本語ラベルを出す", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.getByText("テニス部")).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("開始日時を整形して出す", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    // vitest.config.mts で TZ=Asia/Tokyo に固定してあるため、表示は JST。
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("開始日時が未設定なら「未設定」と出す", () => {
    render(
      <PublicTournamentSummary
        tournament={buildTournament({ startsAt: null })}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("説明が空文字なら概要の節ごと出さない", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.queryByText("概要")).not.toBeInTheDocument();
  });

  it("説明があれば Markdown として描く", () => {
    render(
      <PublicTournamentSummary
        tournament={buildTournament({ description: "## 会場\n体育館" })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "会場" }),
    ).toBeInTheDocument();
    expect(screen.getByText("体育館")).toBeInTheDocument();
  });

  it("作成日時は出さない", () => {
    render(<PublicTournamentSummary tournament={buildTournament()} />);

    expect(screen.queryByText("作成日時")).not.toBeInTheDocument();
  });
});
