import { describe, expect, it } from "vitest";
import { sanitizePagePath } from "./sanitize-url";

describe("sanitizePagePath", () => {
  it("組織のパスはそのまま通す", () => {
    expect(sanitizePagePath("/orgs/tennis-club")).toBe("/orgs/tennis-club");
  });

  it("大会 ID は :id に伏せる", () => {
    // cuid。大会・部門・ユーザーの ID はすべてこの形。
    expect(
      sanitizePagePath(
        "/orgs/tennis-club/tournaments/clx1a2b3c4d5e6f7g8h9i0jk",
      ),
    ).toBe("/orgs/tennis-club/tournaments/:id");
  });

  it("数値の ID も伏せる", () => {
    expect(sanitizePagePath("/orgs/tennis-club/users/42/permissions")).toBe(
      "/orgs/tennis-club/users/:id/permissions",
    );
  });

  it("UUID も伏せる", () => {
    expect(
      sanitizePagePath("/t/3f2504e0-4f89-11d3-9a0c-0305e82c3301/schedule"),
    ).toBe("/t/:id/schedule");
  });

  it("短い語は伏せない", () => {
    // "new" や "edit" のような画面名を :id にしてしまうと、
    // ページ別レポートで作成画面と詳細画面の区別が付かなくなる。
    expect(sanitizePagePath("/orgs/tennis-club/tournaments/new")).toBe(
      "/orgs/tennis-club/tournaments/new",
    );
    expect(sanitizePagePath("/orgs/abc/edit")).toBe("/orgs/abc/edit");
  });

  it("ルートはそのまま", () => {
    expect(sanitizePagePath("/")).toBe("/");
  });
});
