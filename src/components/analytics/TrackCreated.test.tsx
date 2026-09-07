import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackCreated } from "./TrackCreated";

const trackEvent = vi.fn();
const replace = vi.fn();

vi.mock("@/shared/lib/analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const router = { replace };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/orgs/tennis",
}));

describe("TrackCreated", () => {
  beforeEach(() => {
    trackEvent.mockReset();
    replace.mockReset();
  });

  it("created=organization で organization_create を送り、クエリを消す", () => {
    render(<TrackCreated created="organization" />);

    expect(trackEvent).toHaveBeenCalledWith("organization_create");
    expect(replace).toHaveBeenCalledWith("/orgs/tennis");
  });

  it("created=tournament で tournament_create を送る", () => {
    render(<TrackCreated created="tournament" />);

    expect(trackEvent).toHaveBeenCalledWith("tournament_create");
  });

  it("created=division で division_create を送る", () => {
    render(<TrackCreated created="division" />);

    expect(trackEvent).toHaveBeenCalledWith("division_create");
  });

  it("created が無いときは何もしない", () => {
    render(<TrackCreated created={undefined} />);

    expect(trackEvent).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("知らない値は無視する（URL は手で打てるため）", () => {
    render(<TrackCreated created="nonsense" />);

    expect(trackEvent).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("同じ値で再描画されても 2 回目は送らない", () => {
    const { rerender } = render(<TrackCreated created="organization" />);
    rerender(<TrackCreated created="organization" />);

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
