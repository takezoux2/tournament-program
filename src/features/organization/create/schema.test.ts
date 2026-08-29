import { describe, expect, it } from "vitest";
import { createOrganizationSchema } from "./schema";

const parse = (input: { name: unknown; slug: unknown }) =>
  createOrganizationSchema.safeParse(input);

describe("createOrganizationSchema", () => {
  it("妥当な入力を通し、前後の空白を落とす", () => {
    const result = parse({ name: "  テニス部  ", slug: "  tennis  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "テニス部", slug: "tennis" });
    }
  });

  it("空の組織名を弾く", () => {
    const result = parse({ name: "   ", slug: "tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("組織名を入力してください");
    }
  });

  it("100 文字超の組織名を弾く", () => {
    const result = parse({ name: "あ".repeat(101), slug: "tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織名は100文字以内で入力してください",
      );
    }
  });

  it("slug の違反を domain の文言でそのまま返す", () => {
    const result = parse({ name: "テニス部", slug: "Tennis" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "組織 ID は半角英小文字・数字・ハイフンのみ使えます",
      );
    }
  });

  it("予約語の slug を弾く", () => {
    const result = parse({ name: "テニス部", slug: "new" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "この組織 ID は予約されているため使えません",
      );
    }
  });
});
