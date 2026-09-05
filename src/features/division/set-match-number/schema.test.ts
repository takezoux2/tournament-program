import { describe, expect, it } from "vitest";
import { setMatchNumberSchema } from "./schema";

describe("setMatchNumberSchema", () => {
  it("前後の空白を除いて受け付ける", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: " 12 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.matchNumber).toBe("12");
    }
  });

  it("空白だけの試合番号は拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: "  ",
    });
    expect(parsed.success).toBe(false);
  });

  it("matchId が空なら拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "",
      matchNumber: "1",
    });
    expect(parsed.success).toBe(false);
  });

  it("21 文字以上の試合番号は拒否する", () => {
    const parsed = setMatchNumberSchema.safeParse({
      matchId: "m1-0",
      matchNumber: "a".repeat(21),
    });
    expect(parsed.success).toBe(false);
  });
});
