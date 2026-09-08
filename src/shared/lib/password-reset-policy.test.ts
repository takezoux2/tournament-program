import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_LINK_EXPIRES_IN_HOURS,
  PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS,
  PASSWORD_RESET_LINK_EXPIRES_LABEL,
} from "./password-reset-policy";

describe("パスワードリセットリンクの有効期限", () => {
  it("秒数は時間から導出される", () => {
    expect(PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS).toBe(
      PASSWORD_RESET_LINK_EXPIRES_IN_HOURS * 60 * 60,
    );
  });

  it("表示ラベルは時間の値と一致する", () => {
    expect(PASSWORD_RESET_LINK_EXPIRES_LABEL).toBe(
      `${PASSWORD_RESET_LINK_EXPIRES_IN_HOURS}時間`,
    );
  });

  it("確認メール（24 時間）より短い", () => {
    // 切れても申請し直すだけで復帰でき、リンクが漏れたときの窓は
    // 狭いほどよいため、確認メールより短く保つ。
    expect(PASSWORD_RESET_LINK_EXPIRES_IN_HOURS).toBeLessThan(24);
  });
});
