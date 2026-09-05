import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  ScheduleFormAction,
  ScheduleFormState,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { ScheduleList } from "./ScheduleList";

const rows: ScheduleRowView[] = [
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: null,
  },
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchNumber: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
];

const noop = async (): Promise<ScheduleFormState> => ({ error: null });

const renderList = (
  overrides: {
    rows?: ScheduleRowView[];
    insertDividerAction?: ScheduleFormAction;
  } = {},
) =>
  render(
    <ScheduleList
      slug="acme"
      tournamentId="t1"
      rows={overrides.rows ?? rows}
      reorderAction={noop}
      insertDividerAction={overrides.insertDividerAction ?? noop}
      updateDividerAction={noop}
      removeDividerAction={noop}
    />,
  );

describe("ScheduleList", () => {
  it("試合行に試合番号・対戦カード・部門名を出す", () => {
    renderList();

    expect(screen.getByText("第1試合")).toBeInTheDocument();
    expect(screen.getByText("山田 vs 佐藤")).toBeInTheDocument();
    expect(
      screen.getByText("男子シングルス / 1回戦 第1試合"),
    ).toBeInTheDocument();
  });

  it("区切り行を編集できる形で出す", () => {
    renderList();

    expect(screen.getByLabelText("区切りの見出し")).toHaveValue("午前の部");
    expect(screen.getByLabelText("区切りの開始予定時刻")).toHaveValue("");
  });

  it("試合が無ければその旨を出す", () => {
    renderList({ rows: [] });

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });

  it("先頭への挿入は空文字のアンカーを送る", async () => {
    const anchors: (string | null)[] = [];
    const insertDividerAction = vi.fn(
      async (_state: ScheduleFormState, data: FormData) => {
        anchors.push(data.get("anchorKey") as string | null);
        return { error: null };
      },
    );
    renderList({ insertDividerAction });

    await userEvent.click(
      screen.getByRole("button", { name: "先頭に区切りを挿入" }),
    );

    expect(anchors).toEqual([""]);
  });

  it("行の挿入ボタンはその行のキーをアンカーに送る", async () => {
    const anchors: (string | null)[] = [];
    const insertDividerAction = vi.fn(
      async (_state: ScheduleFormState, data: FormData) => {
        anchors.push(data.get("anchorKey") as string | null);
        return { error: null };
      },
    );
    renderList({ insertDividerAction });

    const buttons = screen.getAllByRole("button", {
      name: "この下に区切りを挿入",
    });
    await userEvent.click(buttons[1]);

    expect(anchors).toEqual(["match:dA:m1-0"]);
  });
});
