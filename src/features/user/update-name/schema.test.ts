import { describe, expect, it } from "vitest";
import { updateNameSchema } from "./schema";

describe("updateNameSchema", () => {
  it("妥当な名前を通し、前後の空白を落とす", () => {
    const result = updateNameSchema.safeParse({ name: "  竹添太郎  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "竹添太郎" });
    }
  });

  it("空の名前を弾く", () => {
    const result = updateNameSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });

  it("email や username を渡しても落とす（この経路では変えられない）", () => {
    const result = updateNameSchema.safeParse({
      name: "竹添太郎",
      email: "evil@example.test",
      username: "evil",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "竹添太郎" });
    }
  });
});
