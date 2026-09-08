import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackCreated } from "./TrackCreated";

const trackEvent = vi.fn();

vi.mock("@/shared/lib/analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/orgs/tennis",
}));

describe("TrackCreated", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    trackEvent.mockReset();
    replaceState = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    replaceState.mockRestore();
  });

  it("created=organization で create_organization を送り、クエリを消す", () => {
    render(<TrackCreated created="organization" />);

    expect(trackEvent).toHaveBeenCalledWith("create_organization");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/orgs/tennis");
  });

  it("created 以外のクエリは残す", () => {
    // クエリごと捨てていると、この先どれかのページにタブや絞り込みの
    // パラメータが増えたとき、作成直後だけ黙って消える。
    window.history.replaceState(
      null,
      "",
      "/orgs/tennis?created=organization&keep=1",
    );
    replaceState.mockClear();

    render(<TrackCreated created="organization" />);

    expect(replaceState).toHaveBeenCalledWith(null, "", "/orgs/tennis?keep=1");
  });

  it("created=tournament で create_tournament を送る", () => {
    render(<TrackCreated created="tournament" />);

    expect(trackEvent).toHaveBeenCalledWith("create_tournament");
  });

  it("created=division で create_division を送る", () => {
    render(<TrackCreated created="division" />);

    expect(trackEvent).toHaveBeenCalledWith("create_division");
  });

  it("created が無いときは何もしない", () => {
    render(<TrackCreated created={undefined} />);

    expect(trackEvent).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("知らない値は無視する（URL は手で打てるため）", () => {
    render(<TrackCreated created="nonsense" />);

    expect(trackEvent).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("同じ値で再描画されても 2 回目は送らない", () => {
    const { rerender } = render(<TrackCreated created="organization" />);
    rerender(<TrackCreated created="organization" />);

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("StrictMode で effect が 2 回走っても 1 回しか送らない", () => {
    // クエリを消すのは history の書き換えだけでサーバー側は再描画されないため、
    // StrictMode の 2 回目の setup にも created は同じ値のまま届く。
    render(
      <StrictMode>
        <TrackCreated created="organization" />
      </StrictMode>,
    );

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
