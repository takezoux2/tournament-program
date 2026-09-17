import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { updateDividerInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const rows: ScheduleRowView[] = [
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子",
    matchId: "m1-0",
    matchName: "1",
    label: "1回戦 第1試合",
    card: "山田 vs 佐藤",
  },
  {
    kind: "divider",
    key: "divider:s1",
    id: "s1",
    label: "午前の部",
    startsAt: null,
    startsAtInput: "",
  },
];

const applyMutate = (): {
  next: ScheduleRowView[] | null;
  value: null;
} => {
  const mutate = runSchedule.mock.calls[0][1] as (rows: ScheduleRowView[]) => {
    next: ScheduleRowView[] | null;
    value: null;
  };
  return mutate(rows);
};

beforeEach(() => {
  runSchedule.mockReset();
  runSchedule.mockReturnValue(Effect.succeed({ found: true, value: null }));
});

describe("updateDividerInDb", () => {
  it("ラベルと開始予定時刻を差し替える", async () => {
    // ローカル時刻で組み立てる。startsAtInput はローカル時刻の文字列なので、
    // UTC 指定だと実行環境の時刻帯で期待値が変わってしまう。
    const startsAt = new Date(2026, 8, 5, 9, 0);
    await Effect.runPromise(
      updateDividerInDb(ids, {
        itemId: "s1",
        label: "午後の部",
        startsAt,
      }),
    );

    const next = applyMutate().next;
    expect(next?.[1]).toEqual({
      kind: "divider",
      key: "divider:s1",
      id: "s1",
      label: "午後の部",
      startsAt,
      startsAtInput: "2026-09-05T09:00",
    });
    // 対象外の行は差し替わっていないこと。
    expect(next?.[0]).toEqual(rows[0]);
  });

  it("知らない itemId は ScheduleItemNotFoundError を投げる", async () => {
    await Effect.runPromise(
      updateDividerInDb(ids, {
        itemId: "s9",
        label: "午後の部",
        startsAt: null,
      }),
    );

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleItemNotFoundError" }),
    );
  });
});
