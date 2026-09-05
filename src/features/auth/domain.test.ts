import { describe, expect, it } from "vitest";
import {
  safeRedirectPath,
  verificationCallbackURL,
  verificationNotice,
} from "./domain";

describe("safeRedirectPath", () => {
  it("同一オリジンの絶対パスは通す", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("クエリ付きのパスも通す", () => {
    expect(safeRedirectPath("/tournaments?page=2")).toBe("/tournaments?page=2");
  });

  it("null は / にする", () => {
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("undefined は / にする", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("空文字は / にする", () => {
    expect(safeRedirectPath("")).toBe("/");
  });

  it("絶対 URL は / にする", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe("/");
  });

  it("プロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("//evil.example.com")).toBe("/");
  });

  it("バックスラッシュを使ったプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\\evil.example.com")).toBe("/");
  });

  it("相対パスは / にする", () => {
    expect(safeRedirectPath("dashboard")).toBe("/");
  });

  it("タブ文字を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\t/evil.example.com")).toBe("/");
  });

  it("改行 (LF) を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\n/evil.example.com")).toBe("/");
  });

  it("改行 (CR) を含むプロトコル相対 URL は / にする", () => {
    expect(safeRedirectPath("/\r/evil.example.com")).toBe("/");
  });

  it("タブ文字が連続していても / にする", () => {
    expect(safeRedirectPath("/\t\t/evil.example.com")).toBe("/");
  });

  it("パスの途中にタブ文字があっても / にする", () => {
    expect(safeRedirectPath("/dash\tboard")).toBe("/");
  });

  it("スペースはタブと異なり弾かれずそのまま通す", () => {
    expect(safeRedirectPath("/ /evil.example.com")).toBe("/ /evil.example.com");
  });
});

describe("verificationNotice", () => {
  it("確認が済んだらログインを促す", () => {
    expect(verificationNotice(true, null)).toBe(
      "登録が完了しました。ログインしてください",
    );
  });

  it("期限切れは再送されることを伝える", () => {
    expect(verificationNotice(true, "TOKEN_EXPIRED")).toBe(
      "リンクの有効期限が切れています。ログインすると確認メールを送り直します",
    );
  });

  it("その他のエラーもログインで復帰できることを伝える", () => {
    expect(verificationNotice(true, "INVALID_TOKEN")).toBe(
      "リンクが無効です。ログインすると確認メールを送り直します",
    );
  });

  it("エラーがあれば verified が false でも案内する", () => {
    // Better Auth は callbackURL に ?error= を足して返すため、
    // verified=1 が欠けた URL で戻ってくる経路もあり得る。
    expect(verificationNotice(false, "TOKEN_EXPIRED")).toBe(
      "リンクの有効期限が切れています。ログインすると確認メールを送り直します",
    );
  });

  it("確認リンク経由でなければ何も出さない", () => {
    expect(verificationNotice(false, null)).toBeNull();
  });
});

describe("verificationCallbackURL", () => {
  it("遷移先を redirect に載せて /login への callbackURL を組み立てる", () => {
    expect(verificationCallbackURL("/orgs")).toBe(
      "/login?verified=1&redirect=%2Forgs",
    );
  });

  it("遷移先が / でも組み立てられる", () => {
    expect(verificationCallbackURL("/")).toBe(
      "/login?verified=1&redirect=%2F",
    );
  });
});
