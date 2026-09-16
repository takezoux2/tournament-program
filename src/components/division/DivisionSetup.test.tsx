import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { overallSeqKey } from "@/lib/division/overall-order";
import { DivisionSetup } from "./DivisionSetup";

// ブラケットの組み立てまでは踏み込まないので、区画ごと差し替える。
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: () => <div>bracket</div>,
}));

// 7 つとも同じ vi.fn を使い回すと、EntryList/MatchingSection への配線で
// prop を取り違えても（例: reorderAction と removeAction の入れ替え）
// 参照が同じなので検知できない。ここでは配線チェックのため別々にしている。
const actions = {
  addEntry: vi.fn(async () => ({ error: null })),
  removeEntry: vi.fn(async () => ({ error: null })),
  reorderEntry: vi.fn(async () => ({ error: null })),
  generateMatching: vi.fn(async () => ({ error: null })),
  swapSlots: vi.fn(async () => ({ error: null })),
  setMatchName: vi.fn(async () => ({ error: null })),
  setPlayerNumber: vi.fn(async () => ({ error: null })),
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
  overallSeq: new Map<string, number>(),
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
      screen.getByText("「リーグ（総当たり）」はこの画面では編集できません"),
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

  it("リーグの星取表が残っていると作り直しを促す", () => {
    // /edit は format を無条件に書き換えられるので、この状態は実在しうる。
    render(
      <DivisionSetup
        {...props}
        division={division({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "r2-0",
                bracket: "winners",
                round: 2,
                order: 0,
                matchName: "2",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e3" },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "この組み合わせはトーナメントの形ではありません。作り直してください",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("組み合わせを作り直すと、ここに試合が出ます"),
    ).toBeInTheDocument();
    // 生成ボタンは残す。押せば直る。
    expect(
      screen.getByRole("button", { name: "組み合わせを生成" }),
    ).toBeInTheDocument();
  });

  it("試合名の入力欄にはテンプレートを、隣には overallSeq で展開した名前を出す", () => {
    // {{OverallSeq}} は大会全体を見ないと決まらないので、resolveMatchNames が
    // overallSeq props から展開した結果が MatchOrderList まで届くことを確かめる。
    render(
      <DivisionSetup
        {...props}
        overallSeq={new Map([[overallSeqKey("d1", "m1-0"), 3]])}
        division={division({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1-0",
                bracket: "winners",
                round: 1,
                order: 0,
                matchName: "第{{OverallSeq}}試合",
                slots: [{ kind: "bye" }, { kind: "bye" }],
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByLabelText("1回戦 (1)の試合名")).toHaveValue(
      "第{{OverallSeq}}試合",
    );
    expect(screen.getByText("第3試合")).toBeInTheDocument();
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

  it("7 つのアクションがそれぞれ正しい子コンポーネントの prop に届く", async () => {
    // 子を実物のままにすると、reorderAction と removeAction の入れ替えのような
    // 配線ミスは「ボタンを押して呼ばれた関数を見る」形でしか検知できず、
    // 7 つの Server Action を全部押下確認するのは重い。ここだけ子を
    // スタブに差し替え、DivisionSetup が渡した prop を直接検査する。
    // vi.mock は他のテストにも効いてしまうため、resetModules + 動的 import で
    // このテストの中だけ差し替える。
    vi.resetModules();

    let entryListProps: Record<string, unknown> | undefined;
    let addEntryFormProps: Record<string, unknown> | undefined;
    let matchingSectionProps: Record<string, unknown> | undefined;
    let matchOrderListProps: Record<string, unknown> | undefined;

    vi.doMock("./EntryList", () => ({
      EntryList: (p: Record<string, unknown>) => {
        entryListProps = p;
        return <div>entry-list-stub</div>;
      },
    }));
    vi.doMock("./AddEntryForm", () => ({
      AddEntryForm: (p: Record<string, unknown>) => {
        addEntryFormProps = p;
        return <div>add-entry-form-stub</div>;
      },
    }));
    vi.doMock("./MatchingSection", () => ({
      MatchingSection: (p: Record<string, unknown>) => {
        matchingSectionProps = p;
        return <div>matching-section-stub</div>;
      },
    }));
    vi.doMock("./MatchOrderList", () => ({
      MatchOrderList: (p: Record<string, unknown>) => {
        matchOrderListProps = p;
        return <div>match-order-list-stub</div>;
      },
    }));

    try {
      const { DivisionSetup: IsolatedDivisionSetup } = await import(
        "./DivisionSetup"
      );

      render(<IsolatedDivisionSetup {...props} division={division()} />);

      // toBe で参照そのものを比較する。値の形（DivisionFormAction）は
      // 7 つとも同じなので、中身の一致比較では入れ替えを見逃してしまう。
      expect(entryListProps?.reorderAction).toBe(actions.reorderEntry);
      expect(entryListProps?.removeAction).toBe(actions.removeEntry);
      expect(entryListProps?.setPlayerNumberAction).toBe(
        actions.setPlayerNumber,
      );
      expect(addEntryFormProps?.action).toBe(actions.addEntry);
      expect(matchingSectionProps?.generateAction).toBe(
        actions.generateMatching,
      );
      expect(matchingSectionProps?.swapAction).toBe(actions.swapSlots);
      expect(matchOrderListProps).not.toHaveProperty("reorderAction");
      expect(matchOrderListProps?.setMatchNameAction).toBe(
        actions.setMatchName,
      );
      expect(entryListProps?.disabled).toBe(false);

      // 施錠状態が子まで届くことも同じ仕掛けで見る。EntryList を実物にすると
      // 行が 1 つも無い場合に何も描かれず、disabled が落ちていても気づけない。
      render(
        <IsolatedDivisionSetup
          {...props}
          division={division({
            results: {
              version: 1,
              matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
            },
          })}
        />,
      );

      expect(entryListProps?.disabled).toBe(true);
      expect(addEntryFormProps?.disabled).toBe(true);
      expect(matchingSectionProps?.disabled).toBe(true);
      // 試合名は構造を変えないため、locked でも編集できる。
      // MatchOrderList は disabled を受け取らない prop 契約なので、
      // 渡されていないこと自体がその仕様を型より外でも固定する。
      expect(matchOrderListProps?.disabled).toBeUndefined();
    } finally {
      // 後続テストは冒頭で static import した実物の DivisionSetup を使うので
      // 直接の影響はないが、モジュールレジストリを汚さないよう明示的に戻す。
      vi.doUnmock("./EntryList");
      vi.doUnmock("./AddEntryForm");
      vi.doUnmock("./MatchingSection");
      vi.doUnmock("./MatchOrderList");
      vi.resetModules();
    }
  });
});
