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
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const succeed = vi.fn(async (prev: DivisionFormState) => ({
  error: null,
  succeeded: (prev.succeeded ?? 0) + 1,
}));

const props = (
  overrides: Partial<Parameters<typeof SlotEditDialog>[0]> = {},
) => ({
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
  sourceOptions: [],
  ...overrides,
});

const sourceOptions = [
  {
    divisionId: "d1",
    divisionName: "予選トーナメント",
    format: "SINGLE_ELIMINATION" as const,
    matches: [{ matchId: "q1", label: "第1試合" }],
    maxRank: 0,
  },
  {
    divisionId: "d2",
    divisionName: "予選リーグA",
    format: "ROUND_ROBIN" as const,
    matches: [{ matchId: "n1", label: "第2試合" }],
    maxRank: 3,
  },
];

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
    await userEvent.click(
      screen.getByRole("button", { name: "この選手にする" }),
    );
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
          actions: {
            assignSlot: fail,
            clearSlot: succeed,
            removeMatch: succeed,
          },
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "この選手にする" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "その参加者はすでにエントリーしています",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("前の操作のエラーではなく、最後に送った操作のエラーを出す", async () => {
    const failAssign = vi.fn(async () => ({
      error: "その参加者はすでにエントリーしています",
    }));
    const failClear = vi.fn(async () => ({
      error: "勝敗が記録されているため変更できません",
    }));
    render(
      <SlotEditDialog
        {...props({
          actions: {
            assignSlot: failAssign,
            clearSlot: failClear,
            removeMatch: succeed,
          },
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "この選手にする" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "その参加者はすでにエントリーしています",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "スロットを空にする" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "勝敗が記録されているため変更できません",
      ),
    );
  });

  it("メンバーが居なければ新規登録だけを出す", () => {
    render(<SlotEditDialog {...props({ members: [] })} />);
    expect(screen.getByLabelText("氏名")).toBeInTheDocument();
    expect(screen.queryByLabelText("メンバー")).not.toBeInTheDocument();
  });

  it("他部門の試合を選ぶモードでは試合と勝者・敗者を選べる", async () => {
    render(<SlotEditDialog {...props({ sourceOptions })} />);

    await userEvent.click(
      screen.getByRole("radio", { name: "他部門の試合の結果" }),
    );

    expect(screen.getByLabelText("参照する部門")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "第1試合" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "勝者" })).toBeChecked();
  });

  it("リーグ順位モードではリーグの部門だけが選べる", async () => {
    render(<SlotEditDialog {...props({ sourceOptions })} />);

    await userEvent.click(
      screen.getByRole("radio", { name: "他部門のリーグ順位" }),
    );

    const select = screen.getByLabelText("参照するリーグ");
    expect(select).toHaveValue("d2");
    expect(
      screen.queryByRole("option", { name: "予選トーナメント" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("順位")).toHaveAttribute("max", "3");
  });

  it("参照先が無ければモードのラジオを出さない", () => {
    render(<SlotEditDialog {...props({ sourceOptions: [] })} />);

    expect(
      screen.queryByRole("radio", { name: "他部門の試合の結果" }),
    ).not.toBeInTheDocument();
  });
});
