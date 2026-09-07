import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAnalytics } from "./GoogleAnalytics";

let pathname = "/orgs/tennis";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// next/script はテストでは走らせず、素の <script> として描画するだけにする。
vi.mock("next/script", () => ({
  default: ({
    dangerouslySetInnerHTML,
    ...rest
  }: {
    dangerouslySetInnerHTML?: { __html: string };
    [key: string]: unknown;
  }) => (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: next/script のテスト用ダミー
    <script {...rest} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
  ),
}));

describe("GoogleAnalytics", () => {
  beforeEach(() => {
    pathname = "/orgs/tennis";
    // 本物のブートストラップは jsdom では走らないため、テスト側で用意する。
    window.gtag = vi.fn();
  });

  afterEach(() => {
    // @ts-expect-error テスト後始末のため型を無視して消す
    delete window.gtag;
  });

  const bootstrapHtml = (container: HTMLElement) =>
    container.querySelector("#ga-bootstrap")?.innerHTML ?? "";

  it("インラインスクリプトに send_page_view: false を含む", () => {
    const { container } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(bootstrapHtml(container)).toContain("send_page_view: false");
  });

  it("インラインスクリプトに測定 ID を含む", () => {
    const { container } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(bootstrapHtml(container)).toContain("G-ABC123XYZ");
  });

  it("インラインスクリプトにクエリ文字列を含む URL が現れない", () => {
    const { container } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(bootstrapHtml(container)).not.toContain("?");
  });

  it("初回描画で page_view を 1 回だけ、サニタイズ済みの page_location で送る", () => {
    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith("event", "page_view", {
      page_location: `${window.location.origin}/orgs/tennis`,
    });
  });

  it("パスが変わって再描画されると、新しいパスでもう 1 回送る", () => {
    const { rerender } = render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    pathname = "/orgs/other";
    rerender(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    expect(window.gtag).toHaveBeenCalledTimes(2);
    expect(window.gtag).toHaveBeenLastCalledWith("event", "page_view", {
      page_location: `${window.location.origin}/orgs/other`,
    });
  });

  it("ID を含むパスでは生の ID が page_location に現れない", () => {
    pathname = "/orgs/tennis/tournaments/clx1a2b3c4d5e6f7g8h9i0jk";

    render(<GoogleAnalytics gaId="G-ABC123XYZ" />);

    const call = (window.gtag as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentLocation = (call[2] as { page_location: string }).page_location;

    expect(sentLocation).not.toContain("clx1a2b3c4d5e6f7g8h9i0jk");
    expect(sentLocation).toBe(
      `${window.location.origin}/orgs/tennis/tournaments/:id`,
    );
  });
});
