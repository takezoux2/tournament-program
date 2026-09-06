import { Cause, Effect, Exit, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tournamentFindFirst = vi.fn();
const divisionFindMany = vi.fn();
const participantFindMany = vi.fn();
const scheduleItemFindMany = vi.fn();
const scheduleItemDeleteMany = vi.fn();
const scheduleItemCreateMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        tournament: { findFirst: (args: unknown) => tournamentFindFirst(args) },
        division: { findMany: (args: unknown) => divisionFindMany(args) },
        participant: { findMany: (args: unknown) => participantFindMany(args) },
        scheduleItem: {
          findMany: (args: unknown) => scheduleItemFindMany(args),
          deleteMany: (args: unknown) => scheduleItemDeleteMany(args),
          createMany: (args: unknown) => scheduleItemCreateMany(args),
        },
      }),
  },
}));

const { runSchedule } = await import("./schedule-store");
const { ScheduleStaleError } = await import("./errors");

const ids = { organizationId: "o1", tournamentId: "t1" };

const matchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
  ],
};

const entries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

beforeEach(() => {
  tournamentFindFirst.mockReset();
  divisionFindMany.mockReset();
  participantFindMany.mockReset();
  scheduleItemFindMany.mockReset();
  scheduleItemDeleteMany.mockReset();
  scheduleItemCreateMany.mockReset();
  tournamentFindFirst.mockResolvedValue({ id: "t1" });
  divisionFindMany.mockResolvedValue([
    {
      id: "dA",
      name: "男子",
      order: 0,
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig,
    },
  ]);
  participantFindMany.mockResolvedValue([
    { id: "p1", member: { name: "山田" } },
    { id: "p2", member: { name: "佐藤" } },
  ]);
  scheduleItemFindMany.mockResolvedValue([]);
  scheduleItemDeleteMany.mockResolvedValue({ count: 0 });
  scheduleItemCreateMany.mockResolvedValue({ count: 1 });
});

describe("runSchedule", () => {
  it("大会の所有権を where に入れて確かめる", async () => {
    await Effect.runPromise(
      runSchedule(ids, (rows) => ({ next: rows, value: null })),
    );

    expect(tournamentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", organizationId: "o1" } }),
    );
  });

  it("大会が無ければ found: false にする", async () => {
    tournamentFindFirst.mockResolvedValue(null);

    const outcome = await Effect.runPromise(
      runSchedule(ids, (rows) => ({ next: rows, value: null })),
    );

    expect(outcome).toEqual({ found: false });
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
  });

  it("全行を消してから 0 始まりで振り直す", async () => {
    await Effect.runPromise(
      runSchedule(ids, (rows) => ({
        next: [
          {
            kind: "divider",
            key: "divider:s9",
            id: "s9",
            label: "午前の部",
            startsAt: null,
            startsAtInput: "",
          },
          ...rows,
        ],
        value: null,
      })),
    );

    expect(scheduleItemDeleteMany).toHaveBeenCalledWith({
      where: { tournamentId: "t1" },
    });
    const created = scheduleItemCreateMany.mock.calls[0][0].data;
    expect(created).toEqual([
      {
        id: "s9",
        tournamentId: "t1",
        order: 0,
        kind: "DIVIDER",
        divisionId: null,
        matchId: null,
        label: "午前の部",
        startsAt: null,
      },
      {
        id: expect.any(String),
        tournamentId: "t1",
        order: 1,
        kind: "MATCH",
        divisionId: "dA",
        matchId: "m1-0",
        label: null,
        startsAt: null,
      },
    ]);
  });

  it("next が null なら何も書かない", async () => {
    const outcome = await Effect.runPromise(
      runSchedule(ids, () => ({ next: null, value: "そのまま" })),
    );

    expect(outcome).toEqual({ found: true, value: "そのまま" });
    expect(scheduleItemDeleteMany).not.toHaveBeenCalled();
    expect(scheduleItemCreateMany).not.toHaveBeenCalled();
  });

  it("mutate が投げたドメインエラーはそのまま通す", async () => {
    const exit = await Effect.runPromiseExit(
      runSchedule(ids, () => {
        throw new ScheduleStaleError({ tournamentId: "t1" });
      }),
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
