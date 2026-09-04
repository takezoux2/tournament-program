import { describe, expect, it } from "vitest";
import { createTournamentSchema } from "./schema";

const parse = (input: {
  name: unknown;
  startsAt: unknown;
  description?: unknown;
}) => createTournamentSchema.safeParse({ description: "", ...input });

describe("createTournamentSchema", () => {
  it("妥当な入力を通し、前後の空白を落とす", () => {
    const result = parse({ name: "  春季大会  ", startsAt: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "春季大会",
        startsAt: null,
        description: "",
      });
    }
  });

  it("空の開始日時を null にする", () => {
    const result = parse({ name: "春季大会", startsAt: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt).toBeNull();
    }
  });

  it("datetime-local の値をローカル時刻の Date にする", () => {
    const result = parse({ name: "春季大会", startsAt: "2026-08-29T10:05" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt).toEqual(new Date(2026, 7, 29, 10, 5));
    }
  });

  it("日時として読めない値を弾く", () => {
    const result = parse({ name: "春季大会", startsAt: "きのう" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開始日時の形式が正しくありません",
      );
    }
  });

  it.each([
    // Date.parse は通すが datetime-local の出力形式ではない値。
    // 日付のみは UTC 深夜として解釈されるため、意図しない時刻になり得る。
    ["2026-08-29"],
    ["Aug 29 2026"],
    ["2026-08-29T10:05:00Z"],
    ["2026/08/29 10:05"],
  ])('datetime-local の形式でない "%s" を弾く', (startsAt) => {
    const result = parse({ name: "春季大会", startsAt });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "開始日時の形式が正しくありません",
      );
    }
  });

  it("空の大会名を弾く", () => {
    const result = parse({ name: "   ", startsAt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("大会名を入力してください");
    }
  });

  it("100 文字超の大会名を弾く", () => {
    const result = parse({ name: "あ".repeat(101), startsAt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "大会名は100文字以内で入力してください",
      );
    }
  });

  it("概要の前後の空白を落とす", () => {
    const result = parse({
      name: "春季大会",
      startsAt: "",
      description: "  # 概要  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("# 概要");
    }
  });

  it("空の概要を許容する", () => {
    const result = parse({ name: "春季大会", startsAt: "", description: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
    }
  });

  it("10000 文字超の概要を弾く", () => {
    const result = parse({
      name: "春季大会",
      startsAt: "",
      description: "あ".repeat(10001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "大会概要は10000文字以内で入力してください",
      );
    }
  });
});
