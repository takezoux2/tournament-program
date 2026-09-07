import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProfileFormAction } from "@/features/user/state";
import { DeleteAccountForm } from "./DeleteAccountForm";

const noopAction: ProfileFormAction = async () => ({
  error: null,
  notice: null,
});

describe("DeleteAccountForm", () => {
  it("削除ボタンがある", () => {
    render(<DeleteAccountForm action={noopAction} />);

    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeInTheDocument();
  });

  it("この場では削除されず、メールのリンクで完了することを伝える", () => {
    render(<DeleteAccountForm action={noopAction} />);

    expect(
      screen.getByText(
        "確認メールのリンクを開くまで削除されません。削除すると所属している組織からも外れ、元に戻せません",
      ),
    ).toBeInTheDocument();
  });
});
