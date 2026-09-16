import { describe, expect, it } from "vitest";
import { aggregateScore, formatScore } from "./score";

describe("aggregateScore", () => {
  it("合計を出す", () => {
    expect(aggregateScore([7, 6.8, 7.2], "sum")).toBeCloseTo(21, 10);
  });

  it("平均を出す", () => {
    expect(aggregateScore([7, 6, 5], "average")).toBeCloseTo(6, 10);
  });

  it("未入力（null）は数に入れない", () => {
    // 未入力を 0 として扱うと、合計も平均も嘘になる。
    expect(aggregateScore([7, null, 5], "sum")).toBeCloseTo(12, 10);
    expect(aggregateScore([7, null, 5], "average")).toBeCloseTo(6, 10);
  });

  it("全部未入力なら null", () => {
    expect(aggregateScore([null, null], "sum")).toBeNull();
    expect(aggregateScore([null, null], "average")).toBeNull();
  });

  it("空配列なら null", () => {
    expect(aggregateScore([], "sum")).toBeNull();
  });
});

describe("formatScore", () => {
  it("null はそのまま null", () => {
    expect(formatScore(null)).toBeNull();
  });

  it("末尾の不要な 0 を落とす", () => {
    expect(formatScore(21)).toBe("21");
    expect(formatScore(7.5)).toBe("7.5");
    expect(formatScore(7.0)).toBe("7");
  });

  it("小数第 2 位で四捨五入する", () => {
    expect(formatScore(20 / 3)).toBe("6.67");
    expect(formatScore(6.665)).toBe("6.67");
  });

  it("浮動小数の誤差を画面に出さない", () => {
    expect(formatScore(0.1 + 0.2)).toBe("0.3");
    expect(formatScore(aggregateScore([7, 6.8, 7.2], "sum"))).toBe("21");
  });
});
