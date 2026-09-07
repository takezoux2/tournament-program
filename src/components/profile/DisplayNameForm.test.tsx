import { render, screen } from "@testing-library/react";
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
});
