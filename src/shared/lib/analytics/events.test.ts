import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendGAEvent = vi.fn();

vi.mock("@next/third-parties/google", () => ({
  sendGAEvent: (...args: unknown[]) => sendGAEvent(...args),
}));

const { trackEvent } = await import("./events");

const original = process.env.NEXT_PUBLIC_GA_ID;

beforeEach(() => {
  sendGAEvent.mockReset();
});

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_GA_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_ID = original;
  }
});

describe("trackEvent", () => {
  it("測定 ID が無いときは何も送らない", () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    trackEvent("login", { method: "email" });

    expect(sendGAEvent).not.toHaveBeenCalled();
  });

  it("測定 ID があれば event として名前とパラメータを送る", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("login", { method: "email" });

    expect(sendGAEvent).toHaveBeenCalledWith("event", "login", {
      method: "email",
    });
  });

  it("パラメータを省略したときは空オブジェクトを渡す", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";

    trackEvent("record_result");

    expect(sendGAEvent).toHaveBeenCalledWith("event", "record_result", {});
  });
});
