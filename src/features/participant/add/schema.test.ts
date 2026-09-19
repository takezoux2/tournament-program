import { describe, expect, it } from "vitest";
import { addParticipantSchema } from "./schema";

describe("addParticipantSchema", () => {
  it("既存メンバーの選択は memberId だけを要求する", () => {
    const result = addParticipantSchema.safeParse({
      mode: "existing",
      memberId: "m1",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(true);
  });

  it("既存メンバーの選択で memberId が空なら弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "existing",
      memberId: "",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("メンバーを選択してください");
  });

  it("新規登録は氏名とかなを要求し、前後の空白を落とす", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "  竹添  ",
      nameKana: " たけぞえ ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      mode: "new",
      name: "竹添",
      nameKana: "たけぞえ",
    });
  });

  it("空白だけの氏名は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "   ",
      nameKana: "たけぞえ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("氏名を入力してください");
  });

  it("100 文字を超える氏名は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "new",
      memberId: "",
      name: "あ".repeat(101),
      nameKana: "たけぞえ",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "氏名は100文字以内で入力してください",
    );
  });

  it("知らない mode は弾く", () => {
    const result = addParticipantSchema.safeParse({
      mode: "bogus",
      memberId: "m1",
      name: "",
      nameKana: "",
    });

    expect(result.success).toBe(false);
  });
});
