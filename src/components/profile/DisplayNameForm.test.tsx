import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { DisplayNameForm } from "./DisplayNameForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("DisplayNameForm", () => {
  it("現在の表示名が初期値に入る", () => {
    render(<DisplayNameForm action={noopAction} defaultName="竹添太郎" />);

    expect(screen.getByLabelText("表示名")).toHaveValue("竹添太郎");
  });

  it("保存ボタンがある", () => {
    render(<DisplayNameForm action={noopAction} defaultName="竹添太郎" />);

    expect(
      screen.getByRole("button", { name: "表示名を保存" }),
    ).toBeInTheDocument();
  });

  it("エラーは alert として出る", async () => {
    const user = userEvent.setup();
    const errorAction: ProfileFormAction = async () => ({
      error: "テスト用のエラー",
      notice: null,
    });
    render(<DisplayNameForm action={errorAction} defaultName="竹添太郎" />);

    await user.click(screen.getByRole("button", { name: "表示名を保存" }));

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
    render(<DisplayNameForm action={noticeAction} defaultName="竹添太郎" />);

    await user.click(screen.getByRole("button", { name: "表示名を保存" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "テスト用の通知",
    );
  });
});
