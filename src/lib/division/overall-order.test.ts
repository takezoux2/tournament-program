import { describe, expect, it } from "vitest";
import {
  buildOverallSeq,
  type OverallOrderDivision,
  overallSeqKey,
} from "./overall-order";

const divisions: OverallOrderDivision[] = [
  { id: "d1", order: 0, matchIds: ["m1", "m2"] },
  { id: "d2", order: 1, matchIds: ["n1"] },
];

describe("buildOverallSeq", () => {
  it("保存された進行順のとおりに 1 から振る", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d2", matchId: "n1" },
      { divisionId: "d1", matchId: "m2" },
      { divisionId: "d1", matchId: "m1" },
    ]);

    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(3);
  });

  it("進行順が空なら部門 order → 部門内の並びで振る", () => {
    const seq = buildOverallSeq(divisions, []);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(3);
  });

  it("行を持たない試合は部門 order → 部門内の並びで末尾に足す", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d2", matchId: "n1" },
    ]);

    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(2);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(3);
  });

  it("部門 order の昇順で末尾に足す（配列の順ではない）", () => {
    const unsorted: OverallOrderDivision[] = [
      { id: "d2", order: 1, matchIds: ["n1"] },
      { id: "d1", order: 0, matchIds: ["m1"] },
    ];
    const seq = buildOverallSeq(unsorted, []);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d2", "n1"))).toBe(2);
  });

  it("実体の無い行は番号を消費しない", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d9", matchId: "x1" },
      { divisionId: "d1", matchId: "m1" },
    ]);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.has(overallSeqKey("d9", "x1"))).toBe(false);
  });

  it("同じ試合が二重に並んでいても 1 回しか数えない", () => {
    const seq = buildOverallSeq(divisions, [
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m1" },
      { divisionId: "d1", matchId: "m2" },
    ]);

    expect(seq.get(overallSeqKey("d1", "m1"))).toBe(1);
    expect(seq.get(overallSeqKey("d1", "m2"))).toBe(2);
    expect(seq.size).toBe(3);
  });

  it("全試合にちょうど 1 つずつ番号が付く", () => {
    const seq = buildOverallSeq(divisions, []);

    expect(seq.size).toBe(3);
    expect([...seq.values()].sort((l, r) => l - r)).toEqual([1, 2, 3]);
  });

  it("入力の配列を書き換えない", () => {
    const input: OverallOrderDivision[] = [
      { id: "d2", order: 1, matchIds: ["n1"] },
      { id: "d1", order: 0, matchIds: ["m1"] },
    ];
    buildOverallSeq(input, []);

    expect(input.map((division) => division.id)).toEqual(["d2", "d1"]);
  });
});
