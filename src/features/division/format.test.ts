import { describe, expect, it } from "vitest";
import { DivisionFormat } from "@/generated/prisma/enums";
import {
  DIVISION_FORMAT_LABELS,
  DIVISION_FORMATS,
  needsParticipants,
} from "./format";

describe("DIVISION_FORMAT_LABELS", () => {
  it("DivisionFormat のすべての値に日本語ラベルを持つ", () => {
    for (const format of Object.values(DivisionFormat)) {
      expect(DIVISION_FORMAT_LABELS[format]).toBeTruthy();
    }
  });

  it("DIVISION_FORMATS はスキーマの enum と同じ集合を返す", () => {
    expect([...DIVISION_FORMATS].sort()).toEqual(
      Object.values(DivisionFormat).sort(),
    );
  });

  it("DIVISION_FORMATS の並び順はスキーマの宣言順そのもの", () => {
    // ソートせず順序まで固定する。ここを手書きの配列に戻したり、
    // アルファベット順などに並べ替えたりする変更を検出するため、
    // 期待値はスキーマの宣言順を書き写した固定値にする(実装からの逆算にしない)。
    expect(DIVISION_FORMATS).toEqual(["SINGLE_ELIMINATION", "ROUND_ROBIN"]);
  });
});

describe("needsParticipants", () => {
  it("参加者一覧が要るのはブラケットと結果表を描く全形式", () => {
    expect(needsParticipants("SINGLE_ELIMINATION")).toBe(true);
    expect(needsParticipants("ROUND_ROBIN")).toBe(true);
  });
});
