import { afterEach, describe, expect, it } from "vitest";
import { gaMeasurementId } from "./ga-id";

const original = process.env.NEXT_PUBLIC_GA_ID;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_GA_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_ID = original;
  }
});

describe("gaMeasurementId", () => {
  it("未設定なら null を返す", () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    expect(gaMeasurementId()).toBeNull();
  });

  it("空文字なら null を返す", () => {
    // .env に NEXT_PUBLIC_GA_ID="" と書かれた状態。設定漏れと同じ扱いにする。
    process.env.NEXT_PUBLIC_GA_ID = "";

    expect(gaMeasurementId()).toBeNull();
  });

  it("値があればその文字列を返す", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    expect(gaMeasurementId()).toBe("G-ABC123XYZ");
  });
});
