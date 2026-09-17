import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { insertDividerInDb } = await import("./repository");

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

describe("insertDividerInDb", () => {
  it("アンカーの直後に既定ラベルの区切りを挿す", async () => {
    await Effect.runPromise(
      insertDividerInDb(ids, { anchorKey: "match:dA:m1-0" }),
    );

    const next = applyMutate().next;
    expect(next?.map((row) => row.kind)).toEqual(["match", "divider"]);
    expect(next?.[1]).toEqual(
      expect.objectContaining({ label: "区切り", startsAt: null }),
    );
  });

  it("空文字のアンカーは先頭に挿す", async () => {
    await Effect.runPromise(insertDividerInDb(ids, { anchorKey: "" }));

    expect(applyMutate().next?.map((row) => row.kind)).toEqual([
      "divider",
      "match",
    ]);
  });

  it("知らないアンカーは ScheduleStaleError を投げる", async () => {
    await Effect.runPromise(
      insertDividerInDb(ids, { anchorKey: "match:dZ:m9-9" }),
    );

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleStaleError" }),
    );
  });
});
