import { describe, expect, it } from "vitest";
import {
  buildEmailChangeNoticeEmail,
  buildEmailChangeVerificationEmail,
  EMAIL_CHANGE_CALLBACK_URL,
  isEmailChangeVerification,
} from "./auth-email-change-email";

const from = { email: "no-reply@example.test", name: "大会運営" };

describe("isEmailChangeVerification", () => {
  it("callbackURL が /profile ならメール変更と判定する", () => {
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      EMAIL_CHANGE_CALLBACK_URL,
    )}`;
    expect(isEmailChangeVerification(url)).toBe(true);
  });

  it("callbackURL が /login なら登録時の確認と判定する", () => {
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      "/login?verified=1&redirect=/",
    )}`;
    expect(isEmailChangeVerification(url)).toBe(false);
  });

  it("登録時の redirect が /profile でも、メール変更とは判定しない", () => {
    // /profile を開こうとして /login へ送られた人が登録を完了する経路。
    // callbackURL の中の redirect を見てしまうと、ここで誤判定する。
    // 判定に使うのは callbackURL 自身のパスだけ。
    const url = `https://app.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(
      "/login?verified=1&redirect=/profile",
    )}`;
    expect(isEmailChangeVerification(url)).toBe(false);
  });

  it("callbackURL が無ければ登録時の確認として扱う", () => {
    expect(
      isEmailChangeVerification(
        "https://app.test/api/auth/verify-email?token=t",
      ),
    ).toBe(false);
  });

  it("url として解釈できない値でも例外を投げず false を返す", () => {
    // 文面の選択に失敗して送信そのものが落ちるのは割に合わない。
    expect(isEmailChangeVerification("not a url")).toBe(false);
  });
});

describe("buildEmailChangeVerificationEmail", () => {
  const message = buildEmailChangeVerificationEmail({
    from,
    to: { email: "new@example.test", name: "竹添太郎" },
    url: "https://app.test/api/auth/verify-email?token=t&callbackURL=%2Fprofile",
  });

  it("宛名と本文にリンクを含む", () => {
    expect(message.text).toContain("竹添太郎 様");
    expect(message.text).toContain(
      "https://app.test/api/auth/verify-email?token=t&callbackURL=%2Fprofile",
    );
  });

  it("登録の完了ではなく、変更の確定だと分かる文面にする", () => {
    expect(message.text).toContain("メールアドレスの変更");
    expect(message.text).not.toContain("仮登録");
  });

  it("宛先は新しいアドレス 1 件だけ", () => {
    expect(message.to).toEqual([
      { email: "new@example.test", name: "竹添太郎" },
    ]);
  });

  it("HTML では url をエスケープする", () => {
    expect(message.html).toContain("&amp;callbackURL=");
    expect(message.html).not.toContain("?token=t&callbackURL");
  });

  it("名前が空なら宛名にメールアドレスを使う", () => {
    const withoutName = buildEmailChangeVerificationEmail({
      from,
      to: { email: "new@example.test", name: "  " },
      url: "https://app.test/x",
    });
    expect(withoutName.text).toContain("new@example.test 様");
  });
});

describe("buildEmailChangeNoticeEmail", () => {
  const message = buildEmailChangeNoticeEmail({
    from,
    to: { email: "old@example.test", name: "竹添太郎" },
    newEmail: "new@example.test",
  });

  it("宛先は変更前のアドレス", () => {
    expect(message.to).toEqual([
      { email: "old@example.test", name: "竹添太郎" },
    ]);
  });

  it("変更先のアドレスを伝える", () => {
    expect(message.text).toContain("new@example.test");
  });

  it("リンクを含めない（踏ませる操作がこのメールには無い）", () => {
    expect(message.text).not.toContain("http");
    expect(message.html).not.toContain("<a ");
  });

  it("心当たりが無い場合の案内を含む", () => {
    expect(message.text).toContain("心当たりが無い");
  });

  it("HTML では新しいアドレスをエスケープする", () => {
    const injected = buildEmailChangeNoticeEmail({
      from,
      to: { email: "old@example.test", name: "竹添太郎" },
      newEmail: "<script>@example.test",
    });
    expect(injected.html).toContain("&lt;script&gt;");
    expect(injected.html).not.toContain("<script>");
  });
});
