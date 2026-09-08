import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGtagForTest } from "@/shared/lib/analytics/gtag";
import { GoogleAnalytics } from "./GoogleAnalytics";

let pathname = "/orgs/tennis";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/**
 * usePathname と実際の URL を揃える。page_location は
 * window.location から組み立てるので、モックだけ変えても足りない。
 */
const goTo = (next: string): void => {
  pathname = next;
  window.history.replaceState(null, "", next);
};

// next/script はテストでは走らせず、素の <script> として描画するだけにする。
vi.mock("next/script", () => ({
  default: (rest: Record<string, unknown>) => <script {...rest} />,
}));

const original = process.env.NEXT_PUBLIC_GA_ID;

/** dataLayer に積まれた arguments を、比べやすい配列に均す。 */
const queued = (): unknown[][] =>
  (window.dataLayer ?? []).map((entry) =>
    Array.from(entry as ArrayLike<unknown>),
  );

const pageViews = (): Record<string, unknown>[] =>
  queued()
    .filter((e) => e[0] === "event" && e[1] === "page_view")
    .map((e) => e[2] as Record<string, unknown>);

describe("GoogleAnalytics", () => {
  beforeEach(() => {
    goTo("/orgs/tennis");
    process.env.NEXT_PUBLIC_GA_ID = "G-ABC123XYZ";
    window.dataLayer = [];
    resetGtagForTest();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_GA_ID;
    } else {
      process.env.NEXT_PUBLIC_GA_ID = original;
    }
    window.dataLayer = undefined;
  });

  it("gtag.js を測定 ID 付きで読み込む", () => {
    const { container } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(container.querySelector("#ga-src")?.getAttribute("src")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ",
    );
  });

  it("config は send_page_view: false で積まれる", () => {
    // 既定の config は page_location（クエリ込みの生 URL）で page_view を
    // 即送ってしまう。自前で送るために必ず切っておく。
    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(queued()).toContainEqual([
      "config",
      "G-ABC123XYZ",
      expect.objectContaining({ send_page_view: false }),
    ]);
  });

  it("初回描画で page_view を 1 回だけ、サニタイズ済みの page_location で送る", () => {
    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(pageViews()).toEqual([
      expect.objectContaining({
        page_location: `${window.location.origin}/orgs/tennis`,
      }),
    ]);
  });

  it("パスが変わって再描画されると、新しいパスでもう 1 回送る", () => {
    const { rerender } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    goTo("/orgs/other");
    rerender(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(pageViews()).toEqual([
      expect.objectContaining({
        page_location: `${window.location.origin}/orgs/tennis`,
      }),
      expect.objectContaining({
        page_location: `${window.location.origin}/orgs/other`,
      }),
    ]);
  });

  it("page_title には大会名や組織名を載せない", () => {
    // /t/** は参加者の本名や大会名を出すため noindex にしてある。
    // document.title をそのまま送ると、Google に渡さないと決めた名前を
    // GA 経由で渡すことになる。パスと揃えて名前を出さない。
    document.title = "全日本選手権 | 東京テニスクラブ";
    goTo("/t/3f2504e0-4f89-11d3-9a0c-0305e82c3301");

    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(pageViews()[0].page_title).toBe("/t/:id");
  });

  it("クエリ文字列は page_location に載らない", () => {
    // /reset-password?token=... のようなページで、有効なトークンが
    // Google に保存されるのを防ぐ。ここが本機能の主目的。
    goTo("/reset-password");

    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(pageViews()[0].page_location).toBe(
      `${window.location.origin}/reset-password`,
    );
  });

  it("ID を含むパスでは生の ID が page_location に現れない", () => {
    goTo("/orgs/tennis/tournaments/3f2504e0-4f89-11d3-9a0c-0305e82c3301");

    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    const sent = pageViews()[0].page_location as string;

    expect(sent).not.toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(sent).toBe(`${window.location.origin}/orgs/tennis/tournaments/:id`);
  });

  it("StrictMode で effect が 2 回走っても page_view は 1 回だけ", () => {
    // 開発時の StrictMode は effect を setup → cleanup → setup と 2 回走らせる。
    // 素直に書くと同じページビューが 2 回飛ぶ。開発サーバへステージング用の
    // 測定 ID を向ける使い方を想定しているので、そこで数字が倍にならないこと。
    render(
      <StrictMode>
        <GoogleAnalytics gaId="G-ABC123XYZ" />
      </StrictMode>,
    );

    expect(pageViews()).toHaveLength(1);
  });

  it("測定 ID が無ければ dataLayer に一切触らない", () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(queued()).toEqual([]);
  });
});
