import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DivisionFormAction } from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { MatchResultList } from "./MatchResultList";

const action = vi.fn<DivisionFormAction>(async () => ({ error: null }));
// 詳細フォームの配線は MatchResultDetailForm.test.tsx 側で見るので、
// ここでは呼ばれないことだけ確認できれば十分なダミーにする。
const detailAction = vi.fn<DivisionFormAction>(async () => ({ error: null }));

const trackEvent = vi.fn();

vi.mock("@/shared/lib/analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const matchRow = (
  overrides: Partial<Extract<ResultRowView, { kind: "match" }>> = {},
): ResultRowView => ({
  kind: "match",
  key: "match:d1:m1-0",
  divisionId: "d1",
  divisionName: "男子",
  matchId: "m1-0",
  matchName: "1",
  label: "1回戦 第1試合",
  slots: [
    { label: "山田", entryId: "e1" },
    { label: "佐藤", entryId: "e2" },
  ],
  winnerEntryId: null,
  state: "ready",
  downstreamRecordedCount: 0,
  resultConfig: {
    version: 1,
    winReason: { enabled: false, options: [] },
    score: { enabled: false, count: 3, aggregation: "sum" },
    note: { enabled: false },
  },
  winReason: null,
  scores: [],
  note: null,
  ...overrides,
});

const renderList = (rows: ResultRowView[]) =>
  render(
    <MatchResultList
      rows={rows}
      slug="tennis"
      tournamentId="t1"
      action={action}
      detailAction={detailAction}
    />,
  );

beforeEach(() => {
  action.mockClear();
  vi.restoreAllMocks();
});

describe("MatchResultList", () => {
  it("押した側を勝者として送る", async () => {
    const user = userEvent.setup();
    renderList([matchRow()]);

    await user.click(screen.getByRole("button", { name: "男子 1 佐藤の勝ち" }));

    expect(action).toHaveBeenCalled();
    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("slug")).toBe("tennis");
    expect(formData.get("tournamentId")).toBe("t1");
    expect(formData.get("divisionId")).toBe("d1");
    expect(formData.get("matchId")).toBe("m1-0");
    expect(formData.get("winnerEntryId")).toBe("e2");
  });

  it("記録済みの行は勝者が押された状態になり、取り消しを出す", () => {
    renderList([matchRow({ state: "recorded", winnerEntryId: "e1" })]);

    expect(
      screen.getByRole("button", { name: "男子 1 山田の勝ち" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "男子 1の結果を取り消す" }),
    ).toBeInTheDocument();
  });

  it("未確定の行は押せない", () => {
    renderList([
      matchRow({
        state: "waiting",
        slots: [
          { label: "第1試合の勝者", entryId: null },
          { label: "佐藤", entryId: "e2" },
        ],
      }),
    ]);

    expect(
      screen.getByRole("button", { name: "男子 1 佐藤の勝ち" }),
    ).toBeDisabled();
    expect(screen.getByText("第1試合の勝者")).toBeInTheDocument();
  });

  it("不戦勝の行は両方のボタンが押せない", () => {
    renderList([
      matchRow({
        state: "bye",
        slots: [
          { label: "山田", entryId: "e1" },
          { label: "BYE", entryId: null },
        ],
      }),
    ]);

    expect(
      screen.getByRole("button", { name: "男子 1 山田の勝ち" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "男子 1 BYEの勝ち" }),
    ).toBeDisabled();
  });

  it("下流の記録があるときだけ確認してから送る", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderList([
      matchRow({
        state: "recorded",
        winnerEntryId: "e1",
        downstreamRecordedCount: 2,
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "男子 1 佐藤の勝ち" }));

    expect(confirm).toHaveBeenCalledWith(
      "この試合の結果を変えると、あとの試合の結果 2 件も取り消されます。よろしいですか？",
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("既に勝者になっている側を押し直したときは確認しない", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderList([
      matchRow({
        state: "recorded",
        winnerEntryId: "e1",
        downstreamRecordedCount: 2,
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "男子 1 山田の勝ち" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
  });

  it("下流の記録が無ければ確認しない", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderList([matchRow()]);

    await user.click(screen.getByRole("button", { name: "男子 1 山田の勝ち" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
  });

  it("取り消しは空文字を送る", async () => {
    const user = userEvent.setup();
    renderList([matchRow({ state: "recorded", winnerEntryId: "e1" })]);

    await user.click(
      screen.getByRole("button", { name: "男子 1の結果を取り消す" }),
    );

    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("winnerEntryId")).toBe("");
  });

  it("保存中はボタンが無効になる", async () => {
    // let だと閉じたスコープ内の代入が外側で never に絞り込まれてしまうため、
    // オブジェクトのプロパティ越しに保持する。
    const deferred: {
      resolve: ((value: { error: string | null }) => void) | null;
    } = { resolve: null };
    const pendingAction = vi.fn<DivisionFormAction>(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <MatchResultList
        rows={[matchRow()]}
        slug="tennis"
        tournamentId="t1"
        action={pendingAction}
        detailAction={detailAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "男子 1 山田の勝ち" }));

    expect(
      await screen.findByRole("button", { name: "男子 1 山田の勝ち" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "男子 1 佐藤の勝ち" }),
    ).toBeDisabled();

    // act 警告を避けるため、テストを終える前に保留中の action を解決しておく。
    deferred.resolve?.({ error: null });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "男子 1 山田の勝ち" }),
      ).not.toBeDisabled(),
    );
  });

  it("区切りは見出しとして出す", () => {
    renderList([
      { kind: "divider", key: "divider:x1", label: "午前の部", startsAt: null },
      matchRow(),
    ]);

    expect(screen.getByText("午前の部")).toBeInTheDocument();
  });

  it("試合が無ければその旨を出す", () => {
    renderList([]);

    expect(screen.getByText("まだ試合がありません")).toBeInTheDocument();
  });

  it("位置の文言が空の行（リーグ）は部門名だけを出す", () => {
    renderList([matchRow({ divisionName: "女子リーグ", label: "" })]);

    expect(screen.getByText("女子リーグ")).toBeInTheDocument();
    expect(screen.queryByText(/女子リーグ \//)).toBeNull();
  });
});

describe("MatchResultList の GA イベント", () => {
  /** 呼ばれるたび succeeded を増やす、成功し続けるアクション */
  const succeedingAction: DivisionFormAction = async (prev) => ({
    error: null,
    succeeded: (prev.succeeded ?? 0) + 1,
  });

  const failingAction: DivisionFormAction = async () => ({
    error: "記録できませんでした",
  });

  const renderWith = (rowAction: DivisionFormAction) =>
    render(
      <MatchResultList
        rows={[matchRow()]}
        slug="tennis"
        tournamentId="t1"
        action={rowAction}
        detailAction={detailAction}
      />,
    );

  beforeEach(() => {
    trackEvent.mockReset();
  });

  it("初期表示では送らない", () => {
    renderWith(succeedingAction);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("結果の登録に成功したら record_result を送る", async () => {
    const user = userEvent.setup();
    renderWith(succeedingAction);

    await user.click(screen.getByRole("button", { name: "男子 1 山田の勝ち" }));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("record_result"),
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("同じ行で 2 回成功したら 2 回送る", async () => {
    const user = userEvent.setup();
    renderWith(succeedingAction);

    const button = screen.getByRole("button", {
      name: "男子 1 山田の勝ち",
    });

    await user.click(button);
    await waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(1));

    await user.click(button);
    await waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(2));
  });

  it("失敗したときは送らない", async () => {
    const user = userEvent.setup();
    renderWith(failingAction);

    await user.click(screen.getByRole("button", { name: "男子 1 山田の勝ち" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
