import { describe, expect, it } from "vitest";
import { divisionFormatSchema, divisionNameSchema } from "./schema-parts";

describe("divisionNameSchema", () => {
  it("前後の空白を落とす", () => {
    expect(divisionNameSchema.parse("  男子シングルス  ")).toBe(
      "男子シングルス",
    );
  });

  it("空白だけの入力は空扱いにして弾く", () => {
    const result = divisionNameSchema.safeParse("   ");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("部門名を入力してください");
    }
  });

  it("100文字を超える名前を弾く", () => {
    const result = divisionNameSchema.safeParse("あ".repeat(101));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "部門名は100文字以内で入力してください",
      );
    }
  });

  it("ちょうど100文字は通す", () => {
    expect(divisionNameSchema.parse("あ".repeat(100))).toHaveLength(100);
  });
});

describe("divisionFormatSchema", () => {
  it("スキーマの enum 値を通す", () => {
    expect(divisionFormatSchema.parse("SINGLE_ELIMINATION")).toBe(
      "SINGLE_ELIMINATION",
    );
    expect(divisionFormatSchema.parse("ROUND_ROBIN")).toBe("ROUND_ROBIN");
  });

  it("enum に無い値を弾く", () => {
    const result = divisionFormatSchema.safeParse("SWISS");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("試合形式を選択してください");
    }
  });

  it("未選択（空文字）も弾く", () => {
    expect(divisionFormatSchema.safeParse("").success).toBe(false);
  });
});
