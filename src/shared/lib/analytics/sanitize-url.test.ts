import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizedReferrer, sanitizePagePath } from "./sanitize-url";

describe("sanitizePagePath", () => {
  it("組織のパスはそのまま通す", () => {
    expect(sanitizePagePath("/orgs/tennis-club")).toBe("/orgs/tennis-club");
  });

  it("大会 ID は :id に伏せる", () => {
    // Prisma の @default(uuid())。大会・部門の ID はこの形。
    expect(
      sanitizePagePath(
        "/orgs/tennis-club/tournaments/3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      ),
    ).toBe("/orgs/tennis-club/tournaments/:id");
  });

  it("長い英数字だけの組織 slug は伏せない", () => {
    // validateSlug は 3〜50 文字の [a-z0-9-] を許す。見た目で ID を
    // 判定すると、こうした正当な slug まで :id に潰れてしまい、
    // 「どの組織が使っているか」という肝心の指標が消える。
    expect(sanitizePagePath("/orgs/tokyotennisclub2026")).toBe(
      "/orgs/tokyotennisclub2026",
    );
  });

  it("数字だけの組織 slug も伏せない", () => {
    expect(sanitizePagePath("/orgs/2026")).toBe("/orgs/2026");
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

  it("公開ページの大会 ID も伏せる", () => {
    expect(sanitizePagePath("/t/3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "/t/:id",
    );
  });

  it("位置の表に無いパスでも、形が UUID なら伏せる", () => {
    // 位置だけで判定すると、後から /invite/<token> のようなパスが
    // 増えたとき、誰かが表に足すまで素通りしてしまう（fail-open）。
    expect(
      sanitizePagePath("/invite/3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    ).toBe("/invite/:id");
  });

  it("形の保険は組織 slug には効かせない", () => {
    // /orgs の直後は必ず slug。ここだけは形が何であれ素通しにする。
    expect(sanitizePagePath("/orgs/tokyotennisclub2026")).toBe(
      "/orgs/tokyotennisclub2026",
    );
  });

  it("部門 ID も伏せる", () => {
    expect(
      sanitizePagePath(
        "/orgs/tennis-club/tournaments/3f2504e0-4f89-11d3-9a0c-0305e82c3301/divisions/8ab2c1de-0000-4000-8000-000000000001/setup",
      ),
    ).toBe("/orgs/tennis-club/tournaments/:id/divisions/:id/setup");
  });
});

describe("sanitizedReferrer", () => {
  const setReferrer = (value: string): void => {
    vi.spyOn(document, "referrer", "get").mockReturnValue(value);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("同一オリジンの参照元はクエリを落として ID も伏せる", () => {
    // /reset-password?token=... からページを移動しただけで、次のヒットの
    // 参照元としてトークンが飛ぶ。page_location を塞いでも 1 つ隣の
    // 項目から同じ漏れが起きるため、ここも塞ぐ。
    setReferrer(`${window.location.origin}/reset-password?token=SECRET`);

    expect(sanitizedReferrer()).toBe(
      `${window.location.origin}/reset-password`,
    );
  });

  it("外部からの流入はそのまま通す", () => {
    // 流入元の分析に要る。伏せるのは自サイト内の URL だけでよい。
    setReferrer("https://www.google.com/search?q=%E5%A4%A7%E4%BC%9A");

    expect(sanitizedReferrer()).toBe(
      "https://www.google.com/search?q=%E5%A4%A7%E4%BC%9A",
    );
  });

  it("参照元が無ければ undefined", () => {
    setReferrer("");

    expect(sanitizedReferrer()).toBeUndefined();
  });

  it("解釈できない参照元は捨てる", () => {
    setReferrer("not a url");

    expect(sanitizedReferrer()).toBeUndefined();
  });
});
