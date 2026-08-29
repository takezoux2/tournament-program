import { describe, expect, it } from "vitest";
import { createTournamentSchema } from "./schema";

const parse = (input: { name: unknown; startsAt: unknown }) =>
  createTournamentSchema.safeParse(input);

describe("createTournamentSchema", () => {
  it("妥当な入力を通し、前後の空白を落とす", () => {
    const result = parse({ name: "  春季大会  ", startsAt: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "春季大会", startsAt: null });
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
});
