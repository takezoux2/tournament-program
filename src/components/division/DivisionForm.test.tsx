import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import { DivisionForm } from "./DivisionForm";

const noopAction: DivisionFormAction = async () => ({ error: null });

describe("DivisionForm", () => {
  it("試合形式を日本語ラベルの選択肢として出す", () => {
    render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    const select = screen.getByLabelText("試合形式");
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "シングルエリミネーション" }),
    ).toHaveValue("SINGLE_ELIMINATION");
    expect(
      screen.getByRole("option", { name: "リーグ（総当たり）" }),
    ).toHaveValue("ROUND_ROBIN");
  });

  it("作成時は divisionId を送らない", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );

    expect(container.querySelector('input[name="divisionId"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "作成する" }),
    ).toBeInTheDocument();
  });

  it("編集時は既定値と divisionId を持つ", () => {
    const { container } = render(
      <DivisionForm
        action={noopAction}
        slug="tennis"
        tournamentId="t1"
        submitLabel="保存する"
        defaultName="男子シングルス"
        defaultFormat="ROUND_ROBIN"
        divisionId="d1"
      />,
    );

    expect(screen.getByLabelText("部門名")).toHaveValue("男子シングルス");
    expect(screen.getByLabelText("試合形式")).toHaveValue("ROUND_ROBIN");
    expect(container.querySelector('input[name="divisionId"]')).toHaveValue(
      "d1",
    );
  });

  it("defaultResultConfig が無ければ設定欄を出さない", () => {
    render(
      <DivisionForm
        action={noopAction}
        slug="acme"
        tournamentId="t1"
        submitLabel="作成する"
      />,
    );
    expect(screen.queryByText("結果入力の設定")).not.toBeInTheDocument();
  });

  it("defaultResultConfig を渡すと現在の設定を初期値にした欄を出す", () => {
    const config = {
      version: 1 as const,
      winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
      score: { enabled: false, count: 5, aggregation: "average" as const },
      note: { enabled: true },
    };

    render(
      <DivisionForm
        action={noopAction}
        slug="acme"
        tournamentId="t1"
        submitLabel="保存する"
        divisionId="d1"
        defaultResultConfig={config}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "勝因を記録する" }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "勝因の選択肢（1行1項目）" }),
    ).toHaveValue("一本勝ち\n判定勝ち");
    expect(
      screen.getByRole("checkbox", { name: "スコアを記録する" }),
    ).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "スコア欄の数" })).toHaveValue(
      "5",
    );
    expect(screen.getByRole("radio", { name: "平均" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "メモを記録する" }),
    ).toBeChecked();
  });

  it("メモが公開ページにも出ることを伝える", () => {
    render(
      <DivisionForm
        action={noopAction}
        slug="acme"
        tournamentId="t1"
        submitLabel="保存する"
        divisionId="d1"
        defaultResultConfig={{
          version: 1,
          winReason: { enabled: false, options: [] },
          score: { enabled: false, count: 3, aggregation: "sum" },
          note: { enabled: false },
        }}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "メモを記録する" }),
    ).toHaveAccessibleDescription("メモは公開ページにも表示されます");
  });
});
