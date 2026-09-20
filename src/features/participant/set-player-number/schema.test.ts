import { describe, expect, it } from "vitest";
import { setPlayerNumberSchema } from "./schema";

describe("setPlayerNumberSchema", () => {
  it("前後の空白を除いて受け付ける", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: " 7 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.playerNumber).toBe("7");
    }
  });

  it("空白だけの番号は拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: " ",
    });
    expect(parsed.success).toBe(false);
  });

  it("participantId が空なら拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "",
      playerNumber: "7",
    });
    expect(parsed.success).toBe(false);
  });

  it("21 文字以上の番号は拒否する", () => {
    const parsed = setPlayerNumberSchema.safeParse({
      participantId: "p1",
      playerNumber: "a".repeat(21),
    });
    expect(parsed.success).toBe(false);
  });
});
