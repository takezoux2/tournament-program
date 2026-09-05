import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleRowView } from "../types";

const runSchedule = vi.fn();

vi.mock("../schedule-store", () => ({
  runSchedule: (ids: unknown, mutate: unknown) => runSchedule(ids, mutate),
}));

const { reorderScheduleInDb } = await import("./repository");

const ids = { organizationId: "o1", tournamentId: "t1" };

const rows: ScheduleRowView[] = [
  {
    kind: "match",
    key: "match:dA:m1-0",
    divisionId: "dA",
    divisionName: "男子",
    matchId: "m1-0",
    matchNumber: "1",
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

/** runSchedule に渡された mutate を、上の行に対して実行する。 */
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

describe("reorderScheduleInDb", () => {
  it("所有権の組をそのまま store へ渡す", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["divider:s1", "match:dA:m1-0"] }),
    );

    expect(runSchedule.mock.calls[0][0]).toEqual(ids);
  });

  it("送られたキー順に並べ替える", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["divider:s1", "match:dA:m1-0"] }),
    );

    expect(applyMutate().next?.map((row) => row.key)).toEqual([
      "divider:s1",
      "match:dA:m1-0",
    ]);
  });

  it("キー集合が一致しなければ ScheduleStaleError を投げる", async () => {
    await Effect.runPromise(
      reorderScheduleInDb(ids, { keys: ["match:dA:m1-0"] }),
    );

    expect(() => applyMutate()).toThrowError(
      expect.objectContaining({ _tag: "ScheduleStaleError" }),
    );
  });

  it("store のエラーはそのまま伝わる", async () => {
    const { ScheduleStaleError } = await import("../errors");
    runSchedule.mockReturnValue(
      Effect.fail(new ScheduleStaleError({ tournamentId: "t1" })),
    );

    const exit = await Effect.runPromiseExit(
      reorderScheduleInDb(ids, { keys: ["match:dA:m1-0"] }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("ScheduleStaleError");
      }
    }
  });
});
