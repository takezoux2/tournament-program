import { describe, expect, it, vi } from "vitest";
import {
  MAX_USERNAME_LENGTH,
  normalizeUsername,
  randomBase36Suffix,
  USERNAME_NUMBERED_CANDIDATE_LIMIT,
  USERNAME_RANDOM_CANDIDATE_LIMIT,
  USERNAME_RANDOM_SUFFIX_LENGTH,
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

/** 乱数を注入して候補列を決定的にする。 */
const countingSuffix = () => {
  let n = 0;
  return () => {
    n += 1;
    return `r${n}`;
  };
};

describe("usernameCandidates", () => {
  it("先頭は素そのもので、以降は 2 から始まる連番を足す", () => {
    const candidates = usernameCandidates("takezo");

    expect(candidates.slice(0, 3)).toEqual(["takezo", "takezo2", "takezo3"]);
  });

  it("連番の最後は上限の番号", () => {
    const candidates = usernameCandidates("takezo", countingSuffix());

    expect(candidates[USERNAME_NUMBERED_CANDIDATE_LIMIT - 1]).toBe(
      `takezo${USERNAME_NUMBERED_CANDIDATE_LIMIT}`,
    );
  });

  it("連番が尽きた後はランダムな接尾辞つきの候補に切り替える", () => {
    // 連番だけだと素が埋まった時点で以降ずっと生成できず、
    // mapProfileToUser は毎回のサインインで走るので既存ユーザーが締め出される。
    const candidates = usernameCandidates("takezo", countingSuffix());

    expect(
      candidates.slice(USERNAME_NUMBERED_CANDIDATE_LIMIT, undefined)[0],
    ).toBe("takezo-r1");
    expect(candidates.at(-1)).toBe(
      `takezo-r${USERNAME_RANDOM_CANDIDATE_LIMIT}`,
    );
  });

  it("ランダム候補は毎回引き直すので同じ名前が並ばない", () => {
    const candidates = usernameCandidates("takezo", countingSuffix()).slice(
      USERNAME_NUMBERED_CANDIDATE_LIMIT,
    );

    expect(new Set(candidates).size).toBe(USERNAME_RANDOM_CANDIDATE_LIMIT);
  });

  it("上限の件数で打ち切る（無限に探し続けない）", () => {
    const candidates = usernameCandidates("takezo", countingSuffix());

    expect(candidates).toHaveLength(
      USERNAME_NUMBERED_CANDIDATE_LIMIT + USERNAME_RANDOM_CANDIDATE_LIMIT,
    );
  });

  it("連番もランダム接尾辞も足して上限の長さを超えない", () => {
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

describe("randomBase36Suffix", () => {
  it("決められた長さの 36 進数文字列を返す", () => {
    for (let n = 0; n < 50; n++) {
      const suffix = randomBase36Suffix();

      expect(suffix).toHaveLength(USERNAME_RANDOM_SUFFIX_LENGTH);
      expect(suffix).toMatch(/^[0-9a-z]+$/);
    }
  });

  it("呼ぶたびに違う値を返す", () => {
    const suffixes = new Set(
      Array.from({ length: 20 }, () => randomBase36Suffix()),
    );

    // 22 億通りから 20 個引いて全部同じになることは実質起こらない。
    // 19 個が同じでも通ってしまう `> 1` ではなく、20 個すべての一意性を見る。
    expect(suffixes.size).toBe(20);
  });

  // 無限ループへの回帰はテストスイート全体を止めてしまうため、
  // このテストだけ短いタイムアウトで早く落とす。
  it("Math.random が 0 を返しても長さちょうどの接尾辞を返す（無限ループしない）", () => {
    // (0).toString(36) は "0" になり slice(2) は "" になる。旧実装は
    // 空文字を足し続けるだけの while ループのため、ここで停止しなくなる。
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const suffix = randomBase36Suffix();

      expect(suffix).toHaveLength(USERNAME_RANDOM_SUFFIX_LENGTH);
      expect(suffix).toMatch(/^[0-9a-z]+$/);
    } finally {
      randomSpy.mockRestore();
    }
  }, 200);
});
