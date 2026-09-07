import { afterEach, describe, expect, it, vi } from "vitest";
import { createConsoleMailer } from "./console-mailer";
import type { MailMessage } from "./types";

const verificationMail: MailMessage = {
  from: { email: "no-reply@example.com", name: "大会運営" },
  to: [{ email: "user@example.com", name: "竹添" }],
  subject: "確認",
  text: "以下の URL から登録を完了してください。\nhttps://example.com/verify?token=abc\n心当たりが無ければ破棄してください。",
  html: "<p>ignored</p>",
};

const sendWith = async (message: MailMessage = verificationMail) => {
  const log = vi.fn();
  await createConsoleMailer(log).send(message);
  return log.mock.calls[0]?.[0] as string;
};

describe("createConsoleMailer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("宛先・件名・本文をログに出す", async () => {
    const output = await sendWith();

    expect(output).toContain("user@example.com");
    expect(output).toContain("確認");
    // 認証 URL をログからコピーして登録を完了できることが、この実装の目的。
    expect(output).toContain("https://example.com/verify?token=abc");
    expect(output).toContain(verificationMail.text);
  });

  it("本文に埋もれないよう認証 URL を専用の行に出す", async () => {
    const lines = (await sendWith()).split("\n");

    expect(lines).toContain("URL: https://example.com/verify?token=abc");
  });

  it("スクロールの中で見つけられるよう前後を区切り線で挟む", async () => {
    const lines = (await sendWith()).split("\n");

    expect(lines.at(0)).toMatch(/^={10,}$/);
    expect(lines.at(-1)).toMatch(/^={10,}$/);
  });

  it("本文に URL が無ければ URL 行ごと出さない", async () => {
    const output = await sendWith({
      ...verificationMail,
      text: "URL を含まない本文",
    });

    expect(output).not.toContain("URL:");
    expect(output).toContain("URL を含まない本文");
  });

  it("既定の出力先は console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await createConsoleMailer().send(verificationMail);

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0] as string).toContain(
      "URL: https://example.com/verify?token=abc",
    );
  });
});
