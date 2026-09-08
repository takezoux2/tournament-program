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

    expect(queued()).toContainEqual([
      "event",
      "login",
      expect.objectContaining({ method: "email" }),
    ]);
  });

  it("パラメータを省略したときは空オブジェクトを渡す", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("record_result");

    expect(queued()).toContainEqual([
      "event",
      "record_result",
      expect.objectContaining({}),
    ]);
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
      expect.objectContaining({ send_page_view: false }),
    ]);
  });

  it("dataLayer に積むのは配列ではなく arguments オブジェクト", () => {
    // gtag.js は要素を arguments として読むため、素の配列を積むと
    // 黙って無視され、collect が 1 件も飛ばなくなる（実測で確認済み）。
    // ここを配列に「単純化」してもテストが全部緑のままだと、
    // 本番の計測だけが静かに止まる。
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });

    const entries = window.dataLayer ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Array.isArray(entry)).toBe(false);
      expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
    }
  });

  it("イベントには必ずサニタイズ済みの page_location が載る", () => {
    // gtag は page_location 未指定のヒットに document.location.href を
    // 自分で載せる。page_view だけに載せていたときは、login や
    // record_result が ?token=... 付きの生 URL を送っていた（実測）。
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("record_result");

    const event = queued().find(
      (e) => e[0] === "event" && e[1] === "record_result",
    );
    const params = event?.[2] as Record<string, unknown>;
    expect(params.page_location).toBe(
      `${window.location.origin}${window.location.pathname}`,
    );
  });

  it("config は複数イベントを送っても 1 回だけ", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });
    trackEvent("record_result");

    expect(queued().filter((e) => e[0] === "config")).toHaveLength(1);
  });
});
