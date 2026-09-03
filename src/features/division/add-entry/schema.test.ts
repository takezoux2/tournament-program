import { describe, expect, it } from "vitest";
import { addEntrySchema } from "./schema";

describe("addEntrySchema", () => {
  it("既存メンバーの選択を受け付ける", () => {
    expect(addEntrySchema.parse({ mode: "existing", memberId: "m1" })).toEqual({
      mode: "existing",
      memberId: "m1",
    });
  });

  it("既存モードでメンバー未選択なら弾く", () => {
    const result = addEntrySchema.safeParse({ mode: "existing", memberId: "" });
    expect(result.success).toBe(false);
  });

  it("新規登録の氏名とかなを前後の空白を落として受け付ける", () => {
    expect(
      addEntrySchema.parse({
        mode: "new",
        name: "  山田太郎 ",
        nameKana: " やまだたろう ",
      }),
    ).toEqual({ mode: "new", name: "山田太郎", nameKana: "やまだたろう" });
  });

  it("空白だけの氏名を弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "   ",
      nameKana: "やまだたろう",
    });
    expect(result.success).toBe(false);
  });

  it("かなが空なら弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "山田太郎",
      nameKana: "",
    });
    expect(result.success).toBe(false);
  });

  it("100 文字を超える氏名を弾く", () => {
    const result = addEntrySchema.safeParse({
      mode: "new",
      name: "あ".repeat(101),
      nameKana: "あ",
    });
    expect(result.success).toBe(false);
  });

  it("未知の mode を弾く", () => {
    expect(addEntrySchema.safeParse({ mode: "other" }).success).toBe(false);
  });
});
