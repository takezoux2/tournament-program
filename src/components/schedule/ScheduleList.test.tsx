import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ScheduleFormAction,
  ScheduleFormState,
} from "@/features/schedule/state";
import type { ScheduleRowView } from "@/features/schedule/types";
import { ScheduleList } from "./ScheduleList";

/**
 * ドラッグそのものは jsdom では起こせない（@dnd-kit は要素の実寸を測って
 * 落とし先を決めるが、jsdom の矩形はすべて 0 になる）。そこで DndContext を
 * 素通しの薄い包みに差し替えて onDragEnd だけ掴み、コンポーネント側の
 * ドロップ後の処理（並べ替えの計算と FormData の組み立て）を本物のまま動かす。
 */
const dnd = vi.hoisted(() => ({
  dragEnd: null as ((event: DragEndEvent) => void) | null,
}));

vi.mock("@dnd-kit/core", async () => {
  const actual =
    await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      dnd.dragEnd = props.onDragEnd ?? null;
      return createElement(actual.DndContext, props);
    },
  };
});

const dropOn = async (activeId: string, overId: string): Promise<void> => {
  const handler = dnd.dragEnd;
  if (handler === null) {
    throw new Error("DndContext に onDragEnd が渡っていない");
  }
  await act(async () => {
    handler({
      active: { id: activeId },
      over: { id: overId },
    } as DragEndEvent);
  });
};

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
    reorderAction?: ScheduleFormAction;
    insertDividerAction?: ScheduleFormAction;
  } = {},
) =>
  render(
    <ScheduleList
      slug="acme"
      tournamentId="t1"
      rows={overrides.rows ?? rows}
      reorderAction={overrides.reorderAction ?? noop}
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

    expect(
      screen.getByLabelText("1行目 区切り「午前の部」の見出し"),
    ).toHaveValue("午前の部");
    expect(
      screen.getByLabelText("1行目 区切り「午前の部」の開始予定時刻"),
    ).toHaveValue("");
  });

  it("行ごとの操作にはその行の名前を付ける", () => {
    // 区切りは複数置ける。固定文言のままだと支援技術には同じ名前の操作が並ぶ。
    renderList();

    expect(
      screen.getByRole("button", {
        name: "1行目 区切り「午前の部」をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "2行目 男子シングルス 1回戦 第1試合をドラッグして並べ替え",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "1行目 区切り「午前の部」の下に区切りを挿入",
      }),
    ).toBeInTheDocument();
  });

  it("見出しが同じ区切りが並んでも操作の名前は重ならない", () => {
    // 挿入直後の区切りは既定の見出しのまま。見出しだけを名前にすると、
    // 2 つ目を挿した時点で支援技術には同じ名前の操作が並ぶ。
    const duplicated: ScheduleRowView[] = [
      {
        kind: "divider",
        key: "divider:s1",
        id: "s1",
        label: "区切り",
        startsAt: null,
      },
      {
        kind: "divider",
        key: "divider:s2",
        id: "s2",
        label: "区切り",
        startsAt: null,
      },
    ];
    renderList({ rows: duplicated });

    for (const position of [1, 2]) {
      const name = `${position}行目 区切り「区切り」`;
      expect(
        screen.getByRole("button", { name: `${name}をドラッグして並べ替え` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `${name}の下に区切りを挿入` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `${name}を保存` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `${name}を削除` }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(`${name}の見出し`)).toBeInTheDocument();
      expect(
        screen.getByLabelText(`${name}の開始予定時刻`),
      ).toBeInTheDocument();
    }
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

    await userEvent.click(
      screen.getByRole("button", {
        name: "2行目 男子シングルス 1回戦 第1試合の下に区切りを挿入",
      }),
    );

    expect(anchors).toEqual(["match:dA:m1-0"]);
  });

  it("並べ替えは移動後の全キーを key として積んで送る", async () => {
    // サーバ側は getAll("key") で並びを読む。1 件ずつ append することが仕様。
    const sent: FormData[] = [];
    const reorderAction = async (_state: ScheduleFormState, data: FormData) => {
      sent.push(data);
      return { error: null };
    };
    renderList({ reorderAction });

    await dropOn("match:dA:m1-0", "divider:s1");

    expect(sent).toHaveLength(1);
    expect(sent[0].get("slug")).toBe("acme");
    expect(sent[0].get("tournamentId")).toBe("t1");
    expect(sent[0].getAll("key")).toEqual(["match:dA:m1-0", "divider:s1"]);
  });

  it("保存中は掴めなくして、その旨を出す", async () => {
    // 保存の途中でもう一度掴めると、更新前の props の並びから計算した並びで
    // 上書きしてしまい、先の並べ替えが消える。
    let finish: (state: ScheduleFormState) => void = () => {};
    const reorderAction = () =>
      new Promise<ScheduleFormState>((resolve) => {
        finish = resolve;
      });
    renderList({ reorderAction });

    await dropOn("match:dA:m1-0", "divider:s1");

    expect(screen.getByText("並べ替えを保存中...")).toBeInTheDocument();
    for (const handle of screen.getAllByRole("button", {
      name: /ドラッグして並べ替え$/,
    })) {
      expect(handle).toBeDisabled();
    }

    await act(async () => {
      finish({ error: null });
    });

    expect(
      screen.getByText("左端をドラッグすると進行順を入れ替えられます"),
    ).toBeInTheDocument();
  });
});
