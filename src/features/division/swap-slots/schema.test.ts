import { describe, expect, it } from "vitest";
import { swapSlotsSchema } from "./schema";

describe("swapSlotsSchema", () => {
  it("フォームの文字列を数値に直す", () => {
    // FormData から来る値は必ず文字列なので、ここで数値へ寄せる。
    const parsed = swapSlotsSchema.parse({ indexA: "0", indexB: "3" });
    expect(parsed).toEqual({ indexA: 0, indexB: 3 });
  });

  it("負の数を弾く", () => {
    expect(
      swapSlotsSchema.safeParse({ indexA: "-1", indexB: "0" }).success,
    ).toBe(false);
  });

  it("整数でない値を弾く", () => {
    expect(
      swapSlotsSchema.safeParse({ indexA: "1.5", indexB: "0" }).success,
    ).toBe(false);
  });

  it("数値にならない値を弾く", () => {
    expect(
      swapSlotsSchema.safeParse({ indexA: "", indexB: "abc" }).success,
    ).toBe(false);
  });
});
