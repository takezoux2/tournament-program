import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./events";

const original = process.env.NEXT_PUBLIC_GA_ID;

beforeEach(() => {
  window.gtag = vi.fn();
});

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_GA_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_ID = original;
  }
  // @ts-expect-error テスト後始末のため型を無視して消す
  delete window.gtag;
});

describe("trackEvent", () => {
  it("測定 ID が無いときは何も送らない", () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    trackEvent("login", { method: "email" });

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("測定 ID があれば event として名前とパラメータを送る", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });

    expect(window.gtag).toHaveBeenCalledWith("event", "login", {
      method: "email",
    });
  });

  it("パラメータを省略したときは空オブジェクトを渡す", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("record_result");

    expect(window.gtag).toHaveBeenCalledWith("event", "record_result", {});
  });
});
