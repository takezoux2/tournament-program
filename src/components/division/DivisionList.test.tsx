import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionSummary } from "@/features/division/repository";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionList } from "./DivisionList";

const noopAction: DivisionFormAction = async () => ({ error: null });

const divisions: DivisionSummary[] = [
  { id: "d1", name: "男子シングルス", order: 0, format: "SINGLE_ELIMINATION" },
  { id: "d2", name: "女子シングルス", order: 1, format: "ROUND_ROBIN" },
  {
    id: "d3",
    name: "決勝トーナメント",
    order: 2,
    format: "DOUBLE_ELIMINATION_GRAND_FINAL",
  },
];

const renderList = (items: DivisionSummary[]) =>
  render(
    <DivisionList
      slug="tennis"
      tournamentId="t1"
      divisions={items}
      reorderAction={noopAction}
    />,
  );

describe("DivisionList", () => {
  it("部門名を詳細ページへのリンクとして表示する", () => {
    renderList(divisions);

    expect(
      screen.getByRole("link", { name: "男子シングルス" }),
    ).toHaveAttribute("href", "/orgs/tennis/tournaments/t1/divisions/d1");
  });

  it("試合形式を日本語ラベルで出す", () => {
    renderList(divisions);

    expect(screen.getByText("シングルエリミネーション")).toBeInTheDocument();
    expect(screen.getByText("リーグ（総当たり）")).toBeInTheDocument();
  });

  it("先頭は上へ、末尾は下へを押せなくする", () => {
    renderList(divisions);

    const up = screen.getAllByRole("button", { name: "上へ移動" });
    const down = screen.getAllByRole("button", { name: "下へ移動" });

    expect(up[0]).toBeDisabled();
    expect(up[1]).toBeEnabled();
    expect(down[2]).toBeDisabled();
    expect(down[1]).toBeEnabled();
  });

  it("1 件だけならどちらへも動かせない", () => {
    renderList([divisions[0]]);

    expect(screen.getByRole("button", { name: "上へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下へ移動" })).toBeDisabled();
  });

  it("部門が無いときは空であることを伝える", () => {
    renderList([]);

    expect(screen.getByText("まだ部門がありません")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
