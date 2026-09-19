import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "./redact";

describe("redact", () => {
  it("password を落とす", () => {
    expect(redact({ name: "山田", password: "hunter2" })).toEqual({
      name: "山田",
      password: REDACTED,
    });
  });

  it("キー名の部分一致で落とす", () => {
    expect(
      redact({
        currentPassword: "a",
        newPassword: "b",
        emailVerificationToken: "c",
        clientSecret: "d",
      }),
    ).toEqual({
      currentPassword: REDACTED,
      newPassword: REDACTED,
      emailVerificationToken: REDACTED,
      clientSecret: REDACTED,
    });
  });

  it("大文字小文字を問わない", () => {
    expect(redact({ Password: "a", TOKEN: "b" })).toEqual({
      Password: REDACTED,
      TOKEN: REDACTED,
    });
  });

  it("ネストしたオブジェクトも辿る", () => {
    expect(redact({ user: { name: "山田", email: "a@example.com" } })).toEqual({
      user: { name: "山田", email: REDACTED },
    });
  });

  it("配列の中も辿る", () => {
    expect(redact([{ token: "a" }, { token: "b" }])).toEqual([
      { token: REDACTED },
      { token: REDACTED },
    ]);
  });

  it("機微でないキーはそのまま残す", () => {
    expect(redact({ matchId: "m1", winnerEntryId: "e1" })).toEqual({
      matchId: "m1",
      winnerEntryId: "e1",
    });
  });

  it("Date は分解せずそのまま通す", () => {
    const startsAt = new Date(2026, 7, 29, 10, 5);
    expect(redact({ startsAt })).toEqual({ startsAt });
  });

  it("null とプリミティブはそのまま返す", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
  });

  it("循環参照でスタックを溢れさせない", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;
    expect(redact(node)).toEqual({ name: "root", self: "[circular]" });
  });

  it("元のオブジェクトを書き換えない", () => {
    const input = { password: "hunter2" };
    redact(input);
    expect(input.password).toBe("hunter2");
  });
});
