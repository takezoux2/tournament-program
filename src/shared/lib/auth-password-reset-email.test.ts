import { describe, expect, it } from "vitest";
import {
  buildPasswordResetEmail,
  PASSWORD_RESET_EMAIL_SUBJECT,
} from "./auth-password-reset-email";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "./password-reset-policy";

const from = { email: "noreply@example.com", name: "大会運営" };
const url =
  "https://example.com/api/auth/reset-password/t0ken?callbackURL=%2Freset-password";

describe("buildPasswordResetEmail", () => {
  it("件名・差出人・宛先をそのまま載せる", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(message.subject).toBe(PASSWORD_RESET_EMAIL_SUBJECT);
    expect(message.from).toEqual(from);
    expect(message.to).toEqual([{ email: "user@example.com", name: "竹添" }]);
  });

  it("テキスト本文に URL と有効期限を含める", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url,
    });

    expect(message.text).toContain(url);
    expect(message.text).toContain(PASSWORD_RESET_LINK_EXPIRES_LABEL);
    // 申請していない人に「破棄してください」と伝える一文は、
    // 誤送信や第三者による申請に気づいてもらうために必須。
    expect(message.text).toContain("心当たりが無い場合");
  });

  it("名前が空文字のときはメールアドレスで呼びかける", () => {
    // User.name は NOT NULL なので、実運用で到達しうる欠損は空文字。
    // ?? ではなく || で判定していないと「 様」になる。
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "   " },
      url,
    });

    expect(message.text.startsWith("user@example.com 様")).toBe(true);
  });

  it("HTML 本文では URL の & をエスケープする", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "竹添" },
      url: "https://example.com/r?a=1&b=2",
    });

    expect(message.html).toContain("https://example.com/r?a=1&amp;b=2");
    expect(message.html).not.toContain("a=1&b=2");
  });

  it("HTML 本文では名前をエスケープする", () => {
    const message = buildPasswordResetEmail({
      from,
      to: { email: "user@example.com", name: "<script>x</script>" },
      url,
    });

    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
  });
});
