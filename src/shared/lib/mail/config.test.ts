import { describe, expect, it } from "vitest";
import { resolveMailerConfig, resolveMailFrom } from "./config";

describe("resolveMailerConfig", () => {
  it("トークンが無ければコンソール実装を選ぶ", () => {
    expect(resolveMailerConfig({})).toEqual({ kind: "console" });
  });

  it("空白だけのトークンは未設定として扱う", () => {
    expect(resolveMailerConfig({ MAILTRAP_TOKEN: "   " })).toEqual({
      kind: "console",
    });
  });

  it("本番でトークンが無ければ例外を投げる", () => {
    expect(() => resolveMailerConfig({ NODE_ENV: "production" })).toThrow(
      /MAILTRAP_TOKEN/,
    );
  });

  it("トークンがあれば Mailtrap 実装を選ぶ", () => {
    expect(resolveMailerConfig({ MAILTRAP_TOKEN: "tok" })).toEqual({
      kind: "mailtrap",
      token: "tok",
      sandbox: false,
    });
  });

  it("sandbox 指定時は受信箱 ID を数値で返す", () => {
    expect(
      resolveMailerConfig({
        MAILTRAP_TOKEN: "tok",
        MAILTRAP_SANDBOX: "1",
        MAILTRAP_TEST_INBOX_ID: "1234",
      }),
    ).toEqual({
      kind: "mailtrap",
      token: "tok",
      sandbox: true,
      testInboxId: 1234,
    });
  });

  it("sandbox 指定なのに受信箱 ID が無ければ例外を投げる", () => {
    expect(() =>
      resolveMailerConfig({ MAILTRAP_TOKEN: "tok", MAILTRAP_SANDBOX: "1" }),
    ).toThrow(/MAILTRAP_TEST_INBOX_ID/);
  });

  it("sandbox 指定なのに受信箱 ID が数値でなければ例外を投げる", () => {
    expect(() =>
      resolveMailerConfig({
        MAILTRAP_TOKEN: "tok",
        MAILTRAP_SANDBOX: "1",
        MAILTRAP_TEST_INBOX_ID: "inbox",
      }),
    ).toThrow(/MAILTRAP_TEST_INBOX_ID/);
  });
});

describe("resolveMailFrom", () => {
  it("環境変数の差出人を使う", () => {
    expect(
      resolveMailFrom({
        MAIL_FROM_ADDRESS: "no-reply@tournament.example",
        MAIL_FROM_NAME: "大会運営",
      }),
    ).toEqual({ email: "no-reply@tournament.example", name: "大会運営" });
  });

  it("未設定なら既定値を使う", () => {
    expect(resolveMailFrom({})).toEqual({
      email: "no-reply@example.com",
      name: "大会運営",
    });
  });
});
