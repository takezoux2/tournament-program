import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_DONE_PATH,
  PASSWORD_RESET_REDIRECT_TO,
  passwordResetNotice,
  resetTokenState,
} from "./domain";

describe("PASSWORD_RESET_REDIRECT_TO", () => {
  it("同一オリジンの絶対パスに固定されている", () => {
    // メール本文の callbackURL として埋め込まれるため、プロトコル相対 URL
    // で他オリジンへ飛ばされるのを防ぐ必要がある。ブラウザは "//host" と
    // "/\host" をどちらもプロトコル相対 URL として解釈する。
    expect(PASSWORD_RESET_REDIRECT_TO.startsWith("/")).toBe(true);
    expect(PASSWORD_RESET_REDIRECT_TO.startsWith("//")).toBe(false);
    expect(PASSWORD_RESET_REDIRECT_TO.startsWith("/\\")).toBe(false);
  });
});

describe("resetTokenState", () => {
  it("トークンがあり error が無ければフォームを出す", () => {
    expect(resetTokenState("t0ken", null)).toEqual({
      kind: "form",
      token: "t0ken",
    });
  });

  it("error が付いていればトークンがあってもフォームを出さない", () => {
    const state = resetTokenState("t0ken", "INVALID_TOKEN");
    expect(state.kind).toBe("invalid");
  });

  it("トークンが無ければフォームを出さない", () => {
    expect(resetTokenState(null, null).kind).toBe("invalid");
  });

  it("トークンが空文字でもフォームを出さない", () => {
    expect(resetTokenState("", null).kind).toBe("invalid");
  });

  it("未知の error コードも同じ案内に畳む", () => {
    // 無効・期限切れ・使用済みのどれでも復帰手段は「もう一度申請する」で
    // 同じなので、コードごとに文言を分けない。
    const known = resetTokenState(null, "INVALID_TOKEN");
    const unknown = resetTokenState(null, "SOMETHING_ELSE");
    expect(unknown).toEqual(known);
  });

  it("案内文は再申請を促す", () => {
    const state = resetTokenState(null, "INVALID_TOKEN");
    expect(state.kind === "invalid" && state.message).toContain("お申し込み");
  });
});

describe("passwordResetNotice", () => {
  it("reset=1 のときは再設定完了を伝える", () => {
    expect(passwordResetNotice(true)).toContain("再設定");
  });

  it("通常のログイン画面では案内を出さない", () => {
    expect(passwordResetNotice(false)).toBeNull();
  });
});

describe("PASSWORD_RESET_DONE_PATH", () => {
  it("passwordResetNotice が案内を出すクエリを持つ", () => {
    expect(PASSWORD_RESET_DONE_PATH).toBe("/login?reset=1");
  });
});
