import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary } from "@/features/member/repository";
import { MemberList } from "./MemberList";

const removeAction = vi.fn(async () => ({ error: null }));

const members: MemberSummary[] = [
  { id: "m1", name: "竹添", nameKana: "たけぞえ" },
  { id: "m2", name: "山田", nameKana: "やまだ" },
];

const renderList = (
  overrides: Partial<Parameters<typeof MemberList>[0]> = {},
) =>
  render(
    <MemberList
      slug="tennis"
      members={members}
      canRemove={true}
      removeAction={removeAction}
      {...overrides}
    />,
  );

describe("MemberList", () => {
  beforeEach(() => {
    removeAction.mockClear();
  });

  it("メンバーの氏名とかなを出す", () => {
    renderList();

    expect(screen.getByText("竹添")).toBeInTheDocument();
    expect(screen.getByText("たけぞえ")).toBeInTheDocument();
  });

  it("canRemove が false なら削除ボタンを出さない", () => {
    renderList({ canRemove: false });

    expect(screen.queryByRole("button", { name: /削除/ })).toBeNull();
  });

  it("メンバーが 0 人なら案内を出す", () => {
    renderList({ members: [] });

    expect(
      screen.getByText("この組織に登録されているメンバーはいません"),
    ).toBeInTheDocument();
  });

  describe("削除の確認ダイアログ", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("確認をキャンセルすると削除アクションを呼ばない", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "竹添 を削除" }));

      expect(removeAction).not.toHaveBeenCalled();
    });

    it("確認を承諾すると削除アクションを呼ぶ", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderList();

      await user.click(screen.getByRole("button", { name: "竹添 を削除" }));

      expect(removeAction).toHaveBeenCalled();
    });
  });
});
