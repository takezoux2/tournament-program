import { describe, expect, it } from "vitest";
import { organizationNameSchema } from "./schema-parts";

describe("organizationNameSchema", () => {
  it("通常の組織名をそのまま通す", () => {
    const result = organizationNameSchema.safeParse("テニス部");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("テニス部");
    }
  });

  it("前後の空白を trim する", () => {
    const result = organizationNameSchema.safeParse("  テニス部  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("テニス部");
    }
  });

  it("空白のみの文字列を弾き、空欄と同じ文言を返す", () => {
    const result = organizationNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("組織名を入力してください");
    }
  });

  it("ちょうど100文字は通す", () => {
    const result = organizationNameSchema.safeParse("あ".repeat(100));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("あ".repeat(100));
    }
  });

  it("101文字は上限超過の文言で弾く", () => {
    const result = organizationNameSchema.safeParse("あ".repeat(101));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "組織名は100文字以内で入力してください",
      );
    }
  });

  it("空文字を弾く", () => {
    expect(organizationNameSchema.safeParse("").success).toBe(false);
  });
});
