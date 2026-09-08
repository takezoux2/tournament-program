import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { RevokeSessionsForm } from "./RevokeSessionsForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("RevokeSessionsForm", () => {
  it("実行ボタンがある", () => {
    render(<RevokeSessionsForm action={noopAction} />);

    expect(
      screen.getByRole("button", { name: "他の端末をログアウト" }),
    ).toBeInTheDocument();
  });

  it("今の端末は残ることを伝える", () => {
    render(<RevokeSessionsForm action={noopAction} />);

    expect(
      screen.getByText(
        "この端末のログインは維持されます。他の端末では再度ログインが必要になります",
      ),
    ).toBeInTheDocument();
  });

  it("エラーは alert として出る", async () => {
    const user = userEvent.setup();
    const errorAction: ProfileFormAction = async () => ({
      error: "テスト用のエラー",
      notice: null,
    });
    render(<RevokeSessionsForm action={errorAction} />);

    await user.click(
      screen.getByRole("button", { name: "他の端末をログアウト" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "テスト用のエラー",
    );
  });

  it("通知は status として出る", async () => {
    const user = userEvent.setup();
    const noticeAction: ProfileFormAction = async () => ({
      error: null,
      notice: "テスト用の通知",
    });
    render(<RevokeSessionsForm action={noticeAction} />);

    await user.click(
      screen.getByRole("button", { name: "他の端末をログアウト" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "テスト用の通知",
    );
  });
});
