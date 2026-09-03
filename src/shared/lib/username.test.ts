import { describe, expect, it } from "vitest";
import {
  MAX_USERNAME_LENGTH,
  normalizeUsername,
  USERNAME_CANDIDATE_LIMIT,
  usernameBaseFromEmail,
  usernameCandidates,
} from "./username";

/** signup の schema と同じ規則。生成物が後から編集できることを担保する。 */
const SIGNUP_USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

describe("normalizeUsername", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeUsername("  takezo  ")).toBe("takezo");
  });

  it("小文字に揃える", () => {
    expect(normalizeUsername("Takezo")).toBe("takezo");
  });

  it("空文字はそのまま空文字を返す", () => {
    expect(normalizeUsername("")).toBe("");
  });

  it("空白だけの文字列は空文字になる", () => {
    expect(normalizeUsername("   ")).toBe("");
  });
});

describe("usernameBaseFromEmail", () => {
  it("@ の前だけを使い、小文字に揃える", () => {
    expect(usernameBaseFromEmail("TakeZo@Example.com")).toBe("takezo");
  });

  it("regex が受け付けない文字はハイフンに畳む", () => {
    expect(usernameBaseFromEmail("taro.yamada+tag@example.com")).toBe(
      "taro-yamada-tag",
    );
  });

  it("連続した使えない文字はハイフン 1 つにする", () => {
    expect(usernameBaseFromEmail("taro...yamada@example.com")).toBe(
      "taro-yamada",
    );
  });

  it("前後のハイフンは落とす", () => {
    expect(usernameBaseFromEmail(".taro.@example.com")).toBe("taro");
  });

  it("ローカル部が空なら user にする", () => {
    expect(usernameBaseFromEmail("@example.com")).toBe("user");
  });

  it("@ が無くても全体をローカル部として扱う", () => {
    expect(usernameBaseFromEmail("takezo")).toBe("takezo");
  });

  it("空文字なら user にする", () => {
    expect(usernameBaseFromEmail("")).toBe("user");
  });

  it("使える文字が 1 つも無ければ user にする", () => {
    expect(usernameBaseFromEmail("日本語＋記号@example.com")).toBe("user");
  });

  it("長すぎるローカル部は上限で切る", () => {
    const base = usernameBaseFromEmail(`${"a".repeat(200)}@example.com`);

    expect(base).toHaveLength(MAX_USERNAME_LENGTH);
    expect(base).toBe("a".repeat(MAX_USERNAME_LENGTH));
  });

  it("生成した名前は signup の regex に通る", () => {
    for (const email of [
      "TakeZo@Example.com",
      "taro.yamada+tag@example.com",
      "日本語＋記号@example.com",
      "",
      "@example.com",
    ]) {
      expect(usernameBaseFromEmail(email)).toMatch(SIGNUP_USERNAME_PATTERN);
    }
  });
});

describe("usernameCandidates", () => {
  it("先頭は素そのもので、以降は 2 から始まる連番を足す", () => {
    const candidates = usernameCandidates("takezo");

    expect(candidates.slice(0, 3)).toEqual(["takezo", "takezo2", "takezo3"]);
  });

  it("上限の件数で打ち切る（無限に探し続けない）", () => {
    const candidates = usernameCandidates("takezo");

    expect(candidates).toHaveLength(USERNAME_CANDIDATE_LIMIT);
    expect(candidates.at(-1)).toBe(`takezo${USERNAME_CANDIDATE_LIMIT}`);
  });

  it("連番を足しても上限の長さを超えない", () => {
    const candidates = usernameCandidates("a".repeat(MAX_USERNAME_LENGTH));

    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
      expect(candidate).toMatch(SIGNUP_USERNAME_PATTERN);
    }
  });

  it("素が空でも空文字の候補は作らない", () => {
    expect(usernameCandidates("")[0]).toBe("user");
  });
});
