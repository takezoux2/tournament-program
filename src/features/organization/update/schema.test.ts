import { describe, expect, it } from "vitest";
import { updateOrganizationSchema } from "./schema";

describe("updateOrganizationSchema", () => {
  it("妥当な組織名を通し、前後の空白を落とす", () => {
    const result = updateOrganizationSchema.safeParse({ name: "  卓球部  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "卓球部" });
    }
  });

  it("空の組織名を弾く", () => {
    const result = updateOrganizationSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("組織名を入力してください");
    }
  });

  it("100 文字超の組織名を弾く", () => {
    const result = updateOrganizationSchema.safeParse({
      name: "あ".repeat(101),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織名は100文字以内で入力してください",
      );
    }
  });

  it("slug は受け付けない（編集できないため）", () => {
    const result = updateOrganizationSchema.safeParse({
      name: "卓球部",
      slug: "table-tennis",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("slug");
    }
  });
});
