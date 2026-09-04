import { describe, expect, it } from "vitest";
import { addMemberSchema } from "./schema";

describe("addMemberSchema", () => {
  it("前後の空白を落として受け付ける", () => {
    const parsed = addMemberSchema.safeParse({
      name: " 竹添 ",
      nameKana: " たけぞえ ",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ name: "竹添", nameKana: "たけぞえ" });
    }
  });

  it("氏名が空白のみならエラー", () => {
    const parsed = addMemberSchema.safeParse({
      name: "  ",
      nameKana: "たけぞえ",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe("氏名を入力してください");
    }
  });

  it("かなが空ならエラー", () => {
    const parsed = addMemberSchema.safeParse({ name: "竹添", nameKana: "" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "氏名（かな）を入力してください",
      );
    }
  });

  it("101 文字はエラー", () => {
    const parsed = addMemberSchema.safeParse({
      name: "あ".repeat(101),
      nameKana: "たけぞえ",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "氏名は100文字以内で入力してください",
      );
    }
  });
});
