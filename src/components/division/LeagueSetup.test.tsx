import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { LeagueSetup } from "./LeagueSetup";

// 6 つとも別の vi.fn にする。同じ参照を使い回すと、配線で prop を
// 取り違えても（例: reorderEntry と removeEntry の入れ替え）検知できない。
const actions = {
  addEntry: vi.fn(async () => ({ error: null })),
  removeEntry: vi.fn(async () => ({ error: null })),
  reorderEntry: vi.fn(async () => ({ error: null })),
  generateMatching: vi.fn(async () => ({ error: null })),
  setMatchNumber: vi.fn(async () => ({ error: null })),
  setPlayerNumber: vi.fn(async () => ({ error: null })),
};

const leagueMatching = {
  version: 1,
  matches: [
    {
      id: "r1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
  ],
};

const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "総当たりリーグ",
  order: 0,
  format: "ROUND_ROBIN",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: leagueMatching,
  results: { version: 1, matches: [] },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const props = {
  slug: "acme",
  tournamentId: "t1",
  participants: [
    { id: "p1", name: "山田", nameKana: "やまだ", playerNumber: "1" },
    { id: "p2", name: "佐藤", nameKana: "さとう", playerNumber: "2" },
  ],
  members: [],
  actions,
};

describe("LeagueSetup", () => {
  it("エントリー・対戦表・節ごとの試合の 3 区画を出す", () => {
    render(<LeagueSetup {...props} division={division()} />);

    expect(
      screen.getByRole("heading", { name: "エントリー" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "対戦表" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "節ごとの試合" }),
    ).toBeInTheDocument();
  });

  it("リーグ以外の形式は案内だけを出す", () => {
    render(
      <LeagueSetup
        {...props}
        division={division({ format: "SINGLE_ELIMINATION" })}
      />,
    );

    expect(
      screen.getByText(
        "「シングルエリミネーション」はこの画面では編集できません",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "エントリー" }),
    ).not.toBeInTheDocument();
  });

  it("勝敗が記録されていると編集ロックの案内を出す", () => {
    render(
      <LeagueSetup
        {...props}
        division={division({
          results: {
            version: 1,
            matches: [{ matchId: "r1-0", winnerEntryId: "e1" }],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "勝敗が記録されているため、エントリーと対戦表は変更できません",
      ),
    ).toBeInTheDocument();
  });

  it("トーナメントの木が残っていると作り直しを促す", () => {
    // /edit は format を無条件に書き換えられるので、この状態は実在しうる。
    render(
      <LeagueSetup
        {...props}
        division={division({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m2-0",
                bracket: "winners",
                round: 2,
                order: 0,
                matchNumber: "3",
                slots: [
                  { kind: "winnerOf", matchId: "m1-0" },
                  { kind: "winnerOf", matchId: "m1-1" },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "この対戦表はリーグの形ではありません。作り直してください",
      ),
    ).toBeInTheDocument();
    // 生成ボタンは残す。押せば直る。
    expect(
      screen.getByRole("button", { name: "対戦表を生成" }),
    ).toBeInTheDocument();
  });

  it("Json が壊れていてもページを落とさない", () => {
    render(
      <LeagueSetup {...props} division={division({ entries: "壊れた値" })} />,
    );

    expect(
      screen.getByText("部門のデータを読み込めませんでした"),
    ).toBeInTheDocument();
  });
});
