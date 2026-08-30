import { describe, expect, it } from "vitest";
import { MAX_SLUG_LENGTH, validateSlug } from "./domain";

describe("validateSlug", () => {
  it("英小文字・数字・ハイフンだけの妥当な値を通す", () => {
    expect(validateSlug("tennis")).toBeNull();
    expect(validateSlug("tennis-club-2026")).toBeNull();
    expect(validateSlug("a1b")).toBeNull();
  });

  it("空文字を empty として弾く", () => {
    expect(validateSlug("")).toBe("empty");
  });

  it("3 文字未満を tooShort として弾く", () => {
    expect(validateSlug("ab")).toBe("tooShort");
  });

  it("50 文字超を tooLong として弾く", () => {
    expect(validateSlug("a".repeat(MAX_SLUG_LENGTH))).toBeNull();
    expect(validateSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe("tooLong");
  });

  it("大文字・日本語・記号を invalidCharacter として弾く", () => {
    expect(validateSlug("Tennis")).toBe("invalidCharacter");
    expect(validateSlug("テニス部")).toBe("invalidCharacter");
    expect(validateSlug("tennis_club")).toBe("invalidCharacter");
    expect(validateSlug("tennis club")).toBe("invalidCharacter");
    expect(validateSlug("tennis/evil")).toBe("invalidCharacter");
  });

  it("先頭・末尾のハイフンを hyphenEdge として弾く", () => {
    expect(validateSlug("-tennis")).toBe("hyphenEdge");
    expect(validateSlug("tennis-")).toBe("hyphenEdge");
  });

  it("連続したハイフンを consecutiveHyphen として弾く", () => {
    expect(validateSlug("ten--nis")).toBe("consecutiveHyphen");
  });

  it("ルーティングと衝突する予約語を reserved として弾く", () => {
    expect(validateSlug("new")).toBe("reserved");
    expect(validateSlug("orgs")).toBe("reserved");
    expect(validateSlug("api")).toBe("reserved");
    expect(validateSlug("login")).toBe("reserved");
    expect(validateSlug("signup")).toBe("reserved");
    expect(validateSlug("mock")).toBe("reserved");
  });

  // 複数の違反条件を同時に満たす入力に対して、if チェーンがどの違反を
  // 優先して返すかを固定する。チェックの並び順を入れ替えても全テストが
  // 通ってしまう状態を防ぎ、ユーザーに見せるメッセージが黙って変わるのを防ぐ。
  describe("複数条件に該当する入力の優先順位", () => {
    it("短すぎる かつ 不正な文字を含む場合は tooShort を優先する", () => {
      // "AB" は 2 文字で MIN_SLUG_LENGTH 未満、かつ大文字を含み invalidCharacter にも該当する
      expect(validateSlug("AB")).toBe("tooShort");
    });

    it("長すぎる かつ 不正な文字を含む場合は tooLong を優先する", () => {
      // 51 文字で MAX_SLUG_LENGTH 超過、かつ先頭が大文字で invalidCharacter にも該当する
      const tooLongWithInvalidChar = `A${"a".repeat(MAX_SLUG_LENGTH)}`;
      expect(validateSlug(tooLongWithInvalidChar)).toBe("tooLong");
    });

    it("先頭・末尾のハイフン かつ 連続ハイフンの場合は hyphenEdge を優先する", () => {
      // "--ab" は先頭がハイフンであり、かつ連続ハイフンでもある
      expect(validateSlug("--ab")).toBe("hyphenEdge");
      // "ab--" は末尾がハイフンであり、かつ連続ハイフンでもある
      expect(validateSlug("ab--")).toBe("hyphenEdge");
    });

    // 予約語 (new, orgs, api, login, signup, mock) はいずれも
    // MIN_SLUG_LENGTH <= length <= MAX_SLUG_LENGTH の範囲内で、
    // 英小文字のみで構成され、ハイフンを含まない。つまり reserved は
    // それ以外のどの違反にも該当しない値だけを対象にしており、
    // reserved が他の違反と重なるケースは現在の予約語リストと
    // 長さ制約の組み合わせでは作れない。
  });
});
