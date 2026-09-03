import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { DivisionSetup } from "./DivisionSetup";

// ブラケットの組み立てまでは踏み込まないので、区画ごと差し替える。
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: () => <div>bracket</div>,
}));

const action = vi.fn(async () => ({ error: null }));

const actions = {
  addEntry: action,
  removeEntry: action,
  reorderEntry: action,
  generateMatching: action,
  swapSlots: action,
};

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

const props = {
  slug: "acme",
  tournamentId: "t1",
  participants: [],
  members: [],
  actions,
};

describe("DivisionSetup", () => {
  it("エントリーと組み合わせの区画を出す", () => {
    render(<DivisionSetup {...props} division={division()} />);

    expect(
      screen.getByRole("heading", { name: "エントリー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "組み合わせ" }),
    ).toBeInTheDocument();
  });

  it("シングルエリミネーション以外は案内だけを出す", () => {
    render(
      <DivisionSetup
        {...props}
        division={division({ format: "ROUND_ROBIN" })}
      />,
    );

    expect(
      screen.getByText(
        "「リーグ（総当たり）」のエントリー編集はまだ対応していません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "エントリー" }),
    ).not.toBeInTheDocument();
  });

  it("勝敗が記録済みなら理由を出して操作させない", () => {
    render(
      <DivisionSetup
        {...props}
        division={division({
          results: {
            version: 1,
            matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "勝敗が記録されているため、エントリーと組み合わせは変更できません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "エントリーを追加" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "組み合わせを生成" }),
    ).toBeDisabled();
  });

  it("Json が壊れていてもページを落とさない", () => {
    render(
      <DivisionSetup
        {...props}
        division={division({ entries: { version: 2 } })}
      />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
