import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { DivisionDetailView } from "./DivisionDetail";

const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: [] },
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const props = { slug: "acme", tournamentId: "t1" };

describe("DivisionDetailView", () => {
  it("トーナメントは /setup へ送る", () => {
    render(<DivisionDetailView {...props} division={division()} />);

    expect(
      screen.getByRole("link", { name: "エントリー・組み合わせ" }),
    ).toHaveAttribute("href", "/orgs/acme/tournaments/t1/divisions/d1/setup");
  });

  it("リーグは /league へ送る", () => {
    render(
      <DivisionDetailView
        {...props}
        division={division({ format: "ROUND_ROBIN" })}
      />,
    );

    expect(
      screen.getByRole("link", { name: "エントリー・対戦表" }),
    ).toHaveAttribute("href", "/orgs/acme/tournaments/t1/divisions/d1/league");
  });

  it("編集画面の無い形式ではボタンを出さない", () => {
    render(
      <DivisionDetailView
        {...props}
        division={division({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /エントリー/ }),
    ).not.toBeInTheDocument();
    // 部門の編集は形式に関わらず開ける。
    expect(
      screen.getByRole("link", { name: "部門を編集" }),
    ).toBeInTheDocument();
  });
});
