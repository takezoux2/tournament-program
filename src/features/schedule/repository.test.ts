import { beforeEach, describe, expect, it, vi } from "vitest";

const divisionFindMany = vi.fn();
const participantFindMany = vi.fn();
const scheduleItemFindMany = vi.fn();

vi.mock("@/shared/db/prisma", () => ({
  prisma: {
    division: { findMany: (args: unknown) => divisionFindMany(args) },
    participant: { findMany: (args: unknown) => participantFindMany(args) },
    scheduleItem: { findMany: (args: unknown) => scheduleItemFindMany(args) },
  },
}));

const { loadResultRows, loadScheduleView } = await import("./repository");

const matchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      matchName: "1",
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
  divisionFindMany.mockReset();
  participantFindMany.mockReset();
  scheduleItemFindMany.mockReset();
  divisionFindMany.mockResolvedValue([
    {
      id: "dA",
      name: "男子",
      order: 0,
      format: "SINGLE_ELIMINATION",
      entries,
      matchingConfig,
      results: { version: 1, matches: [] },
    },
  ]);
  participantFindMany.mockResolvedValue([
    { id: "p1", member: { name: "山田" } },
    { id: "p2", member: { name: "佐藤" } },
  ]);
  scheduleItemFindMany.mockResolvedValue([]);
});

describe("loadScheduleView", () => {
  it("3 つのクエリすべてに所有条件を入れる", async () => {
    await loadScheduleView("o1", "t1");

    expect(divisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    expect(participantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
    expect(scheduleItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
        orderBy: { order: "asc" },
      }),
    );
  });

  it("参加者名を解決した行を返す", async () => {
    const rows = await loadScheduleView("o1", "t1");

    expect(rows).toEqual([
      {
        kind: "match",
        key: "match:dA:m1-0",
        divisionId: "dA",
        divisionName: "男子",
        matchId: "m1-0",
        matchName: "1",
        label: "1回戦 (1)",
        card: "山田 vs 佐藤",
      },
    ]);
  });

  it("壊れた ScheduleItem 行は落とす", async () => {
    scheduleItemFindMany.mockResolvedValue([
      {
        id: "s1",
        kind: "MATCH",
        divisionId: null,
        matchId: null,
        label: null,
        startsAt: null,
      },
    ]);

    const rows = await loadScheduleView("o1", "t1");

    expect(rows.map((row) => row.key)).toEqual(["match:dA:m1-0"]);
  });
});

describe("loadResultRows", () => {
  it("進行順の行を結果入力用の形にして返す", async () => {
    const rows = await loadResultRows("o1", "t1");

    expect(rows).toEqual([
      {
        kind: "match",
        key: "match:dA:m1-0",
        divisionId: "dA",
        divisionName: "男子",
        matchId: "m1-0",
        matchName: "1",
        label: "1回戦 (1)",
        slots: [
          { label: "山田", entryId: "e1" },
          { label: "佐藤", entryId: "e2" },
        ],
        winnerEntryId: null,
        state: "ready",
        downstreamRecordedCount: 0,
      },
    ]);
  });

  it("部門の読み出しに所有条件を入れる", async () => {
    await loadResultRows("o1", "t1");

    expect(divisionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { id: "t1", organizationId: "o1" } },
      }),
    );
  });
});
