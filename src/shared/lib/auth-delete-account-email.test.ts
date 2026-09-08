import { describe, expect, it } from "vitest";
import { buildDeleteAccountEmail } from "./auth-delete-account-email";

const from = { email: "no-reply@example.test", name: "大会運営" };
const url = "https://app.test/api/auth/delete-user/callback?token=t&x=1";

describe("buildDeleteAccountEmail", () => {
  const message = buildDeleteAccountEmail({
    from,
    to: { email: "taro@example.test", name: "竹添太郎" },
    url,
  });

  it("宛名とリンクを含む", () => {
    expect(message.text).toContain("竹添太郎 様");
    expect(message.text).toContain(url);
  });

  it("削除が取り消せないことを伝える", () => {
    expect(message.text).toContain("元に戻せません");
  });

  it("ログイン中のブラウザで開く必要があることを伝える", () => {
    // delete-user/callback は有効なセッションを要求する。
    expect(message.text).toContain("ログイン中のブラウザ");
  });

  it("身に覚えが無い場合の案内を含む", () => {
    expect(message.text).toContain("心当たりが無い");
  });

  it("HTML では url をエスケープする", () => {
    expect(message.html).toContain("&amp;x=1");
    expect(message.html).not.toContain("?token=t&x=1");
  });

  it("名前が空なら宛名にメールアドレスを使う", () => {
    const withoutName = buildDeleteAccountEmail({
      from,
      to: { email: "taro@example.test", name: "" },
      url,
    });
    expect(withoutName.text).toContain("taro@example.test 様");
  });
});
