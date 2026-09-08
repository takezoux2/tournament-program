import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

  it("エラーは alert として出る", async () => {
    const user = userEvent.setup();
    const errorAction: ProfileFormAction = async () => ({
      error: "テスト用のエラー",
      notice: null,
    });
    render(
      <LinkedAccountsSection
        google={null}
        hasPassword
        linkAction={errorAction}
        unlinkAction={noopAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Google と連携する" }));

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
      <LinkedAccountsSection
        google={null}
        hasPassword
        linkAction={noticeAction}
        unlinkAction={noopAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Google と連携する" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "テスト用の通知",
    );
  });

  it("未連携なら linkAction を呼び、unlinkAction は呼ばない", async () => {
    const user = userEvent.setup();
    const link = vi.fn<ProfileFormAction>(async () => ({
      error: null,
      notice: "連携しました",
    }));
    const unlink = vi.fn<ProfileFormAction>(async () => ({
      error: null,
      notice: "解除しました",
    }));
    render(
      <LinkedAccountsSection
        google={null}
        hasPassword
        linkAction={link}
        unlinkAction={unlink}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Google と連携する" }));

    await screen.findByRole("status");
    expect(link).toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it("連携済みなら unlinkAction を呼び、linkAction は呼ばない", async () => {
    const user = userEvent.setup();
    const link = vi.fn<ProfileFormAction>(async () => ({
      error: null,
      notice: "連携しました",
    }));
    const unlink = vi.fn<ProfileFormAction>(async () => ({
      error: null,
      notice: "解除しました",
    }));
    render(
      <LinkedAccountsSection
        google={google}
        hasPassword
        linkAction={link}
        unlinkAction={unlink}
      />,
    );

    await user.click(screen.getByRole("button", { name: "連携を解除" }));

    await screen.findByRole("status");
    expect(unlink).toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });
});
