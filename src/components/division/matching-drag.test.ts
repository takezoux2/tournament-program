import { describe, expect, it } from "vitest";
import { resolveDragSwap, slotDomId } from "./matching-drag";

describe("slotDomId", () => {
  it("添字から一意な id を作る", () => {
    expect(slotDomId(0)).toBe("slot-0");
    expect(slotDomId(12)).toBe("slot-12");
  });
});

describe("resolveDragSwap", () => {
  it("2 つの id から添字の組を返す", () => {
    expect(resolveDragSwap("slot-0", "slot-3")).toEqual([0, 3]);
  });

  it("ドロップ先が無ければ null", () => {
    expect(resolveDragSwap("slot-0", null)).toBeNull();
  });

  it("同じスロットへ落としたら null", () => {
    expect(resolveDragSwap("slot-2", "slot-2")).toBeNull();
  });

  it("スロット以外の id なら null", () => {
    expect(resolveDragSwap("slot-0", "trash")).toBeNull();
    expect(resolveDragSwap("card-1", "slot-0")).toBeNull();
  });

  it("添字が整数でない id なら null", () => {
    // Number.isInteger で弾いている箇所。parseInt に変えると
    // "slot-1x" や "slot-1.5" が 1 として通ってしまい、
    // 誤ったスロットを入れ替えかねない。
    expect(resolveDragSwap("slot-1x", "slot-0")).toBeNull();
    expect(resolveDragSwap("slot-0", "slot-1x")).toBeNull();
    expect(resolveDragSwap("slot-1.5", "slot-0")).toBeNull();
  });
});
