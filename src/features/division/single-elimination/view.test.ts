import { describe, expect, it } from "vitest";
import type { DivisionEntries } from "@/lib/division/types";
import { buildFromSlots } from "./build";
import { toSetupView } from "./view";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  ],
};

const participants = [
  { id: "p1", name: "山田太郎" },
  { id: "p2", name: "佐藤花子" },
  { id: "p3", name: "鈴木一郎" },
];

const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "bye" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
]);

describe("toSetupView", () => {
  it("1 回戦のカードだけを返す", () => {
    const view = toSetupView(config, entries, participants);
    expect(view).toHaveLength(2);
    expect(view.map((match) => match.matchId)).toEqual(["m1-0", "m1-1"]);
  });

  it("スロットの添字は通し番号で振る", () => {
    // swap-slots が受け取る添字と一致していないと、別の人が入れ替わってしまう。
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots.map((slot) => slot.index)).toEqual([0, 1]);
    expect(view[1].slots.map((slot) => slot.index)).toEqual([2, 3]);
  });

  it("エントリー経由で参加者の氏名を引く", () => {
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots[0]).toEqual({
      index: 0,
      kind: "entry",
      label: "山田太郎",
    });
    expect(view[1].slots[1]).toEqual({
      index: 3,
      kind: "entry",
      label: "鈴木一郎",
    });
  });

  it("bye は kind: bye で返す", () => {
    const view = toSetupView(config, entries, participants);
    expect(view[0].slots[1]).toEqual({ index: 1, kind: "bye" });
  });

  it("参加者が引けないスロットは bye ではなく label が null の entry", () => {
    // 参加者一覧が古いなど、突き合わせに失敗しても画面を落とさない。
    // ただし bye と同じ形にすると、居るはずの人が不戦勝として描かれてしまう。
    const view = toSetupView(config, entries, []);
    expect(view[0].slots[0]).toEqual({ index: 0, kind: "entry", label: null });
  });

  it("組み合わせが未作成なら空配列", () => {
    expect(
      toSetupView({ version: 1, matches: [] }, entries, participants),
    ).toEqual([]);
  });
});
