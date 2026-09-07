import { describe, expect, it } from "vitest";
import { usernameAdditionalField } from "./auth-user-fields";
import { usernamePlugin } from "./auth-username-plugin";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  usernameBaseFromEmail,
  usernameCandidates,
} from "./username";

describe("usernamePlugin", () => {
  it("ユーザー名でのサインインの口を持つ", () => {
    expect(usernamePlugin.endpoints.signInUsername).toBeDefined();
  });

  it("ユーザー名の空き確認の口は生やさない", () => {
    // /is-username-available は未認証でユーザー名の存在有無を返す。
    // アカウント列挙の口になるため、このアプリでは落とす。
    expect(usernamePlugin.endpoints).not.toHaveProperty(
      "isUsernameAvailable",
    );
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

  it("Google サインインで生成した username 候補はプラグインの規則を必ず通る", async () => {
    // databaseHooks.user.create.before は /sign-up/email と /update-user 以外の
    // 全経路（Google の OAuth コールバックを含む）で username を検証する。
    // ここで弾かれる候補が 1 つでもあると、新規 Google ユーザーは
    // サインインの入口にすら立てずロックアウトされる。
    const validate = usernamePlugin.options?.usernameValidator;
    expect(validate).toBeDefined();
    if (!validate) return;

    const emails = [
      // ローカル部が使える文字を 1 つも含まない → FALLBACK_USERNAME_BASE
      "!!!@example.com",
      // ローカル部が空 → 同じく FALLBACK_USERNAME_BASE
      "@example.com",
      // MAX_USERNAME_LENGTH（50）を超える → base の時点で切り詰め
      `${"a".repeat(80)}@example.com`,
      // 素直な短いローカル部
      "take.zoux-2@example.com",
    ];

    const bases = emails.map((email) => usernameBaseFromEmail(email));
    const fixedSuffix = () => "abc123";
    const candidateLists = bases.flatMap((base) => [
      usernameCandidates(base), // 実運用のランダム接尾辞
      usernameCandidates(base, fixedSuffix), // 決定的な接尾辞での再確認
    ]);

    for (const candidates of candidateLists) {
      // 素そのもの・連番接尾辞（2〜20）・ランダム接尾辞のすべてを含む。
      expect(candidates.length).toBe(1 + 19 + 10);
      for (const candidate of candidates) {
        expect(await validate(candidate)).toBe(true);
        expect(candidate.length).toBeGreaterThanOrEqual(MIN_USERNAME_LENGTH);
        expect(candidate.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
      }
    }
  });
});
