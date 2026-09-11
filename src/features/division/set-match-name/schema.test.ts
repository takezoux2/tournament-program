import { describe, expect, it } from "vitest";
import { setMatchNameSchema } from "./schema";

describe("setMatchNameSchema", () => {
  it("前後の空白を除いて受け付ける", () => {
    const parsed = setMatchNameSchema.safeParse({
      matchId: "m1-0",
      matchName: " 12 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.matchName).toBe("12");
    }
  });

  it("空白だけの試合名は拒否する", () => {
    const parsed = setMatchNameSchema.safeParse({
      matchId: "m1-0",
      matchName: "  ",
    });
    expect(parsed.success).toBe(false);
  });

  it("matchId が空なら拒否する", () => {
    const parsed = setMatchNameSchema.safeParse({
      matchId: "",
      matchName: "1",
    });
    expect(parsed.success).toBe(false);
  });

  it("21 文字以上の試合名は拒否する", () => {
    const parsed = setMatchNameSchema.safeParse({
      matchId: "m1-0",
      matchName: "a".repeat(21),
    });
    expect(parsed.success).toBe(false);
  });
});
