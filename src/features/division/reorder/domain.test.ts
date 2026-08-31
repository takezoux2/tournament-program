import { describe, expect, it } from "vitest";
import { findSwapPair } from "./domain";

// order に欠番がある状態をあえて使う。削除で欠番はできるため、
// 「index で隣を選び、order の値を入れ替える」形でないと壊れる。
const divisions = [
  { id: "d1", order: 0 },
  { id: "d2", order: 3 },
  { id: "d3", order: 7 },
];

describe("findSwapPair", () => {
  it("上へ動かすとき、1 つ前の部門を相手に選ぶ", () => {
    expect(findSwapPair(divisions, "d2", "up")).toEqual({
      target: { id: "d2", order: 3 },
      neighbor: { id: "d1", order: 0 },
    });
  });

  it("下へ動かすとき、1 つ後ろの部門を相手に選ぶ", () => {
    expect(findSwapPair(divisions, "d2", "down")).toEqual({
      target: { id: "d2", order: 3 },
      neighbor: { id: "d3", order: 7 },
    });
  });

  it("先頭を上へは動かせない", () => {
    expect(findSwapPair(divisions, "d1", "up")).toBeNull();
  });

  it("末尾を下へは動かせない", () => {
    expect(findSwapPair(divisions, "d3", "down")).toBeNull();
  });

  it("一覧に無い部門は null", () => {
    expect(findSwapPair(divisions, "unknown", "up")).toBeNull();
  });

  it("1 件しかなければどちらへも動かせない", () => {
    const single = [{ id: "d1", order: 0 }];

    expect(findSwapPair(single, "d1", "up")).toBeNull();
    expect(findSwapPair(single, "d1", "down")).toBeNull();
  });

  // 入力が order 順に並んでいるとは限らない。並べ替えてから隣を決める。
  it("入力の並び順に依存しない", () => {
    const shuffled = [
      { id: "d3", order: 7 },
      { id: "d1", order: 0 },
      { id: "d2", order: 3 },
    ];

    expect(findSwapPair(shuffled, "d3", "up")).toEqual({
      target: { id: "d3", order: 7 },
      neighbor: { id: "d2", order: 3 },
    });
  });

  it("元の配列を破壊しない", () => {
    const input = [
      { id: "d3", order: 7 },
      { id: "d1", order: 0 },
    ];

    findSwapPair(input, "d3", "up");

    expect(input[0].id).toBe("d3");
  });
});
