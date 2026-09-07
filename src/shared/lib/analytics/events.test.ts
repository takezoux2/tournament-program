import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trackEvent } from "./events";
import { resetGtagForTest } from "./gtag";

const original = process.env.NEXT_PUBLIC_GA_ID;

/**
 * dataLayer に積まれた arguments を、比べやすい配列に均す。
 * 本物の gtag.js と同じく arguments オブジェクトを積んでいるため、
 * そのままでは toEqual で比較できない。
 */
const queued = (): unknown[][] =>
  (window.dataLayer ?? []).map((entry) =>
    Array.from(entry as ArrayLike<unknown>),
  );

beforeEach(() => {
  window.dataLayer = [];
  // config 済みフラグはモジュールに残るので、テストごとに戻す。
  resetGtagForTest();
});

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_GA_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_ID = original;
  }
  window.dataLayer = undefined;
});

describe("trackEvent", () => {
  it("測定 ID が無いときは dataLayer に一切触らない", () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    trackEvent("login", { method: "email" });

    expect(queued()).toEqual([]);
  });

  it("測定 ID があれば event として名前とパラメータを送る", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });

    expect(queued()).toContainEqual(["event", "login", { method: "email" }]);
  });

  it("パラメータを省略したときは空オブジェクトを渡す", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("record_result");

    expect(queued()).toContainEqual(["event", "record_result", {}]);
  });

  it("イベントより前に必ず config が並ぶ", () => {
    // gtag.js は dataLayer を順に処理する。config より前に積まれた
    // event は宛先が決まっておらず捨てられるため、順序が意味を持つ。
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });

    const entries = queued();
    const configAt = entries.findIndex((e) => e[0] === "config");
    const eventAt = entries.findIndex((e) => e[0] === "event");

    expect(configAt).toBeGreaterThanOrEqual(0);
    expect(configAt).toBeLessThan(eventAt);
    expect(entries[configAt]).toEqual([
      "config",
      "G-ABC123XYZ",
      { send_page_view: false },
    ]);
  });

  it("config は複数イベントを送っても 1 回だけ", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });
    trackEvent("record_result");

    expect(queued().filter((e) => e[0] === "config")).toHaveLength(1);
  });
});
