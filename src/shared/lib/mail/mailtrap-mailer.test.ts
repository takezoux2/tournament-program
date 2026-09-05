import { describe, expect, it, vi } from "vitest";
import { createMailtrapMailer } from "./mailtrap-mailer";

const message = {
  from: { email: "no-reply@example.com", name: "大会運営" },
  to: [{ email: "user@example.com", name: "竹添" }],
  subject: "確認",
  text: "text body",
  html: "<p>html body</p>",
};

describe("createMailtrapMailer", () => {
  it("MailMessage をそのまま client.send へ渡す", async () => {
    const send = vi.fn().mockResolvedValue({ success: true, message_ids: [] });
    await createMailtrapMailer({ send }).send(message);
    expect(send).toHaveBeenCalledWith(message);
  });

  it("client.send が reject したらそのまま伝播する", async () => {
    const send = vi.fn().mockRejectedValue(new Error("mailtrap down"));
    await expect(createMailtrapMailer({ send }).send(message)).rejects.toThrow(
      "mailtrap down",
    );
  });
});
