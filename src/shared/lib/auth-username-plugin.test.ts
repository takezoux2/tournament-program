import { describe, expect, it } from "vitest";
import { usernameAdditionalField } from "./auth-user-fields";
import { usernamePlugin } from "./auth-username-plugin";
import { MAX_USERNAME_LENGTH, MIN_USERNAME_LENGTH } from "./username";

describe("usernamePlugin", () => {
  it("ユーザー名でのサインインの口を持つ", () => {
    expect(usernamePlugin.endpoints.signInUsername).toBeDefined();
  });

  it("displayUsername の列は生やさない", () => {
    // User テーブルに displayUsername は無い。生えるとアダプタが
    // 存在しない列へ書きに行く。
    expect(usernamePlugin.schema.user.fields).not.toHaveProperty(
      "displayUsername",
    );
  });

  it("username の宣言は auth-user-fields.ts のものを保つ", () => {
    // db/schema.mjs の getFields は user.additionalFields の後に
    // プラグインのフィールドを spread するため、包み直さないと
    // required と validator が静かに外れる。
    const field = usernamePlugin.schema.user.fields.username;
    expect(field.required).toBe(true);
    expect(field.validator).toBe(usernameAdditionalField.validator);
    expect(field.transform).toBe(usernameAdditionalField.transform);
  });

  it("プラグイン自身の一意制約は残す", () => {
    // サインイン時の username 検索と重複チェックがこれに乗る。
    expect(usernamePlugin.schema.user.fields.username.unique).toBe(true);
  });

  it("長さの規則を username.ts の定数から取る", () => {
    expect(usernamePlugin.options?.minUsernameLength).toBe(MIN_USERNAME_LENGTH);
    expect(usernamePlugin.options?.maxUsernameLength).toBe(MAX_USERNAME_LENGTH);
  });

  it("文字種の規則を usernameSchema に揃える", async () => {
    const validate = usernamePlugin.options?.usernameValidator;
    expect(validate).toBeDefined();
    if (!validate) return;
    // 既定の validator は "." を許し "-" を許さない。逆になっていることを見る。
    expect(await validate("take-zoux_2")).toBe(true);
    expect(await validate("take.zoux")).toBe(false);
    expect(await validate("たけぞう")).toBe(false);
  });
});
