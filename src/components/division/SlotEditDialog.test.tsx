import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  DivisionFormAction,
  DivisionFormState,
} from "@/features/division/state";
import { SlotEditDialog } from "./SlotEditDialog";

// jsdom は <dialog> の showModal / close を実装していない（ConfirmDialog.test.tsx と同じ）。
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const succeed = vi.fn(async (prev: DivisionFormState) => ({
  error: null,
  succeeded: (prev.succeeded ?? 0) + 1,
}));

const props = (overrides: Partial<Parameters<typeof SlotEditDialog>[0]> = {}) => ({
  target: {
    matchId: "m1-0",
    slotIndex: 1 as const,
    matchName: "第1試合",
    occupantName: "佐藤 蓮",
  },
  slug: "acme",
  tournamentId: "t1",
  divisionId: "d1",
  members: [{ id: "m-2", name: "鈴木 陽菜", nameKana: "すずき はるな" }],
  actions: { assignSlot: succeed, clearSlot: succeed, removeMatch: succeed },
  onClose: vi.fn(),
  ...overrides,
});

describe("SlotEditDialog", () => {
  it("開いた時点でモーダルを表示し、対象を見出しに出す", () => {
    render(<SlotEditDialog {...props()} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByText("第1試合 の下側")).toBeInTheDocument();
    expect(screen.getByText("現在: 佐藤 蓮")).toBeInTheDocument();
  });

  it("既存メンバーを選んで送ると assignSlot に対象スロットとメンバーが渡り、閉じる", async () => {
    const assignSlot = vi.fn<DivisionFormAction>(succeed);
    const onClose = vi.fn();
    render(
      <SlotEditDialog
        {...props({
          onClose,
          actions: { assignSlot, clearSlot: succeed, removeMatch: succeed },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "この選手にする" }));
    await waitFor(() => expect(assignSlot).toHaveBeenCalled());
    const data = assignSlot.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      slug: "acme",
      tournamentId: "t1",
      divisionId: "d1",
      matchId: "m1-0",
      slotIndex: "1",
      mode: "existing",
      memberId: "m-2",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("空のスロットでは「スロットを空にする」を出さない", () => {
    render(
      <SlotEditDialog
        {...props({
          target: {
            matchId: "m1-0",
            slotIndex: 0,
            matchName: null,
            occupantName: null,
          },
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "スロットを空にする" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("現在: 空き")).toBeInTheDocument();
  });

  it("試合を削除すると removeMatch に matchId が渡る", async () => {
    const removeMatch = vi.fn<DivisionFormAction>(succeed);
    render(
      <SlotEditDialog
        {...props({
          actions: { assignSlot: succeed, clearSlot: succeed, removeMatch },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "試合を削除" }));
    await waitFor(() => expect(removeMatch).toHaveBeenCalled());
    expect((removeMatch.mock.calls[0][1] as FormData).get("matchId")).toBe(
      "m1-0",
    );
  });

  it("失敗したら閉じずにエラーを出す", async () => {
    const fail = vi.fn(async () => ({
      error: "その参加者はすでにエントリーしています",
    }));
    const onClose = vi.fn();
    render(
      <SlotEditDialog
        {...props({
          onClose,
          actions: { assignSlot: fail, clearSlot: succeed, removeMatch: succeed },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "この選手にする" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "その参加者はすでにエントリーしています",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("メンバーが居なければ新規登録だけを出す", () => {
    render(<SlotEditDialog {...props({ members: [] })} />);
    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.queryByLabelText("メンバー")).not.toBeInTheDocument();
  });
});
