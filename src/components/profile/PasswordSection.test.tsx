import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { PasswordSection } from "./PasswordSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("PasswordSection", () => {
  it("パスワード設定済みなら、現在のパスワードを聞く変更フォームを出す", () => {
    render(
      <PasswordSection
        hasPassword
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.getByLabelText("現在のパスワード")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "パスワードを変更" }),
    ).toBeInTheDocument();
  });

  it("パスワード未設定なら、現在のパスワードを聞かない設定フォームを出す", () => {
    render(
      <PasswordSection
        hasPassword={false}
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.queryByLabelText("現在のパスワード")).toBeNull();
    expect(
      screen.getByRole("button", { name: "パスワードを設定" }),
    ).toBeInTheDocument();
  });

  it("未設定のときは、設定するとどう変わるかを伝える", () => {
    render(
      <PasswordSection
        hasPassword={false}
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(
      screen.getByText(
        "設定すると、メールアドレスとパスワードでもログインできるようになります",
      ),
    ).toBeInTheDocument();
  });

  it("新しいパスワードの入力欄には new-password の autoComplete を付ける", () => {
    render(
      <PasswordSection
        hasPassword
        changeAction={noopAction}
        setAction={noopAction}
      />,
    );

    expect(screen.getByLabelText("新しいパスワード")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("エラーは alert として出る", async () => {
    const user = userEvent.setup();
    const errorAction: ProfileFormAction = async () => ({
      error: "テスト用のエラー",
      notice: null,
    });
    render(
      <PasswordSection
        hasPassword={false}
        changeAction={errorAction}
        setAction={errorAction}
      />,
    );

    await user.type(screen.getByLabelText("新しいパスワード"), "password123");
    await user.click(screen.getByRole("button", { name: "パスワードを設定" }));

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
      <PasswordSection
        hasPassword={false}
        changeAction={noticeAction}
        setAction={noticeAction}
      />,
    );

    await user.type(screen.getByLabelText("新しいパスワード"), "password123");
    await user.click(screen.getByRole("button", { name: "パスワードを設定" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "テスト用の通知",
    );
  });
});
