import type { DndContextProps, DragEndEvent } from "@dnd-kit/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

/** overId が null なら「どこにも落とさなかった」ドロップ。 */
const dropOn = async (
  activeId: string,
  overId: string | null,
): Promise<void> => {
  const handler = dnd.dragEnd;
  if (handler === null) {
    throw new Error("DndContext に onDragEnd が渡っていない");
  }
  await act(async () => {
    handler({
      active: { id: activeId },
      over: overId === null ? null : { id: overId },
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
    startsAtInput: "",
  },
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子シングルス",
    matchId: "m1-0",
    matchName: "1",
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
    updateDividerAction?: ScheduleFormAction;
    removeDividerAction?: ScheduleFormAction;
  } = {},
) =>
  render(
    <ScheduleList
      slug="acme"
      tournamentId="t1"
      rows={overrides.rows ?? rows}
      reorderAction={overrides.reorderAction ?? noop}
      insertDividerAction={overrides.insertDividerAction ?? noop}
      updateDividerAction={overrides.updateDividerAction ?? noop}
      removeDividerAction={overrides.removeDividerAction ?? noop}
    />,
  );

/** 送られた FormData を溜めるだけの Server Action の替え玉。 */
const recordingAction =
  (sent: FormData[]): ScheduleFormAction =>
  async (_state: ScheduleFormState, data: FormData) => {
    sent.push(data);
    return { error: null };
  };

describe("ScheduleList", () => {
  it("試合行に試合名・対戦カード・部門名を出す", () => {
    renderList();

    expect(screen.getByText("1")).toBeInTheDocument();
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

  it("開始予定時刻はサーバで組み立てた文字列をそのまま出す", () => {
    // 画面側で Date から組み立てるとブラウザの時刻帯になり、受け取って
    // new Date するサーバの時刻帯とずれる。運ばれてきた文字列をそのまま
    // value にしていることをここで固定する。
    //
    // startsAtInput には startsAt からはどの時刻帯でも作れない日付を置く。
    // 時差ぶんだけずらした値（例えば UTC の 0 時に対する JST の 9 時）だと、
    // 画面側で組み立て直す実装に戻しても JST の環境では同じ文字列になり、
    // このテストが素通りしてしまう。
    renderList({
      rows: [
        {
          kind: "divider",
          key: "divider:s1",
          id: "s1",
          label: "午前の部",
          startsAt: new Date("2026-09-05T00:00:00Z"),
          startsAtInput: "1999-01-01T00:00",
        },
      ],
    });

    expect(
      screen.getByLabelText("1行目 区切り「午前の部」の開始予定時刻"),
    ).toHaveValue("1999-01-01T00:00");
  });

  it("区切りの保存は itemId・label・startsAt を送る", async () => {
    // サーバ側（update-divider/handler.ts）が読む項目名と、この画面が出す
    // 項目名の対応はどちらか片方を直しただけでは型で落ちない。
    // 実際に送られる FormData をここで固定する。
    const sent: FormData[] = [];
    renderList({
      rows: [
        {
          kind: "divider",
          key: "divider:s1",
          id: "s1",
          label: "午前の部",
          startsAt: null,
          startsAtInput: "",
        },
      ],
      updateDividerAction: recordingAction(sent),
    });

    const label = screen.getByLabelText("1行目 区切り「午前の部」の見出し");
    await userEvent.clear(label);
    await userEvent.type(label, "午後の部");
    fireEvent.change(
      screen.getByLabelText("1行目 区切り「午前の部」の開始予定時刻"),
      { target: { value: "2026-09-05T13:00" } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "1行目 区切り「午前の部」を保存" }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].get("slug")).toBe("acme");
    expect(sent[0].get("tournamentId")).toBe("t1");
    expect(sent[0].get("itemId")).toBe("s1");
    expect(sent[0].get("label")).toBe("午後の部");
    expect(sent[0].get("startsAt")).toBe("2026-09-05T13:00");
  });

  it("区切りの削除は itemId を送る", async () => {
    const sent: FormData[] = [];
    renderList({ removeDividerAction: recordingAction(sent) });

    await userEvent.click(
      screen.getByRole("button", { name: "1行目 区切り「午前の部」を削除" }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].get("slug")).toBe("acme");
    expect(sent[0].get("tournamentId")).toBe("t1");
    expect(sent[0].get("itemId")).toBe("s1");
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
        startsAtInput: "",
      },
      {
        kind: "divider",
        key: "divider:s2",
        id: "s2",
        label: "区切り",
        startsAt: null,
        startsAtInput: "",
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

  it("並べ替えにならないドロップでは何も送らない", async () => {
    // 行の外で離した場合。並びは変わっていないので、保存を投げると
    // 無意味な書き込みと再検証だけが走る。
    const sent: FormData[] = [];
    const reorderAction = async (_state: ScheduleFormState, data: FormData) => {
      sent.push(data);
      return { error: null };
    };
    renderList({ reorderAction });

    await dropOn("match:dA:m1-0", null);
    await dropOn("match:dA:m1-0", "match:dA:m1-0");

    expect(sent).toEqual([]);
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

  it("挿入中は挿入ボタンをすべて止める", async () => {
    // useActionState は dispatch を積むので、連打した回数だけ区切りが増える。
    let finish: (state: ScheduleFormState) => void = () => {};
    let calls = 0;
    const insertDividerAction = () => {
      calls += 1;
      return new Promise<ScheduleFormState>((resolve) => {
        finish = resolve;
      });
    };
    renderList({ insertDividerAction });

    const head = screen.getByRole("button", { name: "先頭に区切りを挿入" });
    await userEvent.click(head);

    for (const button of screen.getAllByRole("button", {
      name: /区切りを挿入$/,
    })) {
      expect(button).toBeDisabled();
    }

    await userEvent.click(head);
    expect(calls).toBe(1);

    await act(async () => {
      finish({ error: null });
    });

    expect(head).toBeEnabled();
  });

  it("並べ替えに失敗したら理由を出す", async () => {
    const reorderAction = async (): Promise<ScheduleFormState> => ({
      error: "並べ替えを保存できませんでした",
    });
    renderList({ reorderAction });

    await dropOn("match:dA:m1-0", "divider:s1");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "並べ替えを保存できませんでした",
    );
  });

  it("挿入に失敗したら理由を出す", async () => {
    const insertDividerAction = async (): Promise<ScheduleFormState> => ({
      error: "区切りを追加できませんでした",
    });
    renderList({ insertDividerAction });

    await userEvent.click(
      screen.getByRole("button", { name: "先頭に区切りを挿入" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "区切りを追加できませんでした",
    );
  });
});
