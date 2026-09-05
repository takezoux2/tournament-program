import { describe, expect, it } from "vitest";
import {
  buildVerificationEmail,
  VERIFICATION_EMAIL_SUBJECT,
} from "./auth-verification-email";

const from = { email: "no-reply@example.com", name: "大会運営" };
const url =
  "https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Flogin";

describe("buildVerificationEmail", () => {
  it("差出人・宛先・件名を設定する", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(mail.from).toEqual(from);
    expect(mail.to).toEqual([{ email: "user@example.com", name: "竹添" }]);
    expect(mail.subject).toBe(VERIFICATION_EMAIL_SUBJECT);
  });

  it("テキスト本文に認証 URL と有効期間を入れる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(mail.text).toContain(url);
    expect(mail.text).toContain("24時間");
    expect(mail.text).toContain("竹添");
  });

  it("HTML 本文にリンクを入れる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    // URL 中の & は HTML では実体参照にしないと属性値が壊れる。
    expect(mail.html).toContain(
      'href="https://app.example.com/api/auth/verify-email?token=abc&amp;callbackURL=%2Flogin"',
    );
  });

  it("名前を HTML エスケープする", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "<script>alert(1)</script>" },
      url,
    });

    // name はユーザーの入力なので、素通しすると HTML インジェクションになる。
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("名前が無くても組み立てられる", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com" },
      url,
    });

    expect(mail.text).toContain(url);
    expect(mail.html).toContain("user@example.com");
  });

  it("名前が空文字ならメールアドレスで呼びかける", () => {
    const mail = buildVerificationEmail({
      from,
      to: { email: "user@example.com", name: "" },
      url,
    });

    // User.name は NOT NULL なので undefined ではなく空文字が現実的な欠損の形。
    // そのまま使うと「 様」になる。
    expect(mail.text).toContain("user@example.com 様");
  });
});
