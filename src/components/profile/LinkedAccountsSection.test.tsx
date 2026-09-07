import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { LinkedAccountsSection } from "./LinkedAccountsSection";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

const google = { accountId: "a2", linkedAt: new Date("2026-09-02T00:00:00Z") };

describe("LinkedAccountsSection", () => {
  it("未連携なら連携ボタンを出す", () => {
    render(
      <LinkedAccountsSection
        google={null}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Google と連携する" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "連携を解除" })).toBeNull();
  });

  it("連携済みなら解除ボタンと連携日を出す", () => {
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "連携を解除" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026\/9\/2 連携/)).toBeInTheDocument();
  });

  it("パスワード未設定なら解除ボタンを押せなくし、理由を書く", () => {
    // 押しても Better Auth が FAILED_TO_UNLINK_LAST_ACCOUNT で拒むが、
    // 押す前に理由が読めるほうが親切。境界は依然サーバ側にある。
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword={false}
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(screen.getByRole("button", { name: "連携を解除" })).toBeDisabled();
    expect(
      screen.getByText(
        "唯一のログイン方法のため解除できません。先にパスワードを設定してください",
      ),
    ).toBeInTheDocument();
  });

  it("パスワード設定済みなら解除ボタンを押せる", () => {
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword
        linkAction={noopAction}
        unlinkAction={noopAction}
      />,
    );

    expect(screen.getByRole("button", { name: "連携を解除" })).toBeEnabled();
  });
});
