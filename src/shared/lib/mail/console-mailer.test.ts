import { describe, expect, it, vi } from "vitest";
import { createConsoleMailer } from "./console-mailer";

describe("createConsoleMailer", () => {
  it("宛先・件名・本文をログに出す", async () => {
    const log = vi.fn();
    await createConsoleMailer(log).send({
      from: { email: "no-reply@example.com", name: "大会運営" },
      to: [{ email: "user@example.com", name: "竹添" }],
      subject: "確認",
      text: "https://example.com/verify?token=abc",
      html: "<p>ignored</p>",
    });

    const output = log.mock.calls[0][0] as string;
    expect(output).toContain("user@example.com");
    expect(output).toContain("確認");
    // 認証 URL をログからコピーして登録を完了できることが、この実装の目的。
    expect(output).toContain("https://example.com/verify?token=abc");
  });
});
