import { describe, expect, it } from "vitest";
import { greetingNameOf } from "./greeting";

describe("greetingNameOf", () => {
  it("名前があればそれを使う", () => {
    expect(greetingNameOf({ email: "user@example.com", name: "竹添" })).toBe("竹添");
  });

  it("名前の前後の空白を落とす", () => {
    expect(greetingNameOf({ email: "user@example.com", name: " 竹添 " })).toBe("竹添");
  });

  it("名前が空白のみならメールアドレスを使う", () => {
    // User.name は NOT NULL なので、実運用で到達しうる欠損の形は空文字。
    // ?? ではなく || で判定していないと「 様」になる。
    expect(greetingNameOf({ email: "user@example.com", name: "   " })).toBe(
      "user@example.com",
    );
  });

  it("名前が無ければメールアドレスを使う", () => {
    expect(greetingNameOf({ email: "user@example.com" })).toBe("user@example.com");
  });
});
