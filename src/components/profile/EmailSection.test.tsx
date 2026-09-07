import { render, screen } from "@testing-library/react";
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
});
