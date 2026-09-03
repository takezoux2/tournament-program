import { describe, expect, it } from "vitest";
import { grantPermissionsSchema } from "./schema";

describe("grantPermissionsSchema", () => {
  it("既知の権限コードだけを受け取る", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "user.add"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codes).toEqual(["user.view", "user.add"]);
    }
  });

  it("チェックが 0 件でも受け取る（全権限の剥奪は正当な操作）", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("未知のコードが混ざっていたら弾く", () => {
    // 画面に無いコードを送り込んで権限を捏造されないようにする。
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "system.root"],
    });

    expect(parsed.success).toBe(false);
  });

  it("重複したコードは 1 つにまとめる", () => {
    const parsed = grantPermissionsSchema.safeParse({
      userId: "u1",
      codes: ["user.view", "user.view"],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.codes).toEqual(["user.view"]);
    }
  });
});
