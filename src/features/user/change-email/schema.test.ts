import { describe, expect, it } from "vitest";
import { changeEmailSchema } from "./schema";

describe("changeEmailSchema", () => {
  it("妥当なメールアドレスを通し、正規化する", () => {
    const result = changeEmailSchema.safeParse({
      newEmail: "  New@Example.Test  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ newEmail: "new@example.test" });
    }
  });

  it("形式が正しくないアドレスを弾く", () => {
    const result = changeEmailSchema.safeParse({ newEmail: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "メールアドレスの形式が正しくありません",
      );
    }
  });

  it("空のアドレスを弾く", () => {
    expect(changeEmailSchema.safeParse({ newEmail: "" }).success).toBe(false);
  });
});
