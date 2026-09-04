import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { EntryList } from "./EntryList";

const entries: DivisionEntry[] = [
  { id: "e1", participantId: "p1", seed: 0 },
  { id: "e2", participantId: "p2", seed: 1 },
];

const participants = [
  { id: "p1", name: "山田太郎", nameKana: "やまだたろう", playerNumber: "1" },
  { id: "p2", name: "佐藤花子", nameKana: "さとうはなこ", playerNumber: "2" },
];

const props = {
  entries,
  participants,
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  reorderAction: vi.fn(async () => ({ error: null })),
  removeAction: vi.fn(async () => ({ error: null })),
  disabled: false,
};

describe("EntryList", () => {
  it("エントリーが無ければその旨を出す", () => {
    render(<EntryList {...props} entries={[]} />);

    expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument();
  });

  it("渡された順に氏名とかなを並べる", () => {
    render(<EntryList {...props} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("山田太郎")).toBeInTheDocument();
    expect(within(rows[0]).getByText("やまだたろう")).toBeInTheDocument();
    expect(within(rows[1]).getByText("佐藤花子")).toBeInTheDocument();
  });

  it("参加者を引けない行は代わりの文言を出す", () => {
    render(<EntryList {...props} participants={[]} />);

    expect(screen.getAllByText("（不明な参加者）")).toHaveLength(2);

    // 文言だけの断片に差し替わっていないか、行そのものが残っているかを確認する。
    // 参加者が引けなくても編集を続けられることが目的なので、
    // 行が消えて操作ボタンだけ無くなるような実装はここで落ちる必要がある。
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByLabelText("削除")).toBeInTheDocument();
      expect(within(row).getByLabelText("上へ移動")).toBeInTheDocument();
      expect(within(row).getByLabelText("下へ移動")).toBeInTheDocument();
    }
  });

  it("並べ替えと削除は別々のフォームに分かれている", () => {
    render(<EntryList {...props} />);

    const row = screen.getAllByRole("listitem")[0];

    // 並べ替え用フォームと削除用フォームの 2 つが独立して存在すること。
    expect(row.querySelectorAll("form")).toHaveLength(2);

    // 削除ボタンを包む form の中に direction という名前の要素が無いこと。
    // 同じフォームにまとめると削除の送信にも direction が乗ってしまい、
    // サーバー側が期待する契約と食い違うため、ここが本質的な要求になる。
    const deleteButton = within(row).getByLabelText("削除");
    const deleteForm = deleteButton.closest("form");
    expect(deleteForm).not.toBeNull();
    expect(deleteForm?.querySelector('[name="direction"]')).toBeNull();
  });

  it("先頭では上へ、末尾では下へ動かせない", () => {
    render(<EntryList {...props} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByLabelText("上へ移動")).toBeDisabled();
    expect(within(rows[0]).getByLabelText("下へ移動")).toBeEnabled();
    expect(within(rows[1]).getByLabelText("上へ移動")).toBeEnabled();
    expect(within(rows[1]).getByLabelText("下へ移動")).toBeDisabled();
  });

  it("削除すると組み合わせが作り直されることを伝える", () => {
    render(<EntryList {...props} />);

    expect(
      screen.getByText("削除すると組み合わせが変わることがあります"),
    ).toBeInTheDocument();
  });

  it("disabled なら削除ボタンを押せない", () => {
    render(<EntryList {...props} disabled />);

    for (const button of screen.getAllByLabelText("削除")) {
      expect(button).toBeDisabled();
    }
  });
});
