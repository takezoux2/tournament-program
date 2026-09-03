import { describe, expect, it } from "vitest";
import { usernameAdditionalField } from "./auth-user-fields";
import {
  MAX_USERNAME_LENGTH,
  usernameBaseFromEmail,
  usernameCandidates,
} from "./username";

/** better-auth は Standard Schema の validate をそのまま呼ぶので、同じ形で叩く。 */
const validate = (value: unknown) => {
  const schema = usernameAdditionalField.validator?.input;
  if (!schema) {
    throw new Error("validator.input が宣言されていません");
  }
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new Error("非同期バリデータは better-auth が受け付けない");
  }
  return result;
};

/** 成功したときの値を取り出す。失敗していればテストを落とす。 */
const validated = (value: unknown): unknown => {
  const result = validate(value);
  if ("issues" in result && result.issues) {
    throw new Error(`検証に失敗した: ${JSON.stringify(result.issues)}`);
  }
  return result.value;
};

const rejected = (value: unknown): boolean => {
  const result = validate(value);
  return "issues" in result && result.issues !== undefined;
};

const transform = (value: unknown) => {
  const input = usernameAdditionalField.transform?.input;
  if (!input) {
    throw new Error("transform.input が宣言されていません");
  }
  return input(value as never);
};

describe("usernameAdditionalField", () => {
  it("username を必須の入力項目として宣言する", () => {
    expect(usernameAdditionalField.type).toBe("string");
    expect(usernameAdditionalField.required).toBe(true);
    expect(usernameAdditionalField.input).toBe(true);
  });
});

describe("usernameAdditionalField.transform.input", () => {
  it("小文字に正規化する", () => {
    expect(transform("TakeZo")).toBe("takezo");
  });

  it("前後の空白を落とす", () => {
    expect(transform("  takezo  ")).toBe("takezo");
  });

  it("文字列以外はそのまま通す（正規化できないため触らない）", () => {
    expect(transform(undefined)).toBeUndefined();
    expect(transform(null)).toBeNull();
  });
});

describe("usernameAdditionalField.validator.input", () => {
  it("正しい username を通す", () => {
    expect(validated("takezo_01")).toBe("takezo_01");
  });

  it("大文字混じりでも通し、小文字に正規化して返す", () => {
    // クライアントの schema を通さない直接 POST でも小文字で保存させる。
    // ここで弾くのではなく揃えるのは signup フォームと同じ扱いにするため。
    expect(validated("TakeZo")).toBe("takezo");
  });

  it("前後の空白を落として返す", () => {
    expect(validated("  takezo  ")).toBe("takezo");
  });

  it("空文字を弾く", () => {
    expect(rejected("")).toBe(true);
    expect(rejected("   ")).toBe(true);
  });

  it("使えない文字を弾く", () => {
    // LIKE のワイルドカードや空白がそのまま登録されると検索が壊れる。
    expect(rejected("take zo")).toBe(true);
    expect(rejected("take%zo")).toBe(true);
    expect(rejected("take.zo")).toBe(true);
    expect(rejected("日本語")).toBe(true);
  });

  it("上限を超える長さを弾く", () => {
    expect(rejected("a".repeat(MAX_USERNAME_LENGTH + 1))).toBe(true);
    expect(validated("a".repeat(MAX_USERNAME_LENGTH))).toBe(
      "a".repeat(MAX_USERNAME_LENGTH),
    );
  });

  it("文字列以外を弾く", () => {
    expect(rejected(42)).toBe(true);
    expect(rejected(null)).toBe(true);
    expect(rejected({})).toBe(true);
  });

  it("Google 用に生成した username はすべて通る", () => {
    // ここで弾かれると Google の初回サインインが落ちる。
    for (const email of [
      "TakeZo@Example.com",
      "taro.yamada+tag@example.com",
      "日本語＋記号@example.com",
      "@example.com",
      "",
      `${"a".repeat(200)}@example.com`,
    ]) {
      const base = usernameBaseFromEmail(email);
      for (const candidate of usernameCandidates(base)) {
        expect(validated(candidate)).toBe(candidate);
      }
    }
  });
});
