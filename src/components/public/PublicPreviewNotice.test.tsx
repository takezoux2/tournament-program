import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicPreviewNotice } from "./PublicPreviewNotice";

describe("PublicPreviewNotice", () => {
  it("準備中であることと、メンバーにしか見えないことの両方を伝える", () => {
    // 「準備中」だけだと、公開前の URL を参加者へ渡してよいと
    // 誤解されうる。見えている範囲まで書いてあることを固定する。
    render(<PublicPreviewNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("準備中");
    expect(notice).toHaveTextContent("組織のメンバーにしか表示されません");
  });
});
