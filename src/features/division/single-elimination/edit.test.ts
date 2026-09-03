import { describe, expect, it } from "vitest";
import type { DivisionEntry, SlotSource } from "@/lib/division/types";
import { generateSlots, placeEntry, swapSlots } from "./edit";

const entries = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

const entry = (id: string): SlotSource => ({ kind: "entry", entryId: id });
const bye: SlotSource = { kind: "bye" };

describe("generateSlots", () => {
  it("2 人ならそのまま 2 スロット", () => {
    expect(generateSlots(entries(2))).toEqual([entry("e1"), entry("e2")]);
  });

  it("3 人なら 4 スロットになり bye が 1 つ入る", () => {
    const slots = generateSlots(entries(3));
    expect(slots).toHaveLength(4);
    expect(slots.filter((slot) => slot.kind === "bye")).toHaveLength(1);
  });

  it("3 人のとき bye は第 1 シードの相手側に入る", () => {
    // seedOrder(4) = [1, 4, 2, 3]。4 番が居ないので index 1 が bye になり、
    // 第 1 シード（index 0）が 1 回戦を不戦勝で抜ける。
    expect(generateSlots(entries(3))).toEqual([
      entry("e1"),
      bye,
      entry("e2"),
      entry("e3"),
    ]);
  });

  it("5 人なら 8 スロットで bye が 3 つ", () => {
    const slots = generateSlots(entries(5));
    expect(slots).toHaveLength(8);
    expect(slots.filter((slot) => slot.kind === "bye")).toHaveLength(3);
  });

  it("9 人なら 16 スロットになる", () => {
    expect(generateSlots(entries(9))).toHaveLength(16);
  });

  it("seed 昇順に並べ直してから配置する", () => {
    const shuffled: DivisionEntry[] = [
      { id: "e2", participantId: "p2", seed: 1 },
      { id: "e1", participantId: "p1", seed: 0 },
    ];
    expect(generateSlots(shuffled)).toEqual([entry("e1"), entry("e2")]);
  });

  it("2 人未満なら空配列", () => {
    expect(generateSlots(entries(0))).toEqual([]);
    expect(generateSlots(entries(1))).toEqual([]);
  });
});

describe("placeEntry", () => {
  it("一番下の bye を埋める", () => {
    const slots = [entry("a"), bye, entry("c"), bye];
    expect(placeEntry(slots, "x")).toEqual([
      entry("a"),
      bye,
      entry("c"),
      entry("x"),
    ]);
  });

  it("元の配列を書き換えない", () => {
    const slots = [entry("a"), bye];
    placeEntry(slots, "x");
    expect(slots).toEqual([entry("a"), bye]);
  });

  it("bye が無ければ 2 倍に広げて末尾に入れる", () => {
    // 既存の対戦カードは 2 回戦へ繰り上がり、新しい人だけが 1 回戦を戦う。
    expect(placeEntry([entry("a"), entry("b")], "x")).toEqual([
      entry("a"),
      bye,
      entry("b"),
      entry("x"),
    ]);
  });

  it("組み合わせが未作成なら何もしない", () => {
    expect(placeEntry([], "x")).toEqual([]);
  });
});

describe("swapSlots", () => {
  it("2 つのスロットを入れ替える", () => {
    const slots = [entry("a"), entry("b"), entry("c"), bye];
    expect(swapSlots(slots, 0, 3)).toEqual([
      bye,
      entry("b"),
      entry("c"),
      entry("a"),
    ]);
  });

  it("同じ添字なら null", () => {
    expect(swapSlots([entry("a"), entry("b")], 1, 1)).toBeNull();
  });

  it("範囲外の添字なら null", () => {
    const slots = [entry("a"), entry("b")];
    expect(swapSlots(slots, -1, 0)).toBeNull();
    expect(swapSlots(slots, 0, 2)).toBeNull();
    expect(swapSlots(slots, 0, 1.5)).toBeNull();
  });
});
