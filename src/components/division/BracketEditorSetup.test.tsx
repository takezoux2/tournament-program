import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { buildFromFirstRound } from "@/features/division/single-elimination/build";

const bracketProps = vi.fn();
vi.mock("./DivisionBracket", () => ({
  DivisionBracket: (props: unknown) => {
    bracketProps(props);
    return <div>bracket</div>;
  },
}));

const { BracketEditorSetup } = await import("./BracketEditorSetup");

const action = vi.fn(async () => ({ error: null }));
const actions = {
  addFirstRoundMatch: action,
  removeFirstRoundMatch: action,
  assignSlot: action,
  clearSlot: action,
  generateMatching: action,
  setMatchName: action,
};

const e = (id: string) => ({ kind: "entry" as const, entryId: id });
const division = (overrides: Partial<DivisionDetail> = {}): DivisionDetail => ({
  id: "d1",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION" as const,
  entries: { version: 1, entries: [{ id: "a", participantId: "p1", seed: 0 }] },
  matchingConfig: buildFromFirstRound([[e("a"), { kind: "bye" }]]),
  results: { version: 1, matches: [] },
  resultConfig: null,
  createdAt: new Date(),
  ...overrides,
});

const participants = [
  {
    id: "p1",
    memberId: "m1",
    name: "佐藤",
    nameKana: "さとう",
    playerNumber: "1",
  },
];
const members = [
  { id: "m1", name: "佐藤", nameKana: "さとう" },
  { id: "m2", name: "鈴木", nameKana: "すずき" },
];

const renderSetup = (d = division()) =>
  render(
    <BracketEditorSetup
      division={d}
      participants={participants}
      members={members}
      slug="acme"
      tournamentId="t1"
      overallSeq={new Map()}
      actions={actions}
    />,
  );

beforeEach(() => bracketProps.mockClear());

describe("BracketEditorSetup", () => {
  it("プレビューと試合名の 2 区画だけを出す", () => {
    renderSetup();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["プレビュー", "試合名"]);
  });

  it("配置済みのメンバーを除いて editor に渡す", () => {
    renderSetup();
    const props = bracketProps.mock.calls[0][0] as {
      editor: { members: { id: string }[]; locked: boolean };
    };
    expect(props.editor.members.map((m) => m.id)).toEqual(["m2"]);
    expect(props.editor.locked).toBe(false);
  });

  it("結果があれば試合の追加を押せず、editor も locked", () => {
    renderSetup(
      division({
        results: {
          version: 1,
          matches: [{ matchId: "m1-0", winnerEntryId: "a" }],
        },
      }),
    );
    expect(screen.getByRole("button", { name: "試合を追加" })).toBeDisabled();
    const props = bracketProps.mock.calls[0][0] as {
      editor: { locked: boolean };
    };
    expect(props.editor.locked).toBe(true);
    expect(
      screen.getByText(
        "勝敗が記録されているため、エントリーと組み合わせは変更できません",
      ),
    ).toBeInTheDocument();
  });

  it("エントリーはあるが組み合わせが無ければ、生成ボタンを出してブラケットは出さない", () => {
    renderSetup(division({ matchingConfig: { version: 1, matches: [] } }));
    expect(
      screen.getByRole("button", { name: "組み合わせを生成" }),
    ).toBeInTheDocument();
    expect(bracketProps).not.toHaveBeenCalled();
  });

  it("何も無ければ「試合を追加」だけで始められる", () => {
    renderSetup(
      division({
        entries: { version: 1, entries: [] },
        matchingConfig: { version: 1, matches: [] },
      }),
    );
    expect(screen.getByRole("button", { name: "試合を追加" })).toBeEnabled();
  });
});
