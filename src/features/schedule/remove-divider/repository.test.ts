import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { removeDividerInDb } = await import("./repository");

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

describe("removeDividerInDb", () => {
  it("対象の区切りを取り除き、残りの行を詰める", async () => {
    await Effect.runPromise(removeDividerInDb(ids, { itemId: "s1" }));

    const next = applyMutate().next;
    // 区切りが取り除かれ、残った試合行だけになること。
    expect(next).toEqual([rows[0]]);
  });

  it("知らない itemId は ScheduleItemNotFoundError を投げる", async () => {
    await Effect.runPromise(removeDividerInDb(ids, { itemId: "s9" }));

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleItemNotFoundError" }),
    );
  });
});
