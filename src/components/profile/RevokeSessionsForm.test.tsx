import { render, screen } from "@testing-library/react";
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
});
