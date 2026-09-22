import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintToolbar } from "./PrintToolbar";

describe("PrintToolbar", () => {
  it("用紙と結果の切替を、今の設定を保ったリンクで出す", () => {
    render(
      <PrintToolbar
        tournamentId="t1"
        options={{ paper: "a4", results: false }}
      />,
    );

    expect(screen.getByRole("link", { name: "A3" })).toHaveAttribute(
      "href",
      "/t/t1/print?paper=a3&results=0",
    );
    expect(screen.getByRole("link", { name: "結果あり" })).toHaveAttribute(
      "href",
      "/t/t1/print?paper=a4&results=1",
    );
  });

  it("選択中の設定に aria-current を付ける", () => {
    render(
      <PrintToolbar
        tournamentId="t1"
        options={{ paper: "a4", results: false }}
      />,
    );

    expect(screen.getByRole("link", { name: "A4" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "空欄" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "A3" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("印刷ボタンでブラウザの印刷を開く", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <PrintToolbar
        tournamentId="t1"
        options={{ paper: "a4", results: true }}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "印刷 / PDFに保存" }),
    );

    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
