import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddMemberForm } from "./AddMemberForm";

describe("AddMemberForm", () => {
  it("氏名とかなの入力欄と追加ボタンを出す", () => {
    render(<AddMemberForm slug="tennis" addAction={vi.fn()} />);

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.getByLabelText("氏名（かな）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("送信すると slug と入力値がアクションへ渡る", async () => {
    const addAction = vi.fn(async (_state, formData: FormData) => {
      expect(formData.get("slug")).toBe("tennis");
      expect(formData.get("name")).toBe("竹添");
      expect(formData.get("nameKana")).toBe("たけぞえ");
      return { error: null };
    });
    const user = userEvent.setup();
    render(<AddMemberForm slug="tennis" addAction={addAction} />);

    await user.type(screen.getByLabelText("氏名"), "竹添");
    await user.type(screen.getByLabelText("氏名（かな）"), "たけぞえ");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(addAction).toHaveBeenCalled();
  });

  it("アクションがエラーを返したら表示する", async () => {
    const addAction = vi.fn(async () => ({
      error: "氏名を入力してください",
    }));
    const user = userEvent.setup();
    render(<AddMemberForm slug="tennis" addAction={addAction} />);

    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "氏名を入力してください",
    );
  });
});
