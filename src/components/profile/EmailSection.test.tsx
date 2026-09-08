import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { EmailSection } from "./EmailSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("EmailSection", () => {
  it("現在のアドレスを表示する（入力欄ではなくテキストとして）", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(screen.getByText("old@example.test")).toBeInTheDocument();
  });

  it("新しいアドレスの入力欄は空で始まる", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(screen.getByLabelText("新しいメールアドレス")).toHaveValue("");
  });

  it("リンクを踏むまで変わらないことを伝える", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(
      screen.getByText(
        "新しいアドレスに確認メールを送ります。リンクを開くまでメールアドレスは変更されません",
      ),
    ).toBeInTheDocument();
  });

  it("送信ボタンがある", () => {
    render(
      <EmailSection currentEmail="old@example.test" action={noopAction} />,
    );

    expect(
      screen.getByRole("button", { name: "確認メールを送信" }),
    ).toBeInTheDocument();
  });

  it("エラーは alert として出る", async () => {
    const user = userEvent.setup();
    const errorAction: ProfileFormAction = async () => ({
      error: "テスト用のエラー",
      notice: null,
    });
    render(
      <EmailSection currentEmail="old@example.test" action={errorAction} />,
    );

    await user.type(
      screen.getByLabelText("新しいメールアドレス"),
      "new@example.test",
    );
    await user.click(screen.getByRole("button", { name: "確認メールを送信" }));

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
    render(
      <EmailSection currentEmail="old@example.test" action={noticeAction} />,
    );

    await user.type(
      screen.getByLabelText("新しいメールアドレス"),
      "new@example.test",
    );
    await user.click(screen.getByRole("button", { name: "確認メールを送信" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "テスト用の通知",
    );
  });
});
