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
});
