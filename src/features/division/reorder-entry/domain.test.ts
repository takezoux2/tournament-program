import { describe, expect, it } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { reorderEntries } from "./domain";

const entries: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
  { id: "e3", participantId: "p3", seed: 2 },
];

describe("reorderEntries", () => {
  it("上へ 1 つ動かす", () => {
    const result = reorderEntries(entries, "e2", "up");
    expect(result?.map((entry) => entry.id)).toEqual(["e2", "e1", "e3"]);
  });

  it("下へ 1 つ動かす", () => {
    const result = reorderEntries(entries, "e2", "down");
    expect(result?.map((entry) => entry.id)).toEqual(["e1", "e3", "e2"]);
  });

  it("seed を 0 から振り直す", () => {
    // e3(seed2) と e2(seed1) を入れ替えるため、振り直さなければ [0, 2, 1] になり
    // 期待値 [0, 1, 2] とずれる。renumbering が抜けたら確実に落ちる。
    const result = reorderEntries(entries, "e3", "up");
    expect(result?.map((entry) => entry.seed)).toEqual([0, 1, 2]);
  });

  it("元の配列を書き換えない", () => {
    reorderEntries(entries, "e2", "up");
    expect(entries.map((entry) => entry.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("先頭を上へ動かそうとしたら null", () => {
    expect(reorderEntries(entries, "e1", "up")).toBeNull();
  });

  it("末尾を下へ動かそうとしたら null", () => {
    expect(reorderEntries(entries, "e3", "down")).toBeNull();
  });

  it("知らない id なら null（up）", () => {
    expect(reorderEntries(entries, "unknown", "up")).toBeNull();
  });

  // 上のテストだけだと "知らない id" と "先頭を上へ" が同じ分岐（target < 0）で
  // 偶然どちらも null になってしまい、findIndex === -1 の判定自体は検証できない
  // （index = -1, direction "up" だと target = -2 になり境界チェックに紛れ込む）。
  // direction "down" なら index = -1 → target = 0 は配列の範囲内なので、
  // findIndex === -1 の分岐が無いと境界チェックをすり抜けて壊れた結果を返す
  // （sorted[-1] が undefined になり、後段の map が例外を投げる）。
  // そのため down 方向でも確認し、"知らない id" 判定に固有のテコを持たせる。
  it("知らない id なら null（down でも境界チェックに紛れずに判定する）", () => {
    expect(reorderEntries(entries, "unknown", "down")).toBeNull();
  });

  it("seed が飛んでいても並び順で判断する", () => {
    // 削除の詰め直しに失敗したデータが来ても、順序だけを見て動かせる。
    const sparse: DivisionEntry[] = [
      { id: "a", participantId: "p1", seed: 5 },
      { id: "b", participantId: "p2", seed: 9 },
    ];
    const result = reorderEntries(sparse, "b", "up");
    expect(result).toEqual([
      { id: "b", participantId: "p2", seed: 0 },
      { id: "a", participantId: "p1", seed: 1 },
    ]);
  });
});
