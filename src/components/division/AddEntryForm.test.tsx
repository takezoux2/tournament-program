import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddEntryForm } from "./AddEntryForm";

const members = [
  { id: "m1", name: "山田太郎", nameKana: "やまだたろう" },
  { id: "m2", name: "佐藤花子", nameKana: "さとうはなこ" },
];

const props = {
  action: vi.fn(async () => ({ error: null })),
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  members,
  disabled: false,
};

describe("AddEntryForm", () => {
  it("既存メンバーの選択を初期表示にする", () => {
    render(<AddEntryForm {...props} />);

    expect(screen.getByLabelText("既存のメンバーから選ぶ")).toBeChecked();
    expect(screen.getByLabelText("メンバー")).toBeInTheDocument();
    expect(screen.queryByLabelText("氏名")).not.toBeInTheDocument();
  });

  it("メンバーを選択肢として並べる", () => {
    render(<AddEntryForm {...props} />);

    expect(
      screen.getByRole("option", { name: "山田太郎" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "佐藤花子" }),
    ).toBeInTheDocument();
  });

  it("新規登録へ切り替えると氏名とかなの入力が出る", async () => {
    const user = userEvent.setup();
    render(<AddEntryForm {...props} />);

    await user.click(screen.getByLabelText("新しく登録する"));

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.getByLabelText("氏名（かな）")).toBeInTheDocument();
    expect(screen.queryByLabelText("メンバー")).not.toBeInTheDocument();
  });

  it("メンバーが 1 人も居なければ新規登録だけを見せる", () => {
    render(<AddEntryForm {...props} members={[]} />);

    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("既存のメンバーから選ぶ"),
    ).not.toBeInTheDocument();
  });

  it("disabled なら追加ボタンを押せない", () => {
    render(<AddEntryForm {...props} disabled />);

    expect(
      screen.getByRole("button", { name: "エントリーを追加" }),
    ).toBeDisabled();
  });

  it("id と mode を hidden で送る", async () => {
    const { container } = render(<AddEntryForm {...props} />);

    expect(container.querySelector('input[name="slug"]')).toHaveValue("acme");
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(
      "t1",
    );
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );

    // mode は add-entry の discriminatedUnion の判別子。名前も値も
    // スキーマ側と一致していなければ、切り替えたつもりの分岐が丸ごと落ちる。
    // 型では守られない境界なので、両方の値をここで固定する。
    expect(container.querySelector('input[name="mode"]')).toHaveValue(
      "existing",
    );

    await userEvent.click(screen.getByLabelText("新しく登録する"));

    expect(container.querySelector('input[name="mode"]')).toHaveValue("new");
  });
});
