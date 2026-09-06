import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  DivisionFormAction,
  DivisionFormState,
} from "@/features/division/state";
import { EntryRowActions } from "./EntryRowActions";

const props = {
  reorderAction: vi.fn(async () => ({ error: null })),
  removeAction: vi.fn(async () => ({ error: null })),
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  entryId: "e1",
  canMoveUp: true,
  canMoveDown: true,
  disabled: false,
};

describe("EntryRowActions", () => {
  it("削除の通知を画面に出す", async () => {
    // handler が返す notice を出す先はここしかない。出さないと
    // 「組み合わせが作り直された」ことが誰にも伝わらない。
    const removeAction = vi.fn(
      async (): Promise<DivisionFormState> => ({
        error: null,
        notice: "エントリーを削除し、組み合わせを再生成しました",
      }),
    );
    render(<EntryRowActions {...props} removeAction={removeAction} />);

    await userEvent.click(screen.getByLabelText("削除"));

    // 暗黙のロールが status な <output> で出す。読み上げに乗る形であることまで見る。
    expect(await screen.findByRole("status")).toHaveTextContent(
      "エントリーを削除し、組み合わせを再生成しました",
    );
  });

  it("並べ替えの通知も画面に出す", async () => {
    // handler が返す notice は削除だけでなく並べ替えでも起こりうる
    // （リーグの再生成、または上限超過による取り消し）。今まではここに
    // 出す先が無く、reorder-entry/handler.ts の notice が画面に届いて
    // いなかった。
    const reorderAction = vi.fn(
      async (): Promise<DivisionFormState> => ({
        error: null,
        notice: "並べ替えに合わせて対戦表を作り直しました",
      }),
    );
    render(<EntryRowActions {...props} reorderAction={reorderAction} />);

    await userEvent.click(screen.getByLabelText("下へ移動"));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "並べ替えに合わせて対戦表を作り直しました",
    );
  });

  it("並べ替えのあとに削除すると、新しい通知だけを表示する", async () => {
    // reorderState と removeState は別々の useActionState なので、片方を
    // 更新してももう片方の notice は古いまま残る。両方をそのまま並べて出すと
    // この操作で 2 行の <output role="status"> が同じ行に残ってしまう。
    const reorderAction = vi.fn(
      async (): Promise<DivisionFormState> => ({
        error: null,
        notice: "並べ替えに合わせて対戦表を作り直しました",
      }),
    );
    const removeAction = vi.fn(
      async (): Promise<DivisionFormState> => ({
        error: null,
        notice: "エントリーを削除し、組み合わせを再生成しました",
      }),
    );
    render(
      <EntryRowActions
        {...props}
        reorderAction={reorderAction}
        removeAction={removeAction}
      />,
    );

    await userEvent.click(screen.getByLabelText("下へ移動"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "並べ替えに合わせて対戦表を作り直しました",
    );

    await userEvent.click(screen.getByLabelText("削除"));
    const statuses = await screen.findAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(
      "エントリーを削除し、組み合わせを再生成しました",
    );
  });

  it("通知が無ければ何も出さない", async () => {
    const removeAction = vi.fn(
      async (): Promise<DivisionFormState> => ({ error: null }),
    );
    render(<EntryRowActions {...props} removeAction={removeAction} />);

    await userEvent.click(screen.getByLabelText("削除"));

    expect(removeAction).toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("削除は entryId を載せて送る", async () => {
    // remove-entry/handler.ts が formData.get("entryId") で読む名前。
    // 型では守られない境界なので、送る側でも固定しておく。
    const removeAction = vi.fn<DivisionFormAction>(async () => ({
      error: null,
    }));
    render(<EntryRowActions {...props} removeAction={removeAction} />);

    await userEvent.click(screen.getByLabelText("削除"));

    const sent = removeAction.mock.calls[0][1];
    expect(sent.get("entryId")).toBe("e1");
    expect(sent.get("slug")).toBe("acme");
    expect(sent.get("tournamentId")).toBe("t1");
    expect(sent.get("divisionId")).toBe("d1");
  });

  it("並べ替えは entryId と押した向きを載せて送る", async () => {
    // direction は押された submit ボタンの value として乗る。
    // reorder-entry/handler.ts が読む名前と値をここで固定する。
    const reorderAction = vi.fn<DivisionFormAction>(async () => ({
      error: null,
    }));
    render(<EntryRowActions {...props} reorderAction={reorderAction} />);

    await userEvent.click(screen.getByLabelText("下へ移動"));

    const sent = reorderAction.mock.calls[0][1];
    expect(sent.get("entryId")).toBe("e1");
    expect(sent.get("direction")).toBe("down");
  });

  it("エラーは通知とは別に出す", async () => {
    const removeAction = vi.fn(
      async (): Promise<DivisionFormState> => ({ error: "消せませんでした" }),
    );
    render(<EntryRowActions {...props} removeAction={removeAction} />);

    await userEvent.click(screen.getByLabelText("削除"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "消せませんでした",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
