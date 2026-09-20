import { describe, expect, it } from "vitest";
import { nextPlayerNumber } from "./player-number";

describe("nextPlayerNumber", () => {
  it("1 件も無ければ 1 を返す", () => {
    expect(nextPlayerNumber([])).toBe("1");
  });

  it("10 進整数として読める番号の最大値 + 1 を返す", () => {
    // 文字列比較だと "9" が最大になってしまう。数値として読むことを確かめる。
    expect(nextPlayerNumber(["1", "2", "9", "10"])).toBe("11");
  });

  it("10 進として読めない番号は最大値の計算から外す", () => {
    expect(nextPlayerNumber(["A-1", "3", "第2"])).toBe("4");
  });

  it("読める番号が 1 つも無ければ 1 を返す", () => {
    expect(nextPlayerNumber(["A-1", "B-2"])).toBe("1");
  });

  it("負の数や小数の表記は読める番号として扱わない", () => {
    expect(nextPlayerNumber(["-5", "1.5", "2"])).toBe("3");
  });
});
